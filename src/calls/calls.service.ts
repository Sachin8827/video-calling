import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CallsRepository } from './calls.repository';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit-event.enum';
import { CallSessionRecord } from './interfaces/call.interfaces';
import { AppLogger } from '../common/logger/app-logger.service';

@Injectable()
export class CallsService {
  constructor(
    private readonly callsRepo: CallsRepository,
    private readonly auditService: AuditService,
    private readonly logger: AppLogger,
  ) {}

  /** Initiate a 1:1 or group call session. */
  async initiateCall(params: {
    initiatorId?: string | null;
    anonymousId?: string;
    callType: 'voice' | 'video' | 'group';
    isAnonymous: boolean;
    ipAddress: string;
    userAgent: string;
  }): Promise<CallSessionRecord> {
    const roomId = params.callType === 'group' ? uuidv4() : undefined;

    const session = await this.callsRepo.createSession({
      initiatorId: params.initiatorId,
      callType: params.callType,
      isAnonymous: params.isAnonymous,
      roomId,
    });

    await this.callsRepo.addParticipant({
      callSessionId: session.id,
      userId: params.isAnonymous ? undefined : (params.initiatorId ?? undefined),
      anonymousId: params.isAnonymous ? (params.anonymousId ?? params.initiatorId ?? undefined) : undefined,
      role: 'host',
      cameraEnabled: params.callType !== 'voice',
    });

    await this.auditService.log({
      userId: params.initiatorId ?? undefined,
      eventType: AuditEventType.CALL_INITIATED,
      payload: { callId: session.id, callType: params.callType, isAnonymous: params.isAnonymous },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    this.logger.log(`CallsService.initiateCall created session ${session.id} initiatorId=${params.initiatorId ?? 'anon'} anonymousId=${params.anonymousId}`);

    return session;
  }

  /** Accept a call — marks it as active, adds callee as participant. */
  async acceptCall(params: {
    callId: string;
    userId?: string;
    anonymousId?: string;
    isAnonymous?: boolean;
    callType: 'voice' | 'video';
    ipAddress: string;
    userAgent: string;
  }): Promise<CallSessionRecord> {
    const session = await this.callsRepo.findById(params.callId);
    if (!session) throw new NotFoundException('Call not found');

    const isAnonymous = params.isAnonymous ?? !params.userId;

    await this.callsRepo.updateStatus(params.callId, 'active', { answeredAt: true });
    await this.callsRepo.addParticipant({
      callSessionId: params.callId,
      userId: isAnonymous ? undefined : params.userId,
      anonymousId: isAnonymous ? (params.anonymousId ?? params.userId) : undefined,
      role: 'guest',
      cameraEnabled: params.callType === 'video',
    });

    await this.auditService.log({
      userId: isAnonymous ? undefined : params.userId,
      eventType: AuditEventType.CALL_ACCEPTED,
      payload: { callId: params.callId },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    this.logger.log(`CallsService.acceptCall accepted session ${params.callId} userId=${params.userId ?? 'anon'} anonymousId=${params.anonymousId}`);

    return (await this.callsRepo.findById(params.callId))!;
  }

  /** End or reject a call. */
  async endCall(params: {
    callId: string;
    userId: string;
    anonymousId?: string;
    reason: 'ended' | 'rejected' | 'missed';
    ipAddress: string;
    userAgent: string;
  }): Promise<void> {
    await this.callsRepo.updateStatus(params.callId, params.reason, { endedAt: true });
    await this.callsRepo.markParticipantLeft(params.callId, params.userId, params.anonymousId);

    const eventMap: Record<string, AuditEventType> = {
      ended: AuditEventType.CALL_ENDED,
      rejected: AuditEventType.CALL_REJECTED,
      missed: AuditEventType.CALL_MISSED,
    };

    await this.auditService.log({
      userId: params.userId,
      eventType: eventMap[params.reason] ?? AuditEventType.CALL_ENDED,
      payload: { callId: params.callId },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /** Upgrade voice → video or downgrade video → voice. */
  async toggleCallType(params: {
    callId: string;
    userId: string;
    newType: 'voice' | 'video';
    ipAddress: string;
    userAgent: string;
  }): Promise<void> {
    await this.callsRepo.updateStatus(params.callId, 'active');

    await this.auditService.log({
      userId: params.userId,
      eventType:
        params.newType === 'video' ? AuditEventType.CALL_UPGRADED : AuditEventType.CALL_DOWNGRADED,
      payload: { callId: params.callId, newType: params.newType },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /** Toggle mic or camera for a participant. */
  async toggleMedia(params: {
    callId: string;
    userId: string;
    anonymousId?: string;
    mic?: boolean;
    camera?: boolean;
  }): Promise<void> {
    await this.callsRepo.updateParticipantMedia(
      params.callId,
      params.userId,
      params.mic,
      params.camera,
      params.anonymousId,
    );

    // Log each toggle separately so the audit trail is complete (BUG-7 fix)
    if (params.mic !== undefined) {
      await this.auditService.log({
        userId: params.userId,
        eventType: AuditEventType.MEDIA_MIC_TOGGLED,
        payload: { callId: params.callId, mic: params.mic },
      });
    }
    if (params.camera !== undefined) {
      await this.auditService.log({
        userId: params.userId,
        eventType: AuditEventType.MEDIA_CAMERA_TOGGLED,
        payload: { callId: params.callId, camera: params.camera },
      });
    }
  }

  async getCallHistory(userId: string, limit = 20, offset = 0): Promise<CallSessionRecord[]> {
    return this.callsRepo.findHistory(userId, limit, offset);
  }

  async getCallById(callId: string): Promise<CallSessionRecord> {
    const session = await this.callsRepo.findById(callId);
    if (!session) throw new NotFoundException('Call not found');
    return session;
  }

  async getParticipants(callId: string) {
    return this.callsRepo.getParticipants(callId);
  }
}
