export interface CallSessionRecord {
  id: string;
  initiatorId: string;
  callType: 'voice' | 'video' | 'group';
  status: 'initiated' | 'active' | 'ended' | 'missed' | 'rejected';
  isAnonymous: boolean;
  roomId: string | null;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
}

export interface CallParticipantRecord {
  id: string;
  callSessionId: string;
  userId: string | null;
  anonymousId: string | null;
  role: 'host' | 'guest';
  joinedAt: Date;
  leftAt: Date | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
}
