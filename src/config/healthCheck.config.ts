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
