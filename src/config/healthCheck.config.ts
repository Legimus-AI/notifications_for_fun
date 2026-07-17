/**
 * Health Check Configuration
 *
 * Alert recipients live in `alertRecipients.config.ts`. CallMeBot was
 * removed on 2026-05-29 (upstream account paused, no resume path).
 */

/**
 * Maximum consecutive alerts before stopping notifications for a channel
 */
export const MAX_CONSECUTIVE_ALERTS = 3;

/**
 * Unhealthy channels at once that count as a systemic (mass) outage.
 * WHY: this many simultaneous failures is host/network/WA-side, not N
 * independent channel problems — it triggers ONE aggregate alert that
 * bypasses MAX_CONSECUTIVE_ALERTS (which silenced a 14-channel outage).
 */
export const MASS_UNHEALTHY_ALERT_THRESHOLD = 5;

/**
 * Health check cron schedule (every 5 minutes)
 */
export const HEALTH_CHECK_SCHEDULE = '*/5 * * * *';

/**
 * Health check timezone
 */
export const HEALTH_CHECK_TIMEZONE = 'UTC';

/**
 * Maximum consecutive auto-heal attempts before giving up and only notifying
 */
export const MAX_HEAL_ATTEMPTS = 3;

/**
 * Delay between auto-heal call and re-check (ms). Gives Baileys time to handshake.
 */
export const HEAL_RECHECK_DELAY_MS = 10_000;

/**
 * Fast conflict reconnect attempts before settling into the steady cooldown.
 * (conflict / replaced / Connection Failure with auth still present).
 * Past this count we DO NOT escalate to logged_out (creds are still valid →
 * forcing a QR re-pair is wrong); we hold at CONFLICT_COOLDOWN_MS and keep
 * retrying patiently so the channel self-heals when the competing device
 * (another linked WhatsApp Web on the same number) closes.
 */
export const MAX_CONFLICT_RECONNECTS = 5;

/**
 * Exponential backoff for the first conflict reconnects, in ms. Tight early
 * steps recover fast from a transient conflict; capped at 2 min.
 */
export const CONFLICT_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000, 45_000];

/**
 * Steady retry interval once the fast attempts are exhausted on a persistent
 * conflict. Keeps creds (no QR) and recovers within this window once the
 * competing device goes away. WHY 2min: balances fast recovery vs not
 * hammering WhatsApp into a real device_removed.
 */
export const CONFLICT_COOLDOWN_MS = 45_000;

/**
 * A connection must stay open this long before its conflict-reconnect budget
 * is cleared. WHY: a flapping conflict (open -> replaced within seconds) must
 * NOT reset the attempt counter, or it loops forever without ever escalating
 * or stabilizing (root cause of the observed >1h conflict churn).
 */
export const CONFLICT_STABLE_RESET_MS = 60_000;

/**
 * Default delay before reconnecting after a transitory disconnect
 * (network blip, 428/408/503/515). Kept short to recover fast.
 */
export const TRANSITORY_RECONNECT_DELAY_MS = 3_000;

/**
 * Consecutive explicit auth-rejections after which the session is considered
 * revoked by WhatsApp. Generic 401 "Connection Failure" is ambiguous and must
 * remain recoverable: production channels have reopened with the same auth
 * after this exact response. Only provider messages that explicitly name a
 * removed/revoked session contribute to the streak.
 */
export const TERMINAL_AUTH_REJECTION_COUNT = 8;

/**
 * Minimum elapsed time since the first 401 of the streak before declaring
 * the session revoked. Guards against a fast retry burst (all within one
 * minute) being mistaken for a permanent revocation.
 */
export const TERMINAL_AUTH_REJECTION_WINDOW_MS = 10 * 60_000;

/**
 * Host-network-event detector (transport-aware escalation).
 *
 * If at least MASS_TRANSPORT_DROP_THRESHOLD DISTINCT channels suffer a
 * transport-level disconnect (428/408/503/515 / no-error network blip) within
 * MASS_TRANSPORT_WINDOW_MS, the cause is the HOST losing its uplink (power
 * blip, router/ISP/DNS down) — NOT a per-channel WhatsApp auth failure.
 *
 * WHY: on 2026-06-14T01:09Z a power blip at the host killed the router; all 14
 * sockets dropped in the same second (querySrv ECONNREFUSED to Atlas + WA WS
 * close together). On recovery WhatsApp answered the mass re-handshake with
 * 401 "Connection Failure", which the auth-rejection streak then escalated to
 * terminal status_logged_out on every channel — turning a 6-min blip into a
 * permanent 14-channel outage needing manual re-pair. During a detected host
 * event we suppress that escalation and keep reconnecting with backoff.
 */
export const MASS_TRANSPORT_DROP_THRESHOLD = 3;
export const MASS_TRANSPORT_WINDOW_MS = 2 * 60_000;

/**
 * After a host-network event is detected, suppress terminal auth-rejection
 * escalation for this long (rolling from the last transport drop). Gives the
 * router/DNS time to recover and WhatsApp time to accept the re-auth before the
 * gateway gives up and forces a QR re-pair. Genuine revocation still escalates
 * once the grace expires and 401s persist.
 */
export const NETWORK_OUTAGE_GRACE_MS = 10 * 60_000;

/**
 * Reasons that should NOT be auto-healed.
 *
 * Two categories:
 *   1. Terminal — needs human action (notify):
 *      - phone_not_registered: number deactivated on WhatsApp
 *      - status_logged_out: linked-device session invalidated, needs QR re-pair
 *   2. In-progress — already being handled by another flow (silent skip):
 *      - status_connecting / status_resetting: another connect is in flight
 *      - status_qr_ready / status_pairing_code_ready / status_generating_qr:
 *        waiting on user to scan/pair, not a true health failure
 *
 * Without skipping the in-progress states, the cron's auto-heal races against
 * restoration on boot — fires connectChannel while another connectChannel is
 * still handshaking → two sockets from same device-id → WhatsApp <conflict
 * type="replaced"/> → both sessions die.
 */
export const UNHEALABLE_REASONS = [
  'phone_not_registered',
  'status_logged_out',
  'status_connecting',
  'status_resetting',
  'status_qr_ready',
  'status_pairing_code_ready',
  'status_generating_qr',
];

/**
 * Ghost-session recovery (self-conflict false-positive guard).
 *
 * A 401 "Connection Failure" streak can be caused by OUR OWN orphan socket
 * holding the device slot (double-connect race) — WhatsApp returns the exact
 * same 401 as for a revoked session. The separating signal: a session that
 * managed to OPEN at/after the streak start cannot be revoked. In that case
 * the engine destroys every socket for the channel, waits
 * GHOST_RECOVERY_DELAY_MS for WhatsApp to free the slot, and tries ONE clean
 * connect — instead of parking a healthy session as logged_out.
 * WHY 90s: WhatsApp frees a dead companion slot well under a minute
 * (verified 2026-07-07: once the orphan died, the first clean login opened).
 */
export const GHOST_RECOVERY_DELAY_MS = 90_000;

/**
 * Max ghost-recovery cycles per auth-rejection streak. A session revoked
 * seconds AFTER an open looks identical to a ghost conflict — this cap makes
 * that case park as revoked after N failed recoveries instead of looping.
 */
export const MAX_GHOST_RECOVERIES = 2;

/**
 * Slack when comparing connectedAt (last successful open) with the streak
 * start — the poisoning open typically lands the same second the streak begins.
 */
export const GHOST_OPEN_SLACK_MS = 60_000;
