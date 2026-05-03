/**
 * Shared media payload helpers used by per-channel services
 * (WhatsApp, Telegram, etc.) when handling Cloud-API-style payloads.
 *
 * Each channel still owns its `resolveMediaSource` because the return
 * type differs (Baileys expects `{url}|Buffer`, Telegram needs a
 * `Blob` for multipart upload). This module only holds the bits that
 * are byte-for-byte identical across channels.
 */

/**
 * Strip a `data:<mime>;base64,` prefix if present and decode to a Buffer.
 */
export function decodeBase64Payload(data: string): Buffer {
  const base64 = data.includes(',') ? data.split(',', 2)[1] : data;
  return Buffer.from(base64, 'base64');
}
