import ChannelConnectionEvents from '../models/ChannelConnectionEvents';

export interface ChannelMetric {
  status: string;
  lastStatusCode: number | null;
  lastReason: string | null;
  lastMessage: string | null;
  reconnectCount: number; // cumulative reconnect attempts since process start
  connectedSince: string | null; // ISO of last successful 'open'
  lastDisconnectAt: string | null; // ISO of last 'close'
  lastEventAt: string | null;
}

type ConnectionEvent = 'open' | 'close' | 'reconnect' | 'conflict' | 'logged_out';

interface RecordExtras {
  statusCode?: number | null;
  reason?: string | null;
  message?: string | null;
  attempt?: number | null;
  status?: string; // channel status to reflect in the snapshot
}

/**
 * In-memory per-channel connection metrics + durable event log.
 *
 * Memory map gives O(1) reads for GET /health/channels; every transition is also
 * persisted (fire-and-forget) to ChannelConnectionEvents so incidents survive
 * restarts. Deliberately tiny — one entry per channel, no payloads.
 */
class ChannelMetricsService {
  private metrics: Map<string, ChannelMetric> = new Map();

  private ensure(channelId: string): ChannelMetric {
    let m = this.metrics.get(channelId);
    if (!m) {
      m = {
        status: 'unknown',
        lastStatusCode: null,
        lastReason: null,
        lastMessage: null,
        reconnectCount: 0,
        connectedSince: null,
        lastDisconnectAt: null,
        lastEventAt: null,
      };
      this.metrics.set(channelId, m);
    }
    return m;
  }

  /**
   * Record a connection-state transition. Updates the in-memory snapshot and
   * appends a durable row. Never throws — metrics must not break the socket loop.
   */
  record(channelId: string, event: ConnectionEvent, extras: RecordExtras = {}): void {
    const now = new Date();
    const m = this.ensure(channelId);
    m.lastEventAt = now.toISOString();
    if (extras.statusCode !== undefined) m.lastStatusCode = extras.statusCode;
    if (extras.reason !== undefined) m.lastReason = extras.reason;
    if (extras.message !== undefined) m.lastMessage = extras.message;
    if (extras.status) m.status = extras.status;

    if (event === 'open') {
      m.status = extras.status ?? 'active';
      m.connectedSince = now.toISOString();
    } else if (event === 'close' || event === 'conflict' || event === 'logged_out') {
      m.lastDisconnectAt = now.toISOString();
      m.connectedSince = null;
    }
    if (event === 'reconnect' || event === 'conflict') {
      m.reconnectCount += 1;
    }

    // Durable trail — fire-and-forget, swallow errors.
    ChannelConnectionEvents.create({
      channelId,
      event,
      statusCode: extras.statusCode ?? undefined,
      reason: extras.reason ?? undefined,
      message: extras.message ?? undefined,
      attempt: extras.attempt ?? undefined,
    }).catch((err) =>
      console.error(`❌ Failed to persist channel event for ${channelId}:`, err),
    );
  }

  /** Snapshot of all known channels for GET /health/channels. */
  getSnapshot(): Record<string, ChannelMetric> {
    return Object.fromEntries(this.metrics.entries());
  }

  getChannel(channelId: string): ChannelMetric | null {
    return this.metrics.get(channelId) ?? null;
  }
}

export const channelMetrics = new ChannelMetricsService();
