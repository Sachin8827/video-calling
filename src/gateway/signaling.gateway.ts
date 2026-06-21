import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { CallsService } from '../calls/calls.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { ContactsService } from '../contacts/contacts.service';
import { SfuService } from '../sfu/sfu.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit-event.enum';

/** Metadata stored per connected socket. */
interface SocketMeta {
  userId?: string;
  anonymousId: string;
  callId?: string;
  roomId?: string;
  ipAddress: string;
  userAgent: string;
}

@WebSocketGateway({
  namespace: '/signal',
  cors: {
    origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
  },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SignalingGateway.name);

  /** socket.id → SocketMeta */
  private readonly sockets = new Map<string, SocketMeta>();
  /** userId → Set of socket.ids (supports multiple tabs) */
  private readonly userSockets = new Map<string, Set<string>>();
  /** callId → targetUserId (for authorization on accept) */
  private readonly pendingCallTargets = new Map<string, string>();
  /** callId → missed-call timeout handle (so we can cancel it) */
  private readonly missedCallTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly callsService: CallsService,
    private readonly matchmaking: MatchmakingService,
    private readonly contactsService: ContactsService,
    private readonly sfuService: SfuService,
    private readonly auditService: AuditService,
  ) { }

  // ── Connection ───────────────────────────────────────────────────────────

  async handleConnection(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token as string | undefined;
    const ipAddress =
      (socket.handshake.headers['x-forwarded-for'] as string) ??
      socket.handshake.address ??
      'unknown';
    const userAgent = (socket.handshake.headers['user-agent'] as string) ?? '';

    let userId: string | undefined;

    if (token) {
      try {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        userId = payload.sub?.trim() || undefined;
        if (userId) {
          // Support multiple tabs: add socket to user's set
          const existing = this.userSockets.get(userId);
          if (existing) {
            existing.add(socket.id);
          } else {
            this.userSockets.set(userId, new Set([socket.id]));
          }
        }
      } catch {
        // Invalid token — treat as anonymous
      }
    }

    const meta: SocketMeta = {
      userId,
      anonymousId: uuidv4(),
      ipAddress,
      userAgent,
    };
    this.sockets.set(socket.id, meta);

    this.logger.log(`Socket connected: ${socket.id} userId=${userId ?? 'anon'} ip=${ipAddress}`);
    await this.broadcastQueueStatus();
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const meta = this.sockets.get(socket.id);
    if (!meta) return;

    this.logger.log(`Socket disconnected: ${socket.id} userId=${meta.userId ?? 'anon'} callId=${meta.callId ?? 'none'}`);

    // Clean up matchmaking queue
    await this.matchmaking.dequeue(socket.id);

    // End any active call (BUG-5 fix: works for anonymous AND registered users)
    if (meta.callId) {
      await this.callsService.endCall({
        callId: meta.callId,
        userId: meta.userId ?? meta.anonymousId,
        anonymousId: meta.userId ? undefined : meta.anonymousId,
        reason: 'ended',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      this.server
        .to(meta.callId)
        .emit('call:ended', { callId: meta.callId, reason: 'peer_disconnected' });

      // Cancel any pending missed-call timer
      const timer = this.missedCallTimers.get(meta.callId);
      if (timer) {
        clearTimeout(timer);
        this.missedCallTimers.delete(meta.callId);
      }
    }

    // Remove from SFU room if applicable
    if (meta.roomId) {
      await this.sfuService.removeParticipant(meta.roomId, socket.id);
      socket.to(meta.roomId).emit('participant:left', { socketId: socket.id });
    }

    // Remove from userSockets set (BUG-8 fix: multi-tab aware)
    if (meta.userId) {
      const socketSet = this.userSockets.get(meta.userId);
      if (socketSet) {
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          this.userSockets.delete(meta.userId);
        }
      }
    }
    this.sockets.delete(socket.id);
    await this.broadcastQueueStatus();
  }

  // ── 1:1 Call Events ──────────────────────────────────────────────────────

  /** Initiate a call to a specific registered user. */
  @SubscribeMessage('call:initiate')
  async onCallInitiate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { targetUserId: string; callType: 'voice' | 'video' },
  ) {
    const meta = this.getMeta(socket);
    this.logger.log(`call:initiate request from ${socket.id} target=${data.targetUserId} callType=${data.callType}`);

    const session = await this.callsService.initiateCall({
      initiatorId: meta.userId ?? meta.anonymousId,
      anonymousId: meta.userId ? undefined : meta.anonymousId,
      callType: data.callType,
      isAnonymous: !meta.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    meta.callId = session.id;
    await socket.join(session.id); // use callId as room

    // Track intended target for authorization on accept (BUG-9 fix)
    this.pendingCallTargets.set(session.id, data.targetUserId);
    this.logger.log(`call:initiate created session ${session.id} pendingTarget=${data.targetUserId}`);

    // Notify target if online (use first socket from their set)
    const targetSocketSet = this.userSockets.get(data.targetUserId);
    if (targetSocketSet && targetSocketSet.size > 0) {
      // Notify ALL of the target's tabs
      for (const sid of targetSocketSet) {
        this.server.to(sid).emit('call:incoming', {
          callId: session.id,
          callerId: meta.userId,
          callType: data.callType,
        });
      }
    }

    // BUG-6 fix: Always set missed-call timeout (not just when offline)
    const timer = setTimeout(async () => {
      this.missedCallTimers.delete(session.id);
      this.pendingCallTargets.delete(session.id);
      const s = await this.callsService.getCallById(session.id).catch(() => null);
      if (s?.status === 'initiated') {
        await this.callsService.endCall({
          callId: session.id,
          userId: meta.userId ?? meta.anonymousId,
          anonymousId: meta.userId ? undefined : meta.anonymousId,
          reason: 'missed',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        socket.emit('call:missed', { callId: session.id });
      }
    }, 30_000);
    this.missedCallTimers.set(session.id, timer);

    return { callId: session.id };
  }

  @SubscribeMessage('call:accept')
  async onCallAccept(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; callType: 'voice' | 'video' },
  ) {
    const meta = this.getMeta(socket);
    this.logger.log(`call:accept request from ${socket.id} callId=${data.callId} callType=${data.callType}`);
    if (!meta.userId) throw new WsException('Authentication required');

    // BUG-9 fix: Verify the acceptor is the intended target
    const expectedTarget = this.pendingCallTargets.get(data.callId);
    if (expectedTarget && expectedTarget !== meta.userId) {
      throw new WsException('You are not the intended recipient of this call');
    }

    await this.callsService.acceptCall({
      callId: data.callId,
      userId: meta.userId,
      callType: data.callType,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    meta.callId = data.callId;
    await socket.join(data.callId);

    // Cancel missed-call timer since the call was answered
    const timer = this.missedCallTimers.get(data.callId);
    if (timer) {
      clearTimeout(timer);
      this.missedCallTimers.delete(data.callId);
    }
    this.pendingCallTargets.delete(data.callId);

    this.server.to(data.callId).emit('call:accepted', { callId: data.callId });
    this.logger.log(`call:accepted emitted for ${data.callId}`);
    return { ok: true };
  }

  @SubscribeMessage('call:reject')
  async onCallReject(@ConnectedSocket() socket: Socket, @MessageBody() data: { callId: string }) {
    const meta = this.getMeta(socket);
    this.logger.log(`call:reject request from ${socket.id} callId=${data.callId}`);
    if (!meta.userId) throw new WsException('Authentication required');

    await this.callsService.endCall({
      callId: data.callId,
      userId: meta.userId,
      reason: 'rejected',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Cancel missed-call timer
    const timer = this.missedCallTimers.get(data.callId);
    if (timer) {
      clearTimeout(timer);
      this.missedCallTimers.delete(data.callId);
    }
    this.pendingCallTargets.delete(data.callId);

    this.server.to(data.callId).emit('call:rejected', { callId: data.callId });
    this.logger.log(`call:rejected emitted for ${data.callId}`);
    return { ok: true };
  }

  @SubscribeMessage('call:end')
  async onCallEnd(@ConnectedSocket() socket: Socket, @MessageBody() data: { callId: string }) {
    const meta = this.getMeta(socket);
    this.logger.log(`call:end request from ${socket.id} callId=${data.callId}`);

    await this.callsService.endCall({
      callId: data.callId,
      userId: meta.userId ?? meta.anonymousId,
      anonymousId: meta.userId ? undefined : meta.anonymousId,
      reason: 'ended',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Cancel missed-call timer
    const timer = this.missedCallTimers.get(data.callId);
    if (timer) {
      clearTimeout(timer);
      this.missedCallTimers.delete(data.callId);
    }
    this.pendingCallTargets.delete(data.callId);

    this.server.to(data.callId).emit('call:ended', { callId: data.callId, reason: 'ended' });
    this.logger.log(`call:ended emitted for ${data.callId}`);
    socket.leave(data.callId);
    meta.callId = undefined;
    return { ok: true };
  }

  // ── WebRTC Signaling (SDP / ICE relay) ───────────────────────────────────

  @SubscribeMessage('signal:offer')
  onOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; sdp: unknown },
  ) {
    socket.to(data.callId).emit('signal:offer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('signal:answer')
  onAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; sdp: unknown },
  ) {
    socket.to(data.callId).emit('signal:answer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('signal:ice')
  onIce(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; candidate: unknown },
  ) {
    socket.to(data.callId).emit('signal:ice', { callId: data.callId, candidate: data.candidate });
  }

  // ── Media Controls ────────────────────────────────────────────────────────

  @SubscribeMessage('media:toggle')
  async onMediaToggle(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; mic?: boolean; camera?: boolean },
  ) {
    const meta = this.getMeta(socket);

    await this.callsService.toggleMedia({
      callId: data.callId,
      userId: meta.userId ?? meta.anonymousId,
      anonymousId: meta.userId ? undefined : meta.anonymousId,
      mic: data.mic,
      camera: data.camera,
    });

    socket.to(data.callId).emit('participant:media', {
      socketId: socket.id,
      userId: meta.userId,
      mic: data.mic,
      camera: data.camera,
    });

    return { ok: true };
  }

  /** Switch mid-call: voice → video or video → voice. */
  @SubscribeMessage('call:switch-type')
  async onSwitchType(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; newType: 'voice' | 'video' },
  ) {
    const meta = this.getMeta(socket);
    await this.callsService.toggleCallType({
      callId: data.callId,
      userId: meta.userId ?? meta.anonymousId,
      newType: data.newType,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    this.server.to(data.callId).emit('call:type-changed', {
      callId: data.callId,
      newType: data.newType,
    });

    return { ok: true };
  }

  // ── Anonymous Matchmaking ─────────────────────────────────────────────────

  @SubscribeMessage('match:join-queue')
  async onJoinQueue(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { preferredType?: 'voice' | 'video' },
  ) {
    const meta = this.getMeta(socket);
    this.logger.log(`match:join-queue from ${socket.id} preferredType=${data.preferredType}`);

    const position = await this.matchmaking.enqueue({
      userId: meta.userId,
      anonymousId: meta.anonymousId,
      socketId: socket.id,
      preferredType: data.preferredType ?? 'video',
      isAnonymous: !meta.userId,
    });

    const onlineUsers = this.countOnlineUsers();
    const searchingUsers = await this.matchmaking.queueDepth();
    const payload = { position, onlineUsers, searchingUsers };
    this.logger.log(`match:queued payload: ${JSON.stringify(payload)}`);
    socket.emit('match:queued', payload);

    // Try to find a match immediately
    await this.tryPairUsers();
    await this.broadcastQueueStatus();
    return { queued: true, onlineUsers, searchingUsers };
  }

  @SubscribeMessage('match:leave-queue')
  async onLeaveQueue(@ConnectedSocket() socket: Socket) {
    this.logger.log(`match:leave-queue from ${socket.id}`);
    await this.matchmaking.dequeue(socket.id);
    await this.broadcastQueueStatus();
    return { ok: true };
  }

  @SubscribeMessage('match:queue-status-request')
  async onQueueStatusRequest(@ConnectedSocket() socket: Socket) {
    const onlineUsers = this.sockets.size;
    const searchingUsers = await this.matchmaking.queueDepth();
    this.logger.log(`match:queue-status-request => online=${onlineUsers}, searching=${searchingUsers}`);
    socket.emit('match:queue-status', { onlineUsers, searchingUsers });
    return { onlineUsers, searchingUsers };
  }

  private countOnlineUsers(): number {
    const uniqueUsers = new Set<string>();
    for (const meta of this.sockets.values()) {
      uniqueUsers.add(meta.userId ?? meta.anonymousId);
    }
    return uniqueUsers.size;
  }

  private async broadcastQueueStatus(): Promise<void> {
    const onlineUsers = this.countOnlineUsers();
    const searchingUsers = await this.matchmaking.queueDepth();
    this.server.emit('match:queue-status', { onlineUsers, searchingUsers });
  }

  private async tryPairUsers(): Promise<void> {
    try {
      const pair = await this.matchmaking.tryMatch();
      if (!pair) {
        this.logger.log('tryPairUsers: no match available');
        return;
      }

      const [a, b] = pair;
      this.logger.log(`tryPairUsers: matched sockets ${a.socketId} and ${b.socketId}`);
      const callType = a.preferredType === b.preferredType ? a.preferredType : 'video';

      // Create an anonymous call session
      this.logger.log(`tryPairUsers: initiating anonymous call for ${a.socketId} as initiator`);
      const session = await this.callsService.initiateCall({
        initiatorId: a.userId ?? null,
        anonymousId: a.userId ? undefined : a.anonymousId,
        callType,
        isAnonymous: true,
        ipAddress: 'anonymous',
        userAgent: '',
      });
      this.logger.log(`tryPairUsers: call session created ${session.id}`);

      this.logger.log(`tryPairUsers: accepting call for ${b.socketId}`);
      await this.callsService.acceptCall({
        callId: session.id,
        userId: b.userId || b.anonymousId,
        anonymousId: b.userId ? undefined : b.anonymousId,
        isAnonymous: !b.userId,
        callType,
        ipAddress: 'anonymous',
        userAgent: '',
      });
      this.logger.log(`tryPairUsers: call accepted for ${session.id}`);

      // Join both sockets to the call room using the public Socket.IO API.
      await this.server.in(a.socketId).socketsJoin(session.id);
      await this.server.in(b.socketId).socketsJoin(session.id);

      const metaA = this.sockets.get(a.socketId);
      if (metaA) metaA.callId = session.id;
      const metaB = this.sockets.get(b.socketId);
      if (metaB) metaB.callId = session.id;

      // Notify both parties of the match
      const bothRegistered = !!a.userId && !!b.userId;
      this.logger.log(`match:found emit for ${a.socketId} and ${b.socketId} callId=${session.id} initiator=${a.socketId}`);

      this.server.to(a.socketId).emit('match:found', {
        callId: session.id,
        callType,
        isInitiator: true,
        bothRegistered,
        partnerUserId: b.userId,
      });

      this.server.to(b.socketId).emit('match:found', {
        callId: session.id,
        callType,
        isInitiator: false,
        bothRegistered,
        partnerUserId: a.userId,
      });
    } catch (error) {
      const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
      this.logger.error(`tryPairUsers error`, error instanceof Error ? error : new Error(String(error)));
      this.logger.error(`tryPairUsers raw error`, errorDetails);
      console.error('tryPairUsers caught error:', error);
      throw error;
    }
  }

  // ── SFU (Group Calls) ─────────────────────────────────────────────────────

  @SubscribeMessage('sfu:join')
  async onSfuJoin(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomId: string }) {
    if (!this.sfuService.isAvailable()) {
      throw new WsException('Group calls not available — MediaSoup not initialised');
    }

    const meta = this.getMeta(socket);
    let roomInfo = this.sfuService.getRoomInfo(data.roomId);

    if (!roomInfo) {
      roomInfo = await this.sfuService.createRoom(data.roomId);
      await this.auditService.log({
        userId: meta.userId,
        eventType: AuditEventType.ROOM_CREATED,
        payload: { roomId: data.roomId },
        ipAddress: meta.ipAddress,
      });
    }

    meta.roomId = data.roomId;
    await socket.join(data.roomId);

    socket.to(data.roomId).emit('participant:joined', { socketId: socket.id, userId: meta.userId });

    await this.auditService.log({
      userId: meta.userId,
      eventType: AuditEventType.PARTICIPANT_JOINED,
      payload: { roomId: data.roomId },
      ipAddress: meta.ipAddress,
    });

    return { routerRtpCapabilities: roomInfo.routerRtpCaps };
  }

  @SubscribeMessage('sfu:create-transport')
  async onCreateTransport(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const transportParams = await this.sfuService.createWebRtcTransport(data.roomId, socket.id);
    return transportParams;
  }

  @SubscribeMessage('sfu:connect-transport')
  async onConnectTransport(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { roomId: string; transportId: string; dtlsParameters: unknown },
  ) {
    await this.sfuService.connectTransport(
      data.roomId,
      data.transportId,
      data.dtlsParameters as any,
    );
    return { ok: true };
  }

  @SubscribeMessage('sfu:produce')
  async onProduce(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      roomId: string;
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
    },
  ) {
    const { producerId } = await this.sfuService.produce(
      data.roomId,
      data.transportId,
      data.kind,
      data.rtpParameters as any,
      socket.id,
    );

    // Notify others to consume this new producer
    socket.to(data.roomId).emit('sfu:new-producer', { producerId, socketId: socket.id });

    return { producerId };
  }

  @SubscribeMessage('sfu:consume')
  async onConsume(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      roomId: string;
      producerId: string;
      rtpCapabilities: unknown;
      transportId: string;
    },
  ) {
    const params = await this.sfuService.consume(
      data.roomId,
      socket.id,
      data.producerId,
      data.rtpCapabilities as any,
      data.transportId,
    );
    return params;
  }

  @SubscribeMessage('sfu:resume-consumer')
  async onResumeConsumer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { roomId: string; consumerId: string },
  ) {
    await this.sfuService.resumeConsumer(data.roomId, data.consumerId);
    return { ok: true };
  }

  // ── Contact Save (post-call handshake) ───────────────────────────────────

  @SubscribeMessage('contact:request-save')
  async onRequestContactSave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; toUserId: string },
  ) {
    const meta = this.getMeta(socket);
    if (!meta.userId) throw new WsException('Must be registered to save contacts');

    const request = await this.contactsService.requestContactSave(
      data.callId,
      meta.userId,
      data.toUserId,
      meta.ipAddress,
    );

    // Notify the target user (all their tabs)
    const targetSocketSet = this.userSockets.get(data.toUserId);
    if (targetSocketSet) {
      for (const sid of targetSocketSet) {
        this.server.to(sid).emit('contact:save-request', {
          requestId: request.id,
          callId: data.callId,
          fromUserId: meta.userId,
        });
      }
    }

    return { requestId: request.id };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getMeta(socket: Socket): SocketMeta {
    const meta = this.sockets.get(socket.id);
    if (!meta) throw new WsException('Socket not initialised');
    return meta;
  }
}
