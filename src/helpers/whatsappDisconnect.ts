/** Detects provider messages that explicitly revoke a linked-device session. */
export const hasExplicitWhatsAppSessionRevocation = (
  disconnectMessage: string,
): boolean => {
  const normalizedMessage = disconnectMessage.toLowerCase();
  return (
    /device[_ -]removed/.test(normalizedMessage) ||
    /session (?:has been )?revoked/.test(normalizedMessage)
  );
};

export const AUTH_RETRY_PAUSED_STATUS = 'auth_retry_paused';

/** Detects an ambiguous 401 that must pause instead of retrying or logging out. */
export const shouldPauseAmbiguousWhatsAppAuthRetry = (
  isLoggedOutDisconnect: boolean,
  disconnectMessage: string,
  credentialsRegistered: boolean | undefined,
): boolean =>
  isLoggedOutDisconnect &&
  /connection failure/i.test(disconnectMessage) &&
  !hasExplicitWhatsAppSessionRevocation(disconnectMessage) &&
  credentialsRegistered === false;

/** Preserves only a registration bit that was true before the rejected login. */
export const getWhatsAppCredentialsRegisteredAfterPause = (
  wasRegisteredAtSocketStart: boolean | undefined,
): boolean => wasRegisteredAtSocketStart === true;

/** Maps a missing socket to its durable health reason. */
export const getMissingWhatsAppConnectionReason = (
  persistedStatus: string,
): string => {
  if (persistedStatus === 'logged_out') return 'status_logged_out';
  if (persistedStatus === AUTH_RETRY_PAUSED_STATUS) {
    return `status_${AUTH_RETRY_PAUSED_STATUS}`;
  }
  return 'no_connection';
};
