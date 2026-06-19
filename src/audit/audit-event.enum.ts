export enum AuditEventType {
  // Auth events (mirror from auth module for unified log)
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_REGISTER = 'user.register',

  // Call lifecycle
  CALL_INITIATED = 'call.initiated',
  CALL_ACCEPTED = 'call.accepted',
  CALL_REJECTED = 'call.rejected',
  CALL_ENDED = 'call.ended',
  CALL_MISSED = 'call.missed',
  CALL_UPGRADED = 'call.upgraded', // voice → video
  CALL_DOWNGRADED = 'call.downgraded', // video → voice

  // Media
  MEDIA_MIC_TOGGLED = 'media.mic_toggled',
  MEDIA_CAMERA_TOGGLED = 'media.camera_toggled',

  // Group rooms
  ROOM_CREATED = 'room.created',
  PARTICIPANT_JOINED = 'room.participant_joined',
  PARTICIPANT_LEFT = 'room.participant_left',

  // Matchmaking
  MATCH_QUEUED = 'match.queued',
  MATCH_FOUND = 'match.found',
  MATCH_CANCELLED = 'match.cancelled',

  // Contacts
  CONTACT_SAVE_REQUESTED = 'contact.save_requested',
  CONTACT_SAVED = 'contact.saved',
  CONTACT_SAVE_REJECTED = 'contact.save_rejected',
}
