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
 * Hard cap on decoded base64 media payload size.
 * Set to 16 MiB to match WhatsApp's effective upload limit and to bound
 * per-request memory pressure on this open endpoint. Telegram allows up
 * to 50 MiB for documents but accepting 50 MiB base64 (~67 MiB encoded)
 * here would let a small concurrent burst OOM the process.
 */
export const MAX_DECODED_MEDIA_BYTES = 16 * 1024 * 1024;

export class MediaPayloadError extends Error {
  // 413 Payload Too Large / 400 Bad Request semantics, surfaced via .statusCode
  // so handleError() can map it without relying on string matching.
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'MediaPayloadError';
    this.statusCode = statusCode;
  }
}

/**
 * Strip a `data:<mime>;base64,` prefix if present and decode to a Buffer.
 * Throws MediaPayloadError if input is not a string, decodes to empty,
 * or exceeds MAX_DECODED_MEDIA_BYTES.
 */
export function decodeBase64Payload(data: unknown): Buffer {
  if (typeof data !== 'string' || data.length === 0) {
    throw new MediaPayloadError('"data" must be a non-empty base64 string');
  }
  const base64 = data.includes(',') ? data.split(',', 2)[1] : data;
  // Cheap pre-check: 4 base64 chars -> 3 bytes. Reject before allocating.
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_DECODED_MEDIA_BYTES) {
    throw new MediaPayloadError(
      `base64 payload exceeds ${MAX_DECODED_MEDIA_BYTES} bytes (got ~${approxBytes})`,
      413,
    );
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new MediaPayloadError('"data" decoded to empty buffer (malformed base64?)');
  }
  if (buffer.length > MAX_DECODED_MEDIA_BYTES) {
    throw new MediaPayloadError(
      `decoded base64 exceeds ${MAX_DECODED_MEDIA_BYTES} bytes (got ${buffer.length})`,
      413,
    );
  }
  return buffer;
}

/**
 * Validate a user-supplied media URL before the server fetches it.
 *
 * Without this check the unified /messages endpoint is an open SSRF
 * vector: Baileys (WhatsApp) and the Telegram Bot API both fetch
 * `link` server-side, so an attacker could read cloud metadata
 * (169.254.169.254), probe internal services, or trigger `file://`.
 *
 * Rules:
 * - Scheme must be http or https
 * - Hostname must not be an IP literal in a private/reserved range
 * - Hostname must not be `localhost`/`*.local`/`*.internal`
 *
 * NOTE: This is a sync best-effort check. It does NOT resolve DNS,
 * so an attacker-controlled hostname pointing at 127.0.0.1 still slips
 * through. For full protection wire DNS resolution + re-check before
 * fetch, but that requires moving the fetch into our process.
 */
export function assertSafeMediaUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    throw new MediaPayloadError('"link" must be a non-empty string');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new MediaPayloadError(`"link" is not a valid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MediaPayloadError(
      `"link" scheme "${parsed.protocol}" not allowed (use http or https)`,
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0'
  ) {
    throw new MediaPayloadError(`"link" host "${host}" is not allowed`);
  }
  // IPv4 literal check (private + loopback + link-local + cloud metadata)
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) || // link-local + AWS/GCP/Azure metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0;
    if (isPrivate) {
      throw new MediaPayloadError(`"link" host "${host}" is in a reserved range`);
    }
  }
  // IPv6 loopback / link-local
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    throw new MediaPayloadError(`"link" host "${host}" is in a reserved range`);
  }
  return parsed.toString();
}
