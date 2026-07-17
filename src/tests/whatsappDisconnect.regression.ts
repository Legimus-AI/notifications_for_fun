import assert from 'assert';
import {
  AUTH_RETRY_PAUSED_STATUS,
  getMissingWhatsAppConnectionReason,
  getWhatsAppCredentialsRegisteredAfterPause,
  hasExplicitWhatsAppSessionRevocation,
  shouldPauseAmbiguousWhatsAppAuthRetry,
} from '../helpers/whatsappDisconnect';
import { UNHEALABLE_REASONS } from '../config/healthCheck.config';

assert.strictEqual(
  hasExplicitWhatsAppSessionRevocation('Connection Failure'),
  false,
  'ambiguous 401 Connection Failure must stay recoverable',
);

for (const explicitRevocationMessage of [
  'device_removed',
  'Device removed',
  'Session revoked',
  'Session has been revoked',
]) {
  assert.strictEqual(
    hasExplicitWhatsAppSessionRevocation(explicitRevocationMessage),
    true,
    `explicit revocation was not detected: ${explicitRevocationMessage}`,
  );
}

assert.strictEqual(
  shouldPauseAmbiguousWhatsAppAuthRetry(true, 'Connection Failure', false),
  true,
  'ambiguous 401 with unregistered auth must pause retries',
);
assert.strictEqual(
  shouldPauseAmbiguousWhatsAppAuthRetry(true, 'Connection Failure', true),
  false,
  'ambiguous 401 with registered auth must remain recoverable',
);
assert.strictEqual(
  shouldPauseAmbiguousWhatsAppAuthRetry(true, 'device_removed', false),
  false,
  'explicit revocation must remain in the terminal path',
);
for (const explicitCompoundRevocation of [
  'Connection Failure: device_removed',
  'Connection Failure: session revoked',
]) {
  assert.strictEqual(
    shouldPauseAmbiguousWhatsAppAuthRetry(
      true,
      explicitCompoundRevocation,
      false,
    ),
    false,
    `compound revocation must remain terminal: ${explicitCompoundRevocation}`,
  );
}
assert.strictEqual(
  shouldPauseAmbiguousWhatsAppAuthRetry(false, 'Connection Failure', false),
  false,
  'non-401 conflicts must remain recoverable',
);
assert.strictEqual(
  getWhatsAppCredentialsRegisteredAfterPause(true),
  true,
  'a transient downgrade must preserve previously registered auth',
);
assert.strictEqual(
  getWhatsAppCredentialsRegisteredAfterPause(false),
  false,
  'fresh unregistered auth must remain eligible for human pairing',
);
assert.strictEqual(
  getMissingWhatsAppConnectionReason(AUTH_RETRY_PAUSED_STATUS),
  'status_auth_retry_paused',
  'paused channels must remain paused when the cron sees no socket',
);
assert.strictEqual(
  getMissingWhatsAppConnectionReason('logged_out'),
  'status_logged_out',
  'logged-out channels must retain the terminal health reason',
);
assert.strictEqual(
  getMissingWhatsAppConnectionReason('connecting'),
  'no_connection',
  'other missing connections remain eligible for normal health handling',
);
assert.ok(
  UNHEALABLE_REASONS.includes('status_auth_retry_paused'),
  'the health cron must never auto-heal a paused auth retry',
);

console.log('WhatsApp disconnect classification regression passed');
