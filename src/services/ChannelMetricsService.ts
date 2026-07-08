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

type ConnectionEvent =
  | 'open'
  | 'close'
  | 'reconnect'
  | 'conflict'
  | 'ghost_recovery'
  | 'logged_out';

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
  // Last persisted "event:statusCode" per channel. Used to dedup the durable
  // trail: a revoked channel emits the SAME conflict/401 every ~45s forever
  // (5af90a60 wrote 3205 identical rows). We only persist STATE CHANGES, so the
  // timeline stays a clean audit of transitions, not retry spam. The in-memory
  // snapshot + reconnectCount still update on every call.
  private lastPersistedSig: Map<string, string> = new Map();

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

    // Durable trail — persist only on a state change (dedup retry spam).
    const sig = `${event}:${extras.statusCode ?? ''}`;
    if (this.lastPersistedSig.get(channelId) === sig) return;
    this.lastPersistedSig.set(channelId, sig);

    // Fire-and-forget, swallow errors.
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
