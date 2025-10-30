"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLidJid = exports.isPnJid = exports.getJidType = void 0;
/**
 * Determines the type of a JID
 */
function getJidType(jid) {
    if (!jid)
        return 'unknown';
    if (jid.includes('@lid'))
        return 'lid';
    if (jid.includes('@s.whatsapp.net'))
        return 'pn';
    if (jid.includes('@g.us'))
        return 'group';
    if (jid.includes('@broadcast'))
        return 'broadcast';
    return 'unknown';
}
exports.getJidType = getJidType;
/**
 * Checks if a JID is a Phone Number (not a LID)
 */
function isPnJid(jid) {
    return getJidType(jid) === 'pn';
}
exports.isPnJid = isPnJid;
/**
 * Checks if a JID is a LID
 */
function isLidJid(jid) {
    return getJidType(jid) === 'lid';
}
exports.isLidJid = isLidJid;
//# sourceMappingURL=Baileys.js.map