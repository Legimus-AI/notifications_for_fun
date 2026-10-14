/**
 * Runnable check for PUT /api/whatsapp/channels/:channelId/profile and its image helpers.
 * Run: npx ts-node -r tsconfig-paths/register src/controllers/whatsappProfile.selfcheck.ts
 */
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import sharp from 'sharp';
import whatsAppRoutes from '../routes/api/whatsapp';
import Channel from '../models/Channels';
import { whatsAppService } from '../services/WhatsAppService';
import {
  loadMediaBuffer,
  MediaPayloadError,
  toSquareProfileImage,
  PROFILE_PICTURE_SIZE,
} from '../helpers/media';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

async function rejects(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<boolean> {
  try {
    await promise;
    return false;
  } catch (error) {
    return pattern.test((error as Error).message);
  }
}

/** 300x100 PNG: red | green | blue thirds, so a centred square crop keeps only green. */
function stripedImage(): Promise<Buffer> {
  const stripe = (r: number, g: number, b: number) =>
    sharp({
      create: { width: 100, height: 100, channels: 3, background: { r, g, b } },
    })
      .png()
      .toBuffer();
  return Promise.all([
    stripe(255, 0, 0),
    stripe(0, 255, 0),
    stripe(0, 0, 255),
  ]).then(([red, green, blue]) =>
    sharp({
      create: { width: 300, height: 100, channels: 3, background: '#000' },
    })
      .composite([
        { input: red, left: 0, top: 0 },
        { input: green, left: 100, top: 0 },
        { input: blue, left: 200, top: 0 },
      ])
      .png()
      .toBuffer(),
  );
}

async function checkImageHelpers(png: Buffer): Promise<void> {
  const square = await toSquareProfileImage(png);
  const meta = await sharp(square).metadata();
  assert(meta.format === 'jpeg', 'square is jpeg');
  assert(
    meta.width === PROFILE_PICTURE_SIZE && meta.height === PROFILE_PICTURE_SIZE,
    'square is 640x640',
  );
  const { data } = await sharp(square)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) =>
    data.subarray(
      (y * PROFILE_PICTURE_SIZE + x) * 3,
      (y * PROFILE_PICTURE_SIZE + x) * 3 + 3,
    );
  for (const [x, y] of [
    [5, 5],
    [634, 5],
    [320, 320],
    [5, 634],
    [634, 634],
  ]) {
    const [r, g, b] = pixel(x, y);
    assert(
      g > 200 && r < 60 && b < 60,
      `centre crop keeps only the middle (green) at ${x},${y}: ${r},${g},${b}`,
    );
  }

  assert(
    await rejects(
      toSquareProfileImage(Buffer.from('not an image')),
      /not a readable image/,
    ),
    'garbage image rejected',
  );
  assert(
    await rejects(loadMediaBuffer({}), /"image.link" or "image.data"/),
    'empty image payload rejected',
  );
  assert(
    await rejects(
      loadMediaBuffer({ link: 'http://127.0.0.1/a.png' }),
      /reserved range/,
    ),
    'ssrf link rejected',
  );
  const downloadError = await loadMediaBuffer({
    link: 'https://does-not-exist.invalid/a.png',
  }).catch((error) => error as MediaPayloadError);
  assert(
    downloadError instanceof MediaPayloadError &&
      downloadError.statusCode === 400,
    'failed link download is a 400, not a 500',
  );
  const decoded = await loadMediaBuffer({
    data: `data:image/png;base64,${png.toString('base64')}`,
  });
  assert(decoded.equals(png), 'base64 data url decoded');

  const transparent = await sharp({
    create: {
      width: 50,
      height: 50,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const flattened = await sharp(await toSquareProfileImage(transparent))
    .raw()
    .toBuffer();
  assert(
    flattened[0] > 240 && flattened[1] > 240 && flattened[2] > 240,
    'transparency becomes white, not black',
  );
}

/** Runs the real service method against a fake Baileys socket. */
async function checkService(png: Buffer): Promise<void> {
  const calls: string[] = [];
  let uploaded: Buffer | undefined;
  const fakeSocket = {
    user: { id: '51900000000:7@s.whatsapp.net' },
    updateProfilePicture: async (jid: string, picture: Buffer) => {
      calls.push(`picture:${jid}`);
      uploaded = picture;
    },
    updateProfileName: async (name: string) => {
      calls.push(`name:${name}`);
    },
  };
  const connections = (
    whatsAppService as unknown as { connections: Map<string, unknown> }
  ).connections;
  connections.set('fake', fakeSocket);
  try {
    assert(
      await rejects(
        whatsAppService.updateOwnProfile('fake', {
          name: 'X',
          image: { data: 'bm90IGFuIGltYWdl' },
        }),
        /not a readable image/,
      ),
      'bad image rejected',
    );
    assert(
      calls.length === 0,
      'bad image changes nothing on WhatsApp (no half-applied profile)',
    );

    await whatsAppService.updateOwnProfile('fake', {
      name: 'Legimus',
      image: { data: png.toString('base64') },
    });
    assert(
      calls.join('|') === 'picture:51900000000:7@s.whatsapp.net|name:Legimus',
      `picture to own jid, then name: ${calls.join('|')}`,
    );
    const meta = await sharp(uploaded as Buffer).metadata();
    assert(
      meta.format === 'jpeg' && meta.width === 640 && meta.height === 640,
      'uploads a 640x640 jpeg',
    );

    connections.set('fake', { ...fakeSocket, user: undefined });
    const notActive = await whatsAppService
      .updateOwnProfile('fake', { name: 'X' })
      .catch((error) => error as MediaPayloadError);
    assert(
      notActive instanceof MediaPayloadError && notActive.statusCode === 400,
      'no session user is a 400',
    );
  } finally {
    connections.delete('fake');
  }
}

async function checkEndpoint(png: Buffer): Promise<void> {
  const savedChannels: string[] = [];
  const profileCalls: { name?: string; image?: unknown }[] = [];
  const fakeChannel = {
    name: 'Old name',
    save: async () => {
      savedChannels.push(fakeChannel.name);
    },
  };
  (Channel as unknown as { findOne: unknown }).findOne = async ({
    channelId,
  }: {
    channelId: string;
  }) => (channelId === 'missing' ? null : fakeChannel);
  whatsAppService.getChannelStatus = (channelId: string) =>
    channelId === 'offline' ? 'logged_out' : 'active';
  whatsAppService.updateOwnProfile = async (_channelId, profile) => {
    profileCalls.push(profile);
  };

  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use('/api/whatsapp', whatsAppRoutes);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const put = async (channelId: string, body: unknown) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/whatsapp/channels/${channelId}/profile`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      body: (await response.json()) as {
        errors?: { msg?: string };
        payload?: { name?: string; imageUpdated?: boolean };
      },
    };
  };

  try {
    const empty = await put('c1', {});
    assert(
      empty.status === 400 &&
        empty.body.errors?.msg === 'NAME_OR_IMAGE_REQUIRED',
      'empty body 400',
    );
    assert((await put('c1', { name: '   ' })).status === 400, 'blank name 400');
    assert(
      (await put('c1', { name: 'x'.repeat(26) })).status === 400,
      '26-char name 400',
    );
    assert(
      (await put('c1', { name: 42 })).status === 400,
      'non-string name 400',
    );
    assert(
      (await put('c1', { image: 'https://x/y.png' })).status === 400,
      'image must be an object',
    );
    assert(
      (await put('c1', { image: {} })).status === 400,
      'image without link/data 400',
    );
    assert(
      (await put('missing', { name: 'Ok' })).status === 404,
      'unknown channel 404',
    );
    const offline = await put('offline', { name: 'Ok' });
    assert(
      offline.status === 400 &&
        offline.body.errors?.msg === 'CHANNEL_NOT_ACTIVE',
      'offline channel 400',
    );
    assert(profileCalls.length === 0, 'no WhatsApp call on rejected requests');

    const ok = await put('c1', {
      name: '  Legimus Alerts ',
      image: { data: png.toString('base64') },
    });
    assert(
      ok.status === 200 &&
        ok.body.payload?.name === 'Legimus Alerts' &&
        ok.body.payload?.imageUpdated,
      'happy path 200',
    );
    assert(profileCalls[0].name === 'Legimus Alerts', 'trimmed name forwarded');
    assert(
      savedChannels[0] === 'Legimus Alerts',
      'channel name synced to Mongo',
    );

    const imageOnly = await put('c1', {
      image: { link: 'https://example.com/a.png' },
    });
    assert(
      imageOnly.status === 200 && savedChannels.length === 1,
      'image-only does not touch channel name',
    );
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  const png = await stripedImage();
  await checkImageHelpers(png);
  await checkService(png);
  await checkEndpoint(png);
  console.log('whatsappProfile selfcheck ok');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
