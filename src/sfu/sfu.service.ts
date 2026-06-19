import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Type aliases — mediasoup uses native C++ bindings, only available after
// compilation with GCC >= 10.  These 'any' aliases keep the codebase
// compilable on machines where mediasoup is not yet built.
// When mediasoup IS installed the real types are used at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediasoupTypes = any;

/**
 * SFU Room Manager — abstracts MediaSoup worker/router/transport management.
 *
 * MediaSoup requires GCC 10+ to compile from source.
 * Install guide: https://mediasoup.org/documentation/v3/mediasoup/installation/
 *
 * For environments with GCC <10, install via prebuilt binary:
 *   MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD=false npm install mediasoup
 * Or use Docker with a newer GCC toolchain.
 *
 * This service loads mediasoup dynamically so the app starts even if the
 * native binary is not yet compiled (graceful degradation for group calls).
 */

export interface RoomInfo {
  roomId: string;
  routerRtpCaps: unknown; // mediasoup RtpCapabilities
  participantCount: number;
}

@Injectable()
export class SfuService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SfuService.name);
  private mediasoup: MediasoupTypes | null = null;
  private workers: MediasoupTypes[] = [];
  private workerIndex = 0;
  private readonly rooms = new Map<
    string,
    {
      router: MediasoupTypes;
      transports: Map<string, MediasoupTypes>;
      producers: Map<string, MediasoupTypes>;
      consumers: Map<string, MediasoupTypes>;
      participants: Set<string>;
    }
  >();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      // Dynamic require — graceful degradation if mediasoup not installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.mediasoup = require('mediasoup');
      await this.spawnWorkers();
      this.logger.log(`MediaSoup initialised with ${this.workers.length} workers`);
    } catch {
      this.logger.warn(
        'MediaSoup not available — group calls disabled. Install mediasoup to enable.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.workers.forEach((w) => w.close());
  }

  private async spawnWorkers(): Promise<void> {
    if (!this.mediasoup) return;
    const numCpu = require('os').cpus().length;
    const numWorkers = Math.max(1, Math.min(numCpu, 4));

    for (let i = 0; i < numWorkers; i++) {
      const worker = await this.mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: this.config.get<number>('MEDIASOUP_MIN_PORT', 40000),
        rtcMaxPort: this.config.get<number>('MEDIASOUP_MAX_PORT', 49999),
      });
      worker.on('died', () => {
        this.logger.error(`MediaSoup worker ${worker.pid} died — replacing`);
        this.replaceWorker(worker);
      });
      this.workers.push(worker);
    }
  }

  private async replaceWorker(dead: MediasoupTypes): Promise<void> {
    const idx = this.workers.indexOf(dead);
    if (idx === -1 || !this.mediasoup) return;
    const worker = await this.mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: this.config.get<number>('MEDIASOUP_MIN_PORT', 40000),
      rtcMaxPort: this.config.get<number>('MEDIASOUP_MAX_PORT', 49999),
    });
    this.workers[idx] = worker;
  }

  private nextWorker(): MediasoupTypes | null {
    if (!this.workers.length) return null;
    const w = this.workers[this.workerIndex % this.workers.length];
    this.workerIndex++;
    return w;
  }

  isAvailable(): boolean {
    return this.mediasoup !== null && this.workers.length > 0;
  }

  // ── Room lifecycle ─────────────────────────────────────────────────────────

  async createRoom(roomId: string): Promise<RoomInfo> {
    if (!this.mediasoup || !this.workers.length) {
      throw new Error('MediaSoup not available');
    }

    const worker = this.nextWorker()!;
    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: { 'x-google-start-bitrate': 1000 },
        },
        {
          kind: 'video',
          mimeType: 'video/H264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
          },
        },
      ],
    });

    this.rooms.set(roomId, {
      router,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      participants: new Set(),
    });

    return {
      roomId,
      routerRtpCaps: router.rtpCapabilities,
      participantCount: 0,
    };
  }

  async createWebRtcTransport(roomId: string, peerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    const transport = await room.router.createWebRtcTransport({
      listenIps: [
        {
          ip: this.config.get<string>('MEDIASOUP_LISTEN_IP', '0.0.0.0'),
          announcedIp: this.config.get<string>('MEDIASOUP_ANNOUNCED_IP', '127.0.0.1'),
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1_000_000,
    });

    room.transports.set(`${peerId}:${transport.id}`, transport);
    room.participants.add(peerId);

    return {
      transportId: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    roomId: string,
    transportId: string,
    dtlsParameters: MediasoupTypes,
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    for (const [, t] of room.transports) {
      if (t.id === transportId) {
        await t.connect({ dtlsParameters });
        return;
      }
    }
    throw new Error(`Transport ${transportId} not found`);
  }

  async produce(
    roomId: string,
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: MediasoupTypes,
    peerId: string,
  ) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    let transport: MediasoupTypes | undefined;
    for (const [, t] of room.transports) {
      if (t.id === transportId) {
        transport = t;
        break;
      }
    }
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const producer = await transport.produce({ kind, rtpParameters });
    room.producers.set(producer.id, producer);

    return { producerId: producer.id };
  }

  async consume(
    roomId: string,
    peerId: string,
    producerId: string,
    rtpCapabilities: MediasoupTypes,
    transportId: string,
  ) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume — incompatible RTP capabilities');
    }

    let transport: MediasoupTypes | undefined;
    for (const [, t] of room.transports) {
      if (t.id === transportId) {
        transport = t;
        break;
      }
    }
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // start paused — client resumes after UI ready
    });

    room.consumers.set(consumer.id, consumer);

    return {
      consumerId: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async resumeConsumer(roomId: string, consumerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    const consumer = room.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer ${consumerId} not found`);
    await consumer.resume();
  }

  async removeParticipant(roomId: string, peerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.participants.delete(peerId);

    // Close transports belonging to this peer
    for (const [key, transport] of room.transports) {
      if (key.startsWith(`${peerId}:`)) {
        transport.close();
        room.transports.delete(key);
      }
    }

    if (room.participants.size === 0) {
      room.router.close();
      this.rooms.delete(roomId);
    }
  }

  getRoomInfo(roomId: string): RoomInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      roomId,
      routerRtpCaps: room.router.rtpCapabilities,
      participantCount: room.participants.size,
    };
  }
}
