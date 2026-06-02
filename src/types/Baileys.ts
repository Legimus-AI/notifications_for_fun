/**
 * Type extensions to keep LID-aware code compiling against Baileys 6.7.x.
 *
 * The LID (Local Identifier) system landed in Baileys 7. This project was
 * written for v7 but runs on v6.7.x, where the LID surface is absent. The
 * call sites already degrade gracefully at runtime (every access is optional
 * and guarded), so these augmentations only restore the TYPES that v6 lacks
 * — they do NOT add behavior. On v6 the fields are simply `undefined` and the
 * `lid-mapping.update` event never fires.
 */

declare module '@whiskeysockets/baileys' {
  // v7 added these alt-JID fields on the message key; absent in v6.
  // proto.IMessageKey is an interface, so this merges cleanly.
  namespace proto {
    interface IMessageKey {
      remoteJidAlt?: string | null;
      participantAlt?: string | null;
    }
  }
  // NOTE: BaileysEventMap and SignalRepository are exported as `type` aliases
  // in v6, not interfaces, so they cannot be augmented here. The v7-only
  // `lid-mapping.update` event and `signalRepository.lidMapping` access are
  // shimmed at the call sites instead (see lidMappingOf() in WhatsAppService).
}

/**
 * Helper type to check if a JID is a LID
 */
export type JidType = 'lid' | 'pn' | 'group' | 'broadcast' | 'unknown';

/**
 * Determines the type of a JID
 */
export function getJidType(jid: string | undefined | null): JidType {
  if (!jid) return 'unknown';
  if (jid.includes('@lid')) return 'lid';
  if (jid.includes('@s.whatsapp.net')) return 'pn';
  if (jid.includes('@g.us')) return 'group';
  if (jid.includes('@broadcast')) return 'broadcast';
  return 'unknown';
}

/**
 * Checks if a JID is a Phone Number (not a LID)
 */
export function isPnJid(jid: string | undefined | null): boolean {
  return getJidType(jid) === 'pn';
}

/**
 * Checks if a JID is a LID
 */
export function isLidJid(jid: string | undefined | null): boolean {
  return getJidType(jid) === 'lid';
}
