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
 * Maximum reconnect attempts for a recoverable 401 conflict
 * (conflict / replaced / Connection Failure with auth still present).
 * On the (cap+1)th attempt the channel is escalated to logged_out + webhook.
 */
export const MAX_CONFLICT_RECONNECTS = 5;

/**
 * Exponential backoff (with capped tail) for conflict reconnects, in ms.
 * Indexed by attempt number (0-based). Past the array length the last value
 * is reused.
 */
export const CONFLICT_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

/**
 * Default delay before reconnecting after a transitory disconnect
 * (network blip, 428/408/503/515). Kept short to recover fast.
 */
export const TRANSITORY_RECONNECT_DELAY_MS = 5_000;

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
