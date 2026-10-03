/**
 * Runnable check. Fails the process if the IP cap or the alert gate breaks.
 * Run: npx ts-node -r tsconfig-paths/register src/middleware/ipAbuseLimit.selfcheck.ts
 */
import express from 'express';
import http from 'http';
import {
  abuseKind,
  clientIp,
  ipAbuseLimit,
  resetIpAbuseLimit,
  setAbuseAlerter,
} from './ipAbuseLimit';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assert(abuseKind('GET', '/api/whatsapp/channels/c/messages') === null, 'get ignored');
  assert(abuseKind('POST', '/api/whatsapp/channels/c/qr') === null, 'qr ignored');
  assert(
    abuseKind('POST', '/api/whatsapp/channels/c/messages') === 'message',
    'wa messages',
  );
  assert(
    abuseKind('POST', '/api/telegram/channels/c/send-message') === 'message',
    'tg send-message',
  );
  assert(abuseKind('POST', '/api/telegram_phones/c/call') === 'call', 'phone call');
  assert(
    abuseKind('POST', '/api/telegram_ghost_caller/c/alert') === 'call',
    'ghost alert',
  );
  assert(
    abuseKind('POST', '/api/telegram_ghost_caller/channels') === null,
    'create channel is not a send',
  );
  assert(abuseKind('POST', '/api/notifications/send') === 'message', 'notifications send');
  assert(
    abuseKind('POST', '/api/notifications/send-multi/') === 'message',
    'send-multi slash',
  );
  assert(
    abuseKind('POST', '/API/WhatsApp/channels/c/Status') === 'message',
    'case and status',
  );
  assert(
    abuseKind('POST', '/api/slack/channels/c/send-message') === 'message',
    'slack send',
  );
  assert(abuseKind('POST', '/API/telegram_phones/c/CALL/') === 'call', 'call case slash');

  const alerts: string[] = [];
  setAbuseAlerter(async (message) => {
    alerts.push(message);
  });
  resetIpAbuseLimit();

  const app = express();
  app.use(ipAbuseLimit);
  app.post('*', (_req, res) => res.status(200).json({ ok: true }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  async function post(path: string, ip: string): Promise<number> {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'cf-connecting-ip': ip },
    });
    return res.status;
  }

  for (let i = 0; i < 60; i += 1) {
    const status = await post('/api/whatsapp/channels/abc/messages', '1.1.1.1');
    assert(status === 200, `message ${i} got ${status}`);
  }
  assert(
    (await post('/api/whatsapp/channels/abc/messages', '1.1.1.1')) === 429,
    '61st message blocked',
  );
  assert(
    (await post('/api/telegram/channels/abc/send-message', '9.9.9.9')) === 200,
    'other ip not blocked',
  );
  assert(alerts.length === 1, `expected 1 alert, got ${alerts.length}`);
  assert(!alerts[0].includes('{'), 'alert has no body');
  assert(alerts[0].includes('1.1.1.1'), 'alert has ip');
  assert(alerts[0].includes('abc'), 'alert has channel');
  assert(alerts[0].includes('/api/whatsapp/channels/abc/messages'), 'alert has route');
  assert(
    (await post('/api/whatsapp/channels/abc/messages', '1.1.1.1')) === 429,
    'still blocked',
  );
  assert(alerts.length === 1, 'second block does not alert again');

  resetIpAbuseLimit();
  alerts.length = 0;
  for (let i = 0; i < 30; i += 1) {
    assert(
      (await post('/api/telegram_ghost_caller/xyz/call', '2.2.2.2')) === 200,
      `call ${i}`,
    );
  }
  assert(
    (await post('/api/telegram_phones/xyz/call-request', '2.2.2.2')) === 429,
    '31st call blocked across call routes',
  );
  assert(alerts.length === 1, 'call alert once');
  assert(alerts[0].includes('xyz'), 'call alert channel');

  const req = {
    headers: { 'cf-connecting-ip': ' 8.8.8.8 ' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as express.Request;
  assert(clientIp(req) === '8.8.8.8', 'cf ip wins');

  server.close();
  console.log('ipAbuseLimit selfcheck ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
