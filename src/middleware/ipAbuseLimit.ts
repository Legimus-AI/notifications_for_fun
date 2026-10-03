import type { NextFunction, Request, Response } from 'express';

/**
 * Per-IP caps for public send/call routes.
 * ponytail: in-memory sliding window, one PM2 process. Move the maps to
 * Redis if notifications_for_fun runs more than one instance.
 */
const WINDOW_MS = 60_000;
const ALERT_GAP_MS = 10 * 60_000;
const MESSAGE_LIMIT = 60;
const CALL_LIMIT = 30;

const MESSAGE_PATH =
  /^\/api\/(?:whatsapp\/channels\/[^/]+\/(?:messages|send|send-media|status)|telegram\/channels\/[^/]+\/(?:messages|send-message)|telegram_phones\/[^/]+\/send|telegram_ghost_caller\/[^/]+\/send|slack\/channels\/[^/]+\/send-message|notifications\/send(?:-multi)?)$/;
const CALL_PATH =
  /^\/api\/(?:telegram_ghost_caller\/[^/]+\/(?:call|alert)|telegram_phones\/[^/]+\/(?:call|call-request))$/;

type Kind = 'message' | 'call';

const hits = new Map<string, number[]>();
const lastAlertAt = new Map<string, number>();

let alerter = async (message: string): Promise<void> => {
  const { sendAlertToAllRecipients } = await import('../services/alertDelivery');
  await sendAlertToAllRecipients(message);
};

export function setAbuseAlerter(fn: (message: string) => Promise<void>): void {
  alerter = fn;
}

export function resetIpAbuseLimit(): void {
  hits.clear();
  lastAlertAt.clear();
}

export function abuseKind(method: string, path: string): Kind | null {
  if (method !== 'POST') return null;
  const bare = path.split('?')[0].toLowerCase().replace(/\/+$/, '') || '/';
  if (CALL_PATH.test(bare)) return 'call';
  if (MESSAGE_PATH.test(bare)) return 'message';
  return null;
}

/** Cloudflare sets this. X-Forwarded-For is client-controlled, so ignore it. */
export function clientIp(req: Request): string {
  const raw = req.headers['cf-connecting-ip'];
  const cf = Array.isArray(raw) ? raw[0] : raw;
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.socket?.remoteAddress || 'unknown';
}

function channelFrom(path: string): string {
  const fromChannels = path.match(/\/channels\/([^/]+)/);
  if (fromChannels) return fromChannels[1];
  const fromRoot = path.match(
    /\/api\/telegram_(?:phones|ghost_caller)\/([^/]+)\//,
  );
  return fromRoot?.[1] || '-';
}

function allow(key: string, limit: number, now: number): { ok: boolean; count: number } {
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, count: recent.length + 1 };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, stamps] of hits) {
      if (now - stamps[stamps.length - 1] >= WINDOW_MS) hits.delete(k);
    }
  }
  return { ok: true, count: recent.length };
}

export function ipAbuseLimit(req: Request, res: Response, next: NextFunction): void {
  const kind = abuseKind(req.method, req.originalUrl || req.url || req.path);
  if (!kind) {
    next();
    return;
  }
  const ip = clientIp(req);
  const limit = kind === 'call' ? CALL_LIMIT : MESSAGE_LIMIT;
  const { ok, count } = allow(`${kind}:${ip}`, limit, Date.now());
  if (ok) {
    next();
    return;
  }
  const now = Date.now();
  const previous = lastAlertAt.get(ip) || 0;
  if (now - previous >= ALERT_GAP_MS) {
    lastAlertAt.set(ip, now);
    const path = (req.originalUrl || req.path).split('?')[0];
    const text = [
      '⚠️ Abuso en notificaciones',
      `IP ${ip}`,
      `${req.method} ${path}`,
      `canal ${channelFrom(path)}`,
      new Date(now).toISOString(),
      `${count} en este minuto (tope ${limit})`,
    ].join('\n');
    void alerter(text).catch((err) => {
      console.error('abuse alert failed', err instanceof Error ? err.message : err);
    });
  }
  res.status(429).json({ ok: false, error: 'rate_limit' });
}
