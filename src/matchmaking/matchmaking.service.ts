import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit-event.enum';

export interface QueueEntry {
  anonymousId: string;
  userId?: string;
  socketId: string;
  preferredType: 'voice' | 'video';
  isAnonymous: boolean;
}

const QUEUE_KEY = 'matchmaking:queue';
const QUEUE_TTL = 300; // 5 min max wait

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** Add a user to the matchmaking queue. Returns queue position (1-based). */
  async enqueue(entry: QueueEntry): Promise<number> {
    const client = this.redis.getClient();
    const timedEntry = { ...entry, enqueuedAt: Date.now() };
    const serialized = JSON.stringify(timedEntry);

    // Store as a list entry; also keep a hash for quick socket → entry lookup
    await client.rpush(QUEUE_KEY, serialized);
    await client.hset('matchmaking:sockets', entry.socketId, serialized);

    await this.audit.log({
      userId: entry.userId,
      anonymousId: entry.anonymousId,
      eventType: AuditEventType.MATCH_QUEUED,
      payload: { socketId: entry.socketId, preferredType: entry.preferredType },
    });

    const position = await client.llen(QUEUE_KEY);
    return position;
  }

  /**
   * Try to match the newest entrant with an existing queue member.
   * Returns the matched pair or null if queue has < 2 members.
   *
   * Uses a Lua script to atomically pop two entries — prevents race conditions
   * where concurrent tryMatch() calls could steal each other's entries.
   */
  async tryMatch(): Promise<[QueueEntry, QueueEntry] | null> {
    const client = this.redis.getClient();

    // Atomically pop two entries or none
    const luaScript = `
      if redis.call('llen', KEYS[1]) < 2 then
        return nil
      end
      local a = redis.call('lpop', KEYS[1])
      local b = redis.call('lpop', KEYS[1])
      return {a, b}
    `;

    const result = await client.eval(luaScript, 1, QUEUE_KEY) as [string, string] | null;
    if (!result) return null;

    const [raw1, raw2] = result;
    const parsed1 = JSON.parse(raw1) as QueueEntry & { enqueuedAt?: number };
    const parsed2 = JSON.parse(raw2) as QueueEntry & { enqueuedAt?: number };
    const now = Date.now();
    const ttlMs = QUEUE_TTL * 1000;

    // Discard stale entries (older than QUEUE_TTL)
    const entry1Fresh = !parsed1.enqueuedAt || now - parsed1.enqueuedAt < ttlMs;
    const entry2Fresh = !parsed2.enqueuedAt || now - parsed2.enqueuedAt < ttlMs;

    if (!entry1Fresh && !entry2Fresh) {
      // Both stale — discard
      await client.hdel('matchmaking:sockets', parsed1.socketId, parsed2.socketId);
      this.logger.warn(`Discarded 2 stale matchmaking entries`);
      return null;
    }
    if (!entry1Fresh) {
      // entry1 stale, put entry2 back
      await client.lpush(QUEUE_KEY, raw2);
      await client.hdel('matchmaking:sockets', parsed1.socketId);
      this.logger.warn(`Discarded stale entry for socket ${parsed1.socketId}`);
      return null;
    }
    if (!entry2Fresh) {
      // entry2 stale, put entry1 back
      await client.lpush(QUEUE_KEY, raw1);
      await client.hdel('matchmaking:sockets', parsed2.socketId);
      this.logger.warn(`Discarded stale entry for socket ${parsed2.socketId}`);
      return null;
    }

    const entry1: QueueEntry = parsed1;
    const entry2: QueueEntry = parsed2;

    // Clean up socket index
    await client.hdel('matchmaking:sockets', entry1.socketId, entry2.socketId);

    await this.audit.log({
      eventType: AuditEventType.MATCH_FOUND,
      payload: {
        user1: entry1.userId ?? entry1.anonymousId,
        user2: entry2.userId ?? entry2.anonymousId,
      },
    });

    return [entry1, entry2];
  }

  /** Remove a socket from the queue when they disconnect. */
  async dequeue(socketId: string): Promise<void> {
    const client = this.redis.getClient();
    const raw = await client.hget('matchmaking:sockets', socketId);
    if (!raw) return;

    await client.lrem(QUEUE_KEY, 1, raw);
    await client.hdel('matchmaking:sockets', socketId);

    const entry: QueueEntry = JSON.parse(raw);
    await this.audit.log({
      userId: entry.userId,
      anonymousId: entry.anonymousId,
      eventType: AuditEventType.MATCH_CANCELLED,
      payload: { socketId },
    });
  }

  /** Get current queue depth. */
  async queueDepth(): Promise<number> {
    return this.redis.getClient().llen(QUEUE_KEY);
  }
}
