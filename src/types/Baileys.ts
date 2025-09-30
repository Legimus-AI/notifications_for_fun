/**
 * Type extensions for Baileys 7.x.x to support LID (Local Identifier) system
 *
 * Baileys 7 introduced LIDs to ensure user anonymity in large groups.
 * Messages can now come from either Phone Number JIDs (@s.whatsapp.net) or LIDs (@lid).
 *
 * Key fields added in Baileys 7:
 * - remoteJidAlt: Alternate JID for DMs (contains PN when remoteJid is LID)
 * - participantAlt: Alternate JID for Groups (contains PN when participant is LID)
 *
 * @see https://whiskey.so/migrate-latest
 */

import { proto } from '@whiskeysockets/baileys';

declare module '@whiskeysockets/baileys' {
  export interface MessageKey extends proto.IMessageKey {
    /**
     * Alternative JID for remote user in DMs.
     * When remoteJid is a LID (@lid), this contains the actual phone number (@s.whatsapp.net)
     */
    remoteJidAlt?: string;

    /**
     * Alternative JID for participant in groups.
     * When participant is a LID (@lid), this contains the actual phone number (@s.whatsapp.net)
     */
    participantAlt?: string;
  }
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
