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
