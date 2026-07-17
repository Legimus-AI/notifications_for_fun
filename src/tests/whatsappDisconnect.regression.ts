import assert from 'assert';
import { hasExplicitWhatsAppSessionRevocation } from '../helpers/whatsappDisconnect';

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

console.log('WhatsApp disconnect classification regression passed');
