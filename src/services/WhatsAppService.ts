import makeWASocket, {
  WASocket,
  ConnectionState,
  DisconnectReason,
  AuthenticationState,
  AuthenticationCreds,
  initAuthCreds,
  Browsers,
  downloadMediaMessage,
  proto,
  WAMessage,
  GroupMetadata,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  BinaryNode,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import NodeCache from 'node-cache';
import {
  WhatsAppAuthState,
  WhatsAppAuthKey,
} from '../models/WhatsAppAuthState';
import Channel, { WhatsAppAutomatedConfig } from '../models/Channels';
import WhatsAppEvents from '../models/WhatsAppEvents';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { removeSuffixFromJid, formatJid } from '../helpers/utils';
import { decodeBase64Payload, assertSafeMediaUrl } from '../helpers/media';
import {
  MAX_CONFLICT_RECONNECTS,
  CONFLICT_BACKOFF_MS,
  CONFLICT_COOLDOWN_MS,
  CONFLICT_STABLE_RESET_MS,
  TRANSITORY_RECONNECT_DELAY_MS,
  TERMINAL_AUTH_REJECTION_COUNT,
  TERMINAL_AUTH_REJECTION_WINDOW_MS,
  MASS_TRANSPORT_DROP_THRESHOLD,
  MASS_TRANSPORT_WINDOW_MS,
  NETWORK_OUTAGE_GRACE_MS,
  GHOST_RECOVERY_DELAY_MS,
  MAX_GHOST_RECOVERIES,
  GHOST_OPEN_SLACK_MS,
} from '../config/healthCheck.config';
import { channelMetrics } from './ChannelMetricsService';

/**
 * Resolve a media payload into a Baileys-compatible source.
 * Accepts `{link: string}` (URL fetch by Baileys) or `{data: string}` (base64).
 *
 * URLs are SSRF-validated before being handed to Baileys (which fetches
 * server-side). base64 is size-capped — see helpers/media.ts.
 */
function resolveMediaSource(
  mediaPayload: any,
  typeLabel: string,
): { url: string } | Buffer {
  if (mediaPayload?.link) {
    return { url: assertSafeMediaUrl(mediaPayload.link) };
  }
  if (mediaPayload?.data) {
    return decodeBase64Payload(mediaPayload.data);
  }
  throw new Error(`"link" or "data" (base64) is required for media type "${typeLabel}"`);
}

/**
 * Build a vCard 3.0 string from a contact payload (Cloud API shape).
 */
function buildVCard(contact: any): string {
  // NOTE: `??` falls back only on null/undefined, but `[].filter(Boolean).join(' ')`
  // returns `''` when both names are missing — empty string is NOT nullish, so the
  // final `?? 'Contact'` would never fire. Coalesce empty string explicitly.
  const composedName = [contact?.name?.first_name, contact?.name?.last_name]
    .filter(Boolean)
    .join(' ');
  const fullName =
    contact?.name?.formatted_name || composedName || 'Contact';
  const phones: string[] = (contact?.phones ?? [])
    .filter((p: any) => p?.phone)
    .map(
      (p: any) =>
        `TEL;type=${(p.type ?? 'CELL').toUpperCase()};waid=${p.wa_id ?? ''}:${p.phone}`,
    );
  const emails: string[] = (contact?.emails ?? [])
    .filter((e: any) => e?.email)
    .map((e: any) => `EMAIL;type=${(e.type ?? 'WORK').toUpperCase()}:${e.email}`);
  const org = contact?.org?.company ? `ORG:${contact.org.company}` : null;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${fullName}`,
    `N:${contact?.name?.last_name ?? ''};${contact?.name?.first_name ?? ''};;;`,
    org,
    ...phones,
    ...emails,
    'END:VCARD',
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

/**
 * Build a Baileys interactive message (buttons or list) from Cloud API shape.
 */
function buildInteractiveContent(interactive: any): any {
  if (!interactive?.action) {
    throw new Error('"interactive.action" is required');
  }
  const headerText = interactive?.header?.text;
  const bodyText = interactive?.body?.text;
  const footerText = interactive?.footer?.text;
  if (!bodyText) {
    throw new Error('"interactive.body.text" is required');
  }

  if (interactive.type === 'button' && Array.isArray(interactive.action.buttons)) {
    const buttons = interactive.action.buttons.map((btn: any, index: number) => ({
      buttonId: btn.reply?.id ?? `btn_${index}`,
      buttonText: { displayText: btn.reply?.title ?? `Button ${index + 1}` },
      type: 1,
    }));
    return {
      text: bodyText,
      footer: footerText,
      buttons,
      headerType: 1,
      ...(headerText ? { caption: headerText } : {}),
    };
  }

  if (interactive.type === 'list' && Array.isArray(interactive.action.sections)) {
    const sections = interactive.action.sections.map((section: any) => ({
      title: section.title,
      rows: (section.rows ?? []).map((row: any) => ({
        title: row.title,
        rowId: row.id,
        description: row.description,
      })),
    }));
    return {
      text: bodyText,
      footer: footerText,
      title: headerText,
      buttonText: interactive.action.button ?? 'Select',
      sections,
    };
  }

  throw new Error(
    `Unsupported interactive type "${interactive.type}". Use "button" or "list".`,
  );
}

/**
 * Validate that the type-specific required fields are present in `payload`,
 * and that any provided media URL is safe (no SSRF). Throws a precise
 * "X is required for type Y" error early so malformed payloads are rejected
 * BEFORE we touch the WhatsApp socket — keeps errors helpful for AI agents
 * and ensures SSRF rejection still fires when the channel is offline.
 */
function validateMessagePayload(payload: any): void {
  if (!payload?.type) {
    throw new Error('"type" is required');
  }
  switch (payload.type) {
    case 'text':
      if (!payload.text?.body) {
        throw new Error('"text.body" is required for type "text"');
      }
      return;
    case 'image':
    case 'video':
    case 'audio':
    case 'sticker': {
      const media = payload[payload.type];
      if (!media?.link && !media?.data) {
        throw new Error(
          `"${payload.type}.link" or "${payload.type}.data" is required for type "${payload.type}"`,
        );
      }
      if (media.link) assertSafeMediaUrl(media.link);
      return;
    }
    case 'document':
      if (!payload.document?.link && !payload.document?.data) {
        throw new Error(
          '"document.link" or "document.data" is required for type "document"',
        );
      }
      if (payload.document.link) assertSafeMediaUrl(payload.document.link);
      return;
    case 'location':
      if (
        payload.location?.latitude === undefined ||
        payload.location?.longitude === undefined
      ) {
        throw new Error(
          '"location.latitude" and "location.longitude" are required for type "location"',
        );
      }
      return;
    case 'contact':
    case 'contacts': {
      const contacts = payload.contacts ?? (payload.contact ? [payload.contact] : []);
      if (!Array.isArray(contacts) || contacts.length === 0) {
        throw new Error('"contacts" array is required for type "contact"');
      }
      return;
    }
    case 'reaction':
      if (!payload.reaction?.message_id) {
        throw new Error('"reaction.message_id" is required for type "reaction"');
      }
      return;
    case 'interactive':
      if (!payload.interactive?.action) {
        throw new Error('"interactive.action" is required for type "interactive"');
      }
      if (!payload.interactive?.body?.text) {
        throw new Error('"interactive.body.text" is required for type "interactive"');
      }
      return;
    default:
      throw new Error(`Unsupported message type: "${payload.type}"`);
  }
}

export interface WhatsAppServiceEvents {
  qr: (channelId: string, qr: string) => void;
  'pairing-code': (channelId: string, code: string) => void;
  'connection-update': (
    channelId: string,
    status: string,
    lastDisconnect?: any,
  ) => void;
  message: (channelId: string, payload: any) => void;
  'message-status': (channelId: string, status: any) => void;
  call: (channelId: string, payload: any) => void;
}

export class WhatsAppService extends EventEmitter {
  private connections: Map<string, WASocket> = new Map();
  private connectionStatus: Map<string, string> = new Map();
  private groupCache: NodeCache;
  private phoneValidationCache: NodeCache;
  private preloadAttempts: Map<string, number> = new Map(); // Track preload attempts per channel
  private lastPreloadAttempt: Map<string, number> = new Map(); // Track last preload timestamp
  // T3: track conflict-recoverable reconnect attempts so we can apply backoff
  // and cap to MAX_CONFLICT_RECONNECTS before escalating to logged_out.
  private reconnectAttempts: Map<string, number> = new Map();
  // T8: track pending reconnect timers so teardownSocket can cancel a stale
  // setTimeout before a new socket is spawned (otherwise concurrent sockets
  // pile up → conflict + listener leak → heap OOM).
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  // Defers clearing the conflict-attempt budget until a connection has stayed
  // open for CONFLICT_STABLE_RESET_MS. Prevents a flapping conflict (open ->
  // replaced in seconds) from resetting the counter and looping forever.
  private stableTimers: Map<string, NodeJS.Timeout> = new Map();
  // Tracks channels we've already alerted about a persistent conflict, so we
  // log/notify once (not every retry) until they recover.
  private conflictAlerted: Set<string> = new Set();
  // Transport-aware escalation: last transport-level disconnect (428/408/503/515
  // / network blip) per channel. When MASS_TRANSPORT_DROP_THRESHOLD distinct
  // channels appear here within MASS_TRANSPORT_WINDOW_MS we infer a HOST uplink
  // outage (power/router/ISP/DNS), not per-channel WhatsApp auth failure.
  private transportDropTimes: Map<string, number> = new Map();
  // While Date.now() < this, suppress terminal auth-rejection escalation: a 401
  // "Connection Failure" right after a host outage is the uplink recovering, not
  // a revoked session. Set by recordTransportDrop, read by the close handler.
  private networkOutageActiveUntil = 0;
  // Set by gracefulShutdownAll so pending reconnect timers that fire mid-shutdown
  // don't spawn a fresh socket the SIGKILL then yanks (→ ghost slot → conflict).
  private isShuttingDown = false;
  // Serializes connectChannel per channel. WHY: two same-second callers (the
  // transitory reconnect timer + the auto-heal cron, 2026-07-07 incident) both
  // passed the connections.has() check during the ~3s of awaits before
  // connections.set → two sockets with the same device identity → the loser of
  // the map race became an invisible orphan holding the WhatsApp slot → every
  // later reconnect 401-looped into a false terminal parking.
  private connectInFlight: Map<string, Promise<void>> = new Map();
  // Every not-yet-destroyed socket per channel — INCLUDING orphans that lost
  // the connections-map slot. Lets parking/disconnect/ghost-recovery destroy
  // ALL of them, which is the only way to guarantee the device slot is free.
  private liveSockets: Map<string, Set<WASocket>> = new Map();
  // Ghost-recovery cycles within the current auth-rejection streak (cleared on
  // a stable open). Caps the "opened during streak → conflict, not revocation"
  // rescue so a session revoked right after an open still parks eventually.
  private ghostRecoveryAttempts: Map<string, number> = new Map();

  constructor() {
    super();

    // Initialize group metadata cache
    // Cache for 1 hour (3600 seconds) with automatic cleanup every 5 minutes
    this.groupCache = new NodeCache({
      stdTTL: 3600, // 1 hour
      checkperiod: 300, // Check for expired keys every 5 minutes
      useClones: false, // Don't clone objects for better performance
    });

    // Initialize phone number validation cache
    // Cache for 24 hours (86400 seconds) with automatic cleanup every 1 hour
    this.phoneValidationCache = new NodeCache({
      stdTTL: 86400, // 24 hours
      checkperiod: 3600, // Check for expired keys every 1 hour
      useClones: false, // Don't clone objects for better performance
    });

    // Memory heartbeat — one structured, greppable line every 5 min so heap
    // creep (residual / Baileys-internal leak #2090/#2104) is visible OVER TIME
    // in the logs without re-bloating them. Pairs with GET /health_check/channels
    // for live state. .unref() so it never keeps the process alive on shutdown.
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      console.log(
        `🧠 [heartbeat] rss=${Math.round(memoryUsage.rss / 1048576)}mb ` +
          `heapUsed=${Math.round(memoryUsage.heapUsed / 1048576)}mb ` +
          `sockets=${this.connections.size} ` +
          `reconnecting=${this.reconnectAttempts.size}`,
      );
    }, 5 * 60 * 1000).unref();
  }

  /**
   * Restores all active channels on server restart
   */
  /**
   * Cleanly close every active WhatsApp socket without invalidating auth.
   *
   * WHY this exists: PM2 restart sends SIGTERM, we kill the process within
   * ~1.6s. If the WhatsApp WebSocket is yanked without a graceful close,
   * WhatsApp's server keeps the device slot "live" for some seconds. When
   * the new process boots and connects with the same auth, WhatsApp sees
   * two sockets from the same device-id and replies with
   * <conflict type="replaced"/>, cascading the channel into logged_out.
   *
   * Calling sock.end(undefined) tells WhatsApp "device intentionally
   * disconnected, free the slot" — auth stays valid, next boot reconnects
   * cleanly with no QR re-pair needed. This is what makes deploys
   * production-grade for clients.
   */
  async gracefulShutdownAll(): Promise<void> {
    // Stop any pending reconnect from spawning a socket the imminent SIGKILL
    // would yank ungracefully (→ ghost device slot → <conflict> on next boot).
    this.isShuttingDown = true;
    for (const [channelId, timer] of this.reconnectTimers.entries()) {
      clearTimeout(timer);
      this.reconnectTimers.delete(channelId);
    }
    for (const [channelId, timer] of this.stableTimers.entries()) {
      clearTimeout(timer);
      this.stableTimers.delete(channelId);
    }

    // Include channels whose only remaining socket is an ORPHAN (outside the
    // connections map) — leaving one alive across a restart keeps the device
    // slot busy and 401-conflicts the restored socket.
    const channelIds = Array.from(
      new Set([...this.connections.keys(), ...this.liveSockets.keys()]),
    );
    if (channelIds.length === 0) {
      console.log('⏭️ No active WhatsApp sockets to close');
      return;
    }
    console.log(
      `🔌 Gracefully closing sockets for ${channelIds.length} channel(s) before shutdown`,
    );
    await Promise.allSettled(
      channelIds.map(async (channelId) => {
        try {
          this.connectionStatus.set(channelId, 'shutting_down');
          // Full teardown: end() alone leaks listeners; here we also want the
          // device slot freed cleanly so the next boot reconnects without QR.
          this.destroyAllSocketsForChannel(channelId);
          console.log(`✅ Socket(s) closed cleanly for ${channelId}`);
        } catch (error) {
          console.warn(`⚠️ Error closing socket for ${channelId}:`, error);
        }
      }),
    );
  }

  async restoreActiveChannels(): Promise<void> {
    try {
      console.log('🔄 Restoring active WhatsApp channels...');

      // Find all channels that were active before server restart
      // Exclude 'disconnected' channels to prevent restoration
      const activeChannels = await Channel.find({
        type: 'whatsapp_automated',
        status: {
          $in: ['active', 'connecting', 'qr_ready', 'pairing_code_ready'],
          $nin: ['disconnected'],
        },
        isActive: true,
      });

      console.log(`📱 Found ${activeChannels.length} channels to restore`);

      // Reconnect each channel with staggered delays
      for (let i = 0; i < activeChannels.length; i++) {
        const channel = activeChannels[i];

        try {
          // WHY: a session WhatsApp already revoked (persisted terminal
          // auth-rejection streak) rejects EVERY fresh login — restoring it
          // just re-enters the 401 loop until it re-escalates. Park it as
          // logged_out up front so boot doesn't resurrect dead channels.
          const channelConfig = (channel.config ?? {}) as WhatsAppAutomatedConfig;
          const authRejectionStreak = channelConfig.authRejectionStreak ?? 0;
          const streakAgeMs = channelConfig.authRejectionStreakStartedAt
            ? Date.now() -
              new Date(channelConfig.authRejectionStreakStartedAt).getTime()
            : 0;
          const isRevokedSession =
            authRejectionStreak >= TERMINAL_AUTH_REJECTION_COUNT &&
            streakAgeMs >= TERMINAL_AUTH_REJECTION_WINDOW_MS;
          if (isRevokedSession) {
            console.log(
              `🚪 ${channel.channelId}: skipping restore — parked as logged_out (revoked session, streak ${authRejectionStreak})`,
            );
            await this.updateChannelStatus(channel.channelId, 'logged_out');
            continue;
          }

          console.log(
            `🔄 Restoring channel: ${channel.channelId} (${channel.name})`,
          );

          // Reset status to connecting for restoration
          await this.updateChannelStatus(channel.channelId, 'connecting');

          // Set initial memory status
          this.connectionStatus.set(channel.channelId, 'connecting');

          // Attempt to reconnect
          await this.connectChannel(channel.channelId);

          // Add delay between connections to avoid overwhelming
          if (i < activeChannels.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
          }
        } catch (error) {
          console.error(
            `❌ Failed to restore channel ${channel.channelId}:`,
            error,
          );
          await this.updateChannelStatus(channel.channelId, 'error');
        }
      }
      console.log('✅ Channel restoration completed');
    } catch (error) {
      console.error('❌ Error during channel restoration:', error);
    }
  }

  /**
   * Converts MongoDB Binary objects back to Node.js Buffers
   */
  private convertBinaryToBuffer(obj: any): any {
    if (!obj) return obj;

    if (obj && typeof obj === 'object') {
      // Handle MongoDB Binary type
      if (obj._bsontype === 'Binary' && obj.buffer) {
        return Buffer.from(obj.buffer);
      }

      // Handle Uint8Array
      if (obj instanceof Uint8Array) {
        return Buffer.from(obj);
      }

      // Recursively convert nested objects
      if (Array.isArray(obj)) {
        return obj.map((item) => this.convertBinaryToBuffer(item));
      }

      // Handle regular objects
      const converted: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          converted[key] = this.convertBinaryToBuffer(obj[key]);
        }
      }
      return converted;
    }

    return obj;
  }

  /**
   * Creates MongoDB-based auth state for production use with LID support
   */
  private async createMongoAuthState(
    channelId: string,
  ): Promise<AuthenticationState> {
    // Try to load existing creds
    let authState = await WhatsAppAuthState.findOne({ channelId });
    let creds: AuthenticationCreds;

    if (authState) {
      // Convert MongoDB Binary objects back to Buffers
      creds = this.convertBinaryToBuffer(authState.creds);
    } else {
      // Initialize new credentials
      creds = initAuthCreds();
      authState = new WhatsAppAuthState({
        channelId,
        creds,
      });
      await authState.save();
    }

    // Load existing keys
    const existingKeys = await WhatsAppAuthKey.find({ channelId });
    const keys = new Map<string, any>();

    existingKeys.forEach((keyDoc) => {
      // Convert Binary objects back to Buffers for each key
      const convertedKeyData = this.convertBinaryToBuffer(keyDoc.keyData);
      keys.set(keyDoc.keyId, convertedKeyData);
    });

    // Create base key store
    const baseKeyStore = {
      get: (type: string, ids: string[]) => {
        const result: { [id: string]: any } = {};
        ids.forEach((id) => {
          const key = keys.get(`${type}:${id}`);
          if (key) result[id] = key;
        });
        return result;
      },
      set: async (data: any) => {
        const promises: Promise<any>[] = [];

        for (const category in data) {
          for (const id in data[category]) {
            const keyId = `${category}:${id}`;
            const keyData = data[category][id];

            keys.set(keyId, keyData);

            promises.push(
              WhatsAppAuthKey.findOneAndUpdate(
                { channelId, keyId },
                { keyData },
                { upsert: true, new: true },
              ),
            );
          }
        }

        await Promise.all(promises);
      },
    };

    // Wrap with cacheable signal key store for LID support (Baileys 7 requirement)
    // Create a simple logger that matches Baileys' ILogger interface
    const logger = {
      level: 'info' as const,
      child: () => logger,
      trace: (...args: any[]) => console.debug(...args),
      debug: (...args: any[]) => console.debug(...args),
      info: (...args: any[]) => console.info(...args),
      warn: (...args: any[]) => console.warn(...args),
      error: (...args: any[]) => console.error(...args),
      fatal: (...args: any[]) => console.error(...args),
    };
    const cachedKeyStore = makeCacheableSignalKeyStore(baseKeyStore, logger);

    return {
      creds,
      keys: cachedKeyStore,
    };
  }

  /**
   * Saves updated credentials to MongoDB
   */
  private async saveCreds(channelId: string, creds: AuthenticationCreds) {
    // Check if channel still exists before saving credentials
    if (!this.connections.has(channelId)) {
      console.log(
        `⚠️ Ignoring credential save for deleted channel: ${channelId}`,
      );
      return;
    }

    await WhatsAppAuthState.findOneAndUpdate(
      { channelId },
      { creds },
      { upsert: true, new: true },
    );
  }

  /**
   * Connects or reconnects a WhatsApp channel (serialized per channel)
   */
  async connectChannel(
    channelId: string,
    phoneNumber?: string,
    options: { allowPairing?: boolean } = {},
  ): Promise<void> {
    // WHY: concurrent callers must JOIN the in-flight attempt, never spawn a
    // second socket — the loser of the connections.set race becomes an orphan
    // that holds the WhatsApp device slot and 401-conflicts every reconnect.
    // Exception: a human pairing-intent call must NOT be swallowed by an
    // automatic attempt (which captured allowPairing=false) — wait for the
    // in-flight attempt to settle, then run its own attempt.
    let inFlight = this.connectInFlight.get(channelId);
    while (inFlight) {
      if (!options.allowPairing) {
        console.log(
          `⏭️ ${channelId} connect already in flight — joining the existing attempt`,
        );
        return inFlight;
      }
      console.log(
        `⏳ ${channelId} waiting for in-flight connect before human pairing attempt`,
      );
      await inFlight.catch(() => undefined);
      inFlight = this.connectInFlight.get(channelId);
    }
    const attempt = this.doConnectChannel(channelId, phoneNumber, options).finally(
      () => {
        if (this.connectInFlight.get(channelId) === attempt) {
          this.connectInFlight.delete(channelId);
        }
      },
    );
    this.connectInFlight.set(channelId, attempt);
    return attempt;
  }

  private async doConnectChannel(
    channelId: string,
    phoneNumber?: string,
    options: { allowPairing?: boolean } = {},
  ): Promise<void> {
    try {
      console.log(`🔄 Connecting WhatsApp channel: ${channelId}`);

      // WHY: WhatsApp expels sessions with <conflict type="replaced"/> when two
      // sockets from the same device-id stay connected. Multiple paths can call
      // connectChannel concurrently (restoration, setTimeout reactive reconnect,
      // auto-heal cron, /connect endpoint). Without this guard, parallel sockets
      // race and cascade into permanent logged_out. Always close any existing
      // socket first, then wait briefly for the close to propagate.
      if (this.connections.has(channelId) || this.liveSockets.has(channelId)) {
        console.log(
          `🔌 Existing/orphan socket(s) detected for ${channelId} — resetting before reconnect to avoid <conflict type=replaced>`,
        );
        await this.resetSocketConnection(channelId);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Update channel status
      await this.updateChannelStatus(channelId, 'connecting');

      // Store phoneNumber in config if provided
      if (phoneNumber) {
        await this.updateChannelConfig(channelId, { phoneNumber });
        console.log(`📱 Stored phoneNumber for ${channelId}: ${phoneNumber}`);
      }

      // For new connections, clear existing auth state to avoid Binary conversion issues
      const existingAuth = await WhatsAppAuthState.findOne({ channelId });
      if (!existingAuth) {
        console.log(
          `🆕 Creating fresh auth state for new channel: ${channelId}`,
        );
      }

      // Create auth state
      const auth = await this.createMongoAuthState(channelId);

      // Fetch the latest WhatsApp Web version
      const { version, isLatest } = await fetchLatestWaWebVersion({});
      console.log(
        `📱 Using WhatsApp Web version: ${version.join(
          '.',
        )} (isLatest: ${isLatest})`,
      );

      // WHY Browsers.ubuntu('Chrome') (WEB_BROWSER tuple): since ~2026-06-29
      // WhatsApp rejects WIN32/DARWIN Desktop sub-platform tuples with a fast
      // 428 "Connection Terminated" right after the handshake — Baileys
      // #2677/#2671. The previous Browsers.windows('WhatsApp Web') "anti-ban"
      // simulation now triggers exactly the rejection it tried to avoid.
      const sock = makeWASocket({
        version, // Use the fetched version
        auth,
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        markOnlineOnConnect: false, // Critical: prevents auto online status
        syncFullHistory: false, // Reduces bandwidth and suspicion
        // 25s ping is what real WA Web uses; defaults are too aggressive and
        // make Baileys look bot-like, increasing chance of session rejection
        // (per Baileys issue #2110 community recommendations).
        keepAliveIntervalMs: 25_000,
        defaultQueryTimeoutMs: 60000,
        emitOwnEvents: false, // Don't emit events for own messages
        generateHighQualityLinkPreview: true, // Enable large thumbnail link previews
        // Implement cached group metadata to prevent rate limits and bans
        cachedGroupMetadata: async (jid) => {
          const cached = this.groupCache.get(jid);
          if (cached) {
            console.log(`📋 Using cached group metadata for ${jid}`);
            return cached as GroupMetadata;
          }
          console.log(`🔍 No cached metadata found for group ${jid}`);
          return undefined;
        },
        // getMessage: async (key) => {
        //   // Implement message retrieval from your database
        //   return null;
        // },
      });

      // Store connection
      this.connections.set(channelId, sock);
      this.registerSocket(channelId, sock);
      this.connectionStatus.set(channelId, 'connecting');

      // WHY: WhatsApp's passkey rollout (Baileys #2672, ~2026-06-29) sends
      // passkey_prologue_request / crsc_continuation notifications during
      // pairing; Baileys has no handler for them, never ACKs, and the server
      // waits forever → device linking hangs until timeout. ACKing immediately
      // unblocks the flow (the owner still approves the passkey on the phone).
      for (const passkeyNotificationType of [
        'passkey_prologue_request',
        'crsc_continuation',
      ]) {
        sock.ws.on(
          `CB:notification,type:${passkeyNotificationType}`,
          async (notificationNode: BinaryNode) => {
            try {
              await sock.sendNode({
                tag: 'ack',
                attrs: {
                  id: notificationNode.attrs.id,
                  class: 'notification',
                  to: notificationNode.attrs.from,
                  type: notificationNode.attrs.type,
                },
              });
              console.log(
                `🔑 ${channelId} ACKed ${passkeyNotificationType} (passkey pairing flow)`,
              );
            } catch (ackError) {
              console.error(
                `❌ ${channelId} failed to ACK ${passkeyNotificationType}:`,
                ackError,
              );
            }
          },
        );
      }

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(
          channelId,
          update,
          phoneNumber,
          sock,
          options.allowPairing === true,
        );
      });

      // Handle credential updates
      sock.ev.on('creds.update', async () => {
        // WHY: creds from a socket that lost the map slot must not clobber
        // the valid creds in Mongo — and the emitter is a live duplicate.
        if (this.dropIfOrphan(channelId, sock, 'creds.update')) return;
        await this.saveCreds(channelId, auth.creds);
      });

      // Handle incoming messages
      sock.ev.on('messages.upsert', async (m) => {
        if (this.dropIfOrphan(channelId, sock, 'messages.upsert')) return;
        await this.handleIncomingMessages(channelId, m);
      });

      // Handle message status updates
      sock.ev.on('messages.update', async (updates) => {
        if (this.dropIfOrphan(channelId, sock, 'messages.update')) return;
        await this.handleMessageStatusUpdates(channelId, updates);
      });

      // Handle groups update for metadata caching
      sock.ev.on('groups.update', async (updates) => {
        if (this.dropIfOrphan(channelId, sock, 'groups.update')) return;
        console.log(
          `🔄 Groups updated for channel ${channelId}:`,
          updates.length,
        );

        // Only cache metadata that we already have or that's provided in the update
        // Avoid fetching metadata to prevent rate limits as per Baileys documentation
        for (const update of updates) {
          try {
            if (update.id) {
              // Only cache if we have the actual metadata in the update
              // Don't fetch it to avoid rate limits
              if (update.participants || update.subject || update.desc) {
                console.log(
                  `📋 Caching updated metadata for group ${update.id} (from update event)`,
                );
                // Cache the partial update - Baileys will handle full metadata when needed
                const existingCache =
                  (this.groupCache.get(update.id) as any) || {};
                const updatedMetadata = { ...existingCache, ...update };
                this.groupCache.set(update.id, updatedMetadata);
              }
            }
          } catch (error) {
            console.error(
              `❌ Error caching group metadata update for ${update.id}:`,
              error,
            );
          }
        }
      });

      // Handle incoming calls
      sock.ev.on('call', async (callEvents) => {
        if (this.dropIfOrphan(channelId, sock, 'call')) return;
        await this.handleIncomingCalls(channelId, callEvents);
      });

      // Handle LID mapping updates (Baileys 7 requirement)
      sock.ev.on('lid-mapping.update', async (mapping) => {
        if (this.dropIfOrphan(channelId, sock, 'lid-mapping.update')) return;
        if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
          console.log(
            `🔄 LID mapping update for channel ${channelId}:`,
            JSON.stringify(mapping, null, 2),
          );
        }
        // LID mappings are automatically stored in sock.signalRepository.lidMapping
        // You can access them via:
        // - sock.signalRepository.lidMapping.getLIDForPN(pn)
        // - sock.signalRepository.lidMapping.getPNForLID(lid)
      });
    } catch (error) {
      console.error(`❌ Error connecting channel ${channelId}:`, error);
      await this.updateChannelStatus(channelId, 'error');
      this.emit('connection-update', channelId, 'error', error);
    }
  }

  /**
   * Handles connection status updates
   */
  /**
   * Records a transport-level disconnect and, if enough DISTINCT channels drop
   * within the window, flags a host-network event so the close handler stops
   * escalating the ensuing 401 "Connection Failure" burst to terminal logout.
   */
  private recordTransportDrop(channelId: string): void {
    const now = Date.now();
    this.transportDropTimes.set(channelId, now);
    let recentChannels = 0;
    for (const [id, ts] of this.transportDropTimes.entries()) {
      if (now - ts <= MASS_TRANSPORT_WINDOW_MS) recentChannels++;
      else this.transportDropTimes.delete(id); // prune stale entries
    }
    if (recentChannels >= MASS_TRANSPORT_DROP_THRESHOLD) {
      const wasActive = now < this.networkOutageActiveUntil;
      this.networkOutageActiveUntil = now + NETWORK_OUTAGE_GRACE_MS;
      if (!wasActive) {
        console.warn(
          `🌐 Host-network event detected: ${recentChannels} channels dropped (transport) within ${Math.round(MASS_TRANSPORT_WINDOW_MS / 1000)}s — ` +
            `suppressing terminal auth-rejection escalation for ${Math.round(NETWORK_OUTAGE_GRACE_MS / 60_000)}min (uplink/power/DNS event, not per-channel revocation).`,
        );
      }
    }
  }

  /**
   * True while a recent host-uplink outage should mask 401s as recoverable.
   */
  private isHostNetworkEvent(): boolean {
    return Date.now() < this.networkOutageActiveUntil;
  }

  /**
   * Arms (or re-arms) a delayed reconnect for a channel (steady conflict
   * cooldown by default; ghost recovery passes its own longer delay).
   */
  private scheduleConflictCooldown(
    channelId: string,
    phoneNumber?: string,
    delayMs = CONFLICT_COOLDOWN_MS,
  ): void {
    const existingCooldown = this.reconnectTimers.get(channelId);
    if (existingCooldown) clearTimeout(existingCooldown);
    const t = setTimeout(() => {
      if (this.reconnectTimers.get(channelId) !== t) return; // superseded
      this.reconnectTimers.delete(channelId);
      if (this.isShuttingDown) return;
      void this.connectChannel(channelId, phoneNumber).catch((e) => {
        console.error(`❌ cooldown reconnect failed for ${channelId}:`, e);
        // WHY: a throw here (e.g. an Atlas blip mid-connect) produces no
        // 'close' event, so nothing else re-arms the loop — the channel froze
        // in 'error' forever (observed 2026-06-04 on 5af90a60 via
        // MongoNetworkError). Re-arm so retries — and the revocation
        // detector — keep progressing.
        this.scheduleConflictCooldown(channelId, phoneNumber);
      });
    }, delayMs);
    t.unref();
    this.reconnectTimers.set(channelId, t);
  }

  private async handleConnectionUpdate(
    channelId: string,
    update: Partial<ConnectionState>,
    phoneNumber?: string,
    eventSock?: WASocket,
    allowPairing = false,
  ) {
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (!this.connections.has(channelId) && currentStatus !== 'disconnecting') {
      console.log(
        `⚠️ Ignoring connection update for deleted channel: ${channelId}`,
      );
      // A socket still emitting events for an unmapped channel is an orphan
      // (e.g. it survived a terminal parking) — destroy it so it can't keep
      // holding the WhatsApp device slot and 401-conflict future reconnects.
      if (eventSock) {
        this.destroyOrphanSocket(channelId, eventSock, 'deleted channel');
      }
      return;
    }

    // Skip processing if channel is being disconnected or already disconnected
    if (currentStatus === 'disconnecting' || currentStatus === 'disconnected') {
      console.log(
        `⚠️ Ignoring connection update for ${currentStatus} channel: ${channelId}`,
      );
      return;
    }

    const { connection, lastDisconnect, qr } = update;

    console.log(`📱 Connection update for ${channelId}:`, {
      connection,
      qr: !!qr,
    });

    if (qr) {
      // Generate QR code
      const qrDataURL = await QRCode.toDataURL(qr);
      await this.updateChannelStatus(channelId, 'qr_ready');

      // Store QR code in channel config
      await this.updateChannelConfig(channelId, { qrCode: qrDataURL });

      this.emit('qr', channelId, qrDataURL);
    }

    if (connection === 'connecting' && phoneNumber) {
      const sock = eventSock ?? this.connections.get(channelId);
      if (sock && !sock.authState.creds.registered) {
        if (!allowPairing) {
          // WHY: auto-reconnects must NEVER request a pairing code — creds can
          // read as unregistered mid-rotation, and the resulting pairing-mode
          // socket is rogue registration traffic that lingers waiting for a
          // code nobody will type (2026-07-06/07: 5 codes fired mid-401-loop).
          console.warn(
            `⚠️ ${channelId} creds read as unregistered during auto-reconnect — NOT requesting pairing code`,
          );
        } else {
          try {
            const code = await sock.requestPairingCode(phoneNumber);
            await this.updateChannelStatus(channelId, 'pairing_code_ready');
            this.emit('pairing-code', channelId, code);
          } catch (error) {
            console.error(
              `❌ Error requesting pairing code for ${channelId}:`,
              error,
            );
          }
        }
      }
    }

    if (connection === 'close') {
      const disconnectError = lastDisconnect?.error as Boom | undefined;
      const disconnectStatusCode = disconnectError?.output?.statusCode;
      const disconnectReasonName =
        disconnectStatusCode != null
          ? (DisconnectReason[
              disconnectStatusCode as DisconnectReason
            ] ?? `unknown(${disconnectStatusCode})`)
          : 'no_error_object';
      const disconnectMessage =
        disconnectError?.output?.payload?.message ??
        disconnectError?.message ??
        'n/a';
      console.log(
        `📴 ${channelId} disconnect | statusCode=${disconnectStatusCode} reason=${disconnectReasonName} message="${disconnectMessage}"`,
      );
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log(
          `📴 ${channelId} disconnect raw:`,
          JSON.stringify({
            payload: disconnectError?.output?.payload,
            data: disconnectError?.data,
            isBoom: disconnectError?.isBoom,
          }),
        );
      }

      // Identity guard: if this 'close' came from a socket we ALREADY replaced
      // (a late close racing a fresh socket), do NOT run teardownSocket — it
      // would delete the live socket from the map and cancel its reconnect
      // timer. Just drop the stale socket's own listeners/transport and bail.
      const liveSock = this.connections.get(channelId);
      if (eventSock && liveSock && liveSock !== eventSock) {
        this.destroyOrphanSocket(
          channelId,
          eventSock,
          "stale 'close' from a replaced socket — live socket untouched",
        );
        return;
      }

      // A close cancels the pending stability reset: a connection that dropped
      // before proving stable must NOT clear its conflict/ghost budgets.
      // WHY after the identity guard: a stale close from a replaced socket
      // must not cancel the LIVE socket's stability timer.
      const pendingStable = this.stableTimers.get(channelId);
      if (pendingStable) {
        clearTimeout(pendingStable);
        this.stableTimers.delete(channelId);
      }

      // T8: tear down the dead socket COMPLETELY before deciding what to do
      // next. The socket has already fired 'close', but its event listeners
      // (closures over `this`, auth.creds, the socket) remain referenced —
      // across 1894 reconnects this leaked ~6GB → FATAL OOM. teardownSocket
      // also clears any pending reconnect timer so we don't pile up sockets.
      this.teardownSocket(channelId, eventSock ?? liveSock);

      // T3: classify the close into one of three buckets so we stop treating
      // every 401 as terminal. A 401 with a `conflict`/`replaced` message means
      // another device picked up the session (or our own previous OOM-restart
      // left a ghost slot) — creds are still valid, retry with backoff. Only
      // device_removed / forbidden / badSession / a plain 401 are truly
      // terminal (need QR re-pair).
      const msg = (disconnectMessage || '').toLowerCase();
      const isConflict =
        disconnectStatusCode === DisconnectReason.connectionReplaced ||
        (disconnectStatusCode === DisconnectReason.loggedOut &&
          /(conflict|replaced|connection failure)/.test(msg) &&
          !/device_removed/.test(msg));
      const isTerminal =
        /device_removed/.test(msg) ||
        disconnectStatusCode === 403 ||
        disconnectStatusCode === DisconnectReason.badSession ||
        (disconnectStatusCode === DisconnectReason.loggedOut && !isConflict);

      const fireTerminalDisconnectedWebhook = async () => {
        try {
          const channelDoc = await Channel.findOne({ channelId });
          const phoneFromConfig = (channelDoc?.config as WhatsAppAutomatedConfig)?.phoneNumber;
          this.sendToWebhooks(channelId, 'channel.disconnected', {
            channelId,
            phoneNumber: phoneFromConfig ?? phoneNumber ?? null,
            channelName: channelDoc?.name ?? null,
            reason: disconnectReasonName,
            statusCode: disconnectStatusCode ?? null,
            message: disconnectMessage,
            willReconnect: false,
            disconnectedAt: new Date().toISOString(),
            // disconnectedAtLocal is auto-added per-webhook by withLocalTimestamps
            // using webhook.timezone (default UTC). See sendWebhookWithRetry.
          });
        } catch (err) {
          console.error(`❌ Failed to fire channel.disconnected for ${channelId}:`, err);
        }
      };

      if (isTerminal) {
        console.log(`🚪 ${channelId} logged out (terminal: ${disconnectReasonName})`);
        // Quarantine: kill orphans too, so the device slot is truly free for
        // the human re-pair (a surviving duplicate would conflict the new QR).
        this.destroyAllSocketsForChannel(channelId);
        this.reconnectAttempts.delete(channelId);
        this.conflictAlerted.delete(channelId);
        this.ghostRecoveryAttempts.delete(channelId);
        await this.updateChannelStatus(channelId, 'logged_out');
        // WHY: connectedAt drives the "Connected since" UI marker; leaving it
        // set makes a logged-out channel look connected. Clear it on logout.
        await this.updateChannelConfig(channelId, { connectedAt: null });
        channelMetrics.record(channelId, 'logged_out', {
          statusCode: disconnectStatusCode ?? null,
          reason: disconnectReasonName,
          message: disconnectMessage,
          status: 'logged_out',
        });
        await fireTerminalDisconnectedWebhook();
      } else if (isConflict) {
        // Revocation detector: a session revoked by WhatsApp presents EXACTLY
        // like a recoverable ghost conflict (401 + "Connection Failure") — the
        // only reliable difference is that it rejects EVERY fresh socket,
        // forever. Track the streak in the DB so it survives process restarts
        // and manual /connect calls. 440 connectionReplaced is excluded: a
        // real competing device self-heals when it closes.
        // Transport-aware escalation: during a detected host-uplink outage a
        // 401 "Connection Failure" is the network recovering (mass re-handshake
        // after the blip), NOT a revoked session — do NOT count it toward the
        // terminal streak. Genuine revocation keeps 401-ing after the grace and
        // escalates then.
        const hostNetworkEvent = this.isHostNetworkEvent();
        const isAuthRejection =
          !hostNetworkEvent &&
          disconnectStatusCode === DisconnectReason.loggedOut &&
          /connection failure/.test(msg);
        if (
          hostNetworkEvent &&
          disconnectStatusCode === DisconnectReason.loggedOut &&
          /connection failure/.test(msg)
        ) {
          console.warn(
            `🌐 ${channelId} 401 "Connection Failure" during host-network grace — treating as recoverable, no terminal escalation.`,
          );
        }
        let escalatedToTerminal = false;
        let escalatedToGhostRecovery = false;
        if (isAuthRejection) {
          try {
            const channelDoc = await Channel.findOne({ channelId });
            const channelConfig = (channelDoc?.config ??
              {}) as WhatsAppAutomatedConfig;
            const streak = (channelConfig.authRejectionStreak ?? 0) + 1;
            const streakStartedAt =
              channelConfig.authRejectionStreakStartedAt ?? new Date();
            await this.updateChannelConfig(channelId, {
              authRejectionStreak: streak,
              authRejectionStreakStartedAt: streakStartedAt,
            });
            const streakAgeMs =
              Date.now() - new Date(streakStartedAt).getTime();
            const streakIsTerminal =
              streak >= TERMINAL_AUTH_REJECTION_COUNT &&
              streakAgeMs >= TERMINAL_AUTH_REJECTION_WINDOW_MS;
            // Ghost detector: a revoked session can NEVER open — so an open
            // (config.connectedAt) at/after the streak start means these 401s
            // are a conflict against OUR OWN duplicate socket, not a
            // revocation (2026-07-07: false-positive parking of b3c83f00).
            const lastOpenAtMs = channelConfig.connectedAt
              ? new Date(channelConfig.connectedAt).getTime()
              : 0;
            const openedDuringStreak =
              lastOpenAtMs >=
              new Date(streakStartedAt).getTime() - GHOST_OPEN_SLACK_MS;
            const priorGhostAttempts =
              this.ghostRecoveryAttempts.get(channelId) ?? 0;
            if (
              streakIsTerminal &&
              openedDuringStreak &&
              priorGhostAttempts < MAX_GHOST_RECOVERIES
            ) {
              const ghostAttempt = priorGhostAttempts + 1;
              this.ghostRecoveryAttempts.set(channelId, ghostAttempt);
              console.warn(
                `👻 ${channelId} 401 streak ${streak} but the session OPENED during the streak — self-conflict, not revocation. ` +
                  `Ghost recovery ${ghostAttempt}/${MAX_GHOST_RECOVERIES}: destroying all sockets, ONE clean reconnect in ${Math.round(GHOST_RECOVERY_DELAY_MS / 1000)}s.`,
              );
              this.destroyAllSocketsForChannel(channelId);
              this.reconnectAttempts.delete(channelId);
              await this.updateChannelStatus(channelId, 'connecting');
              channelMetrics.record(channelId, 'ghost_recovery', {
                statusCode: disconnectStatusCode ?? null,
                reason: disconnectReasonName,
                message: disconnectMessage,
                attempt: ghostAttempt,
                status: 'connecting',
              });
              this.scheduleConflictCooldown(
                channelId,
                phoneNumber,
                GHOST_RECOVERY_DELAY_MS,
              );
              escalatedToGhostRecovery = true;
            } else if (streakIsTerminal) {
              // Every fresh socket has been rejected for the whole window →
              // no QR-less revival is possible. Declare terminal and stop
              // retrying. WHY parking is unconditional: it used to be gated
              // on !terminalNotifiedAt (the once-only webhook latch); a stale
              // latch — from a lost concurrent write or a manual /connect on
              // an already-revoked channel — left channels 401-looping every
              // 45s for days (observed streak 12,914). Only the WEBHOOK is
              // deduped, scoped to the current streak.
              const wasNotifiedThisStreak =
                !!channelConfig.terminalNotifiedAt &&
                new Date(channelConfig.terminalNotifiedAt).getTime() >=
                  new Date(streakStartedAt).getTime();
              console.log(
                `🚪 ${channelId} session revoked by WhatsApp (${streak} consecutive auth rejections over ${Math.round(streakAgeMs / 60_000)}min) — escalating to logged_out`,
              );
              // Quarantine: kill orphans too, so "parked" really means zero
              // live sockets (an orphan surviving parking kept the slot busy
              // and events flowing for 1h on 2026-07-07).
              this.destroyAllSocketsForChannel(channelId);
              this.reconnectAttempts.delete(channelId);
              this.conflictAlerted.delete(channelId);
              this.ghostRecoveryAttempts.delete(channelId);
              await this.updateChannelStatus(channelId, 'logged_out');
              await this.updateChannelConfig(channelId, {
                connectedAt: null,
                ...(wasNotifiedThisStreak
                  ? {}
                  : { terminalNotifiedAt: new Date() }),
              });
              channelMetrics.record(channelId, 'logged_out', {
                statusCode: disconnectStatusCode ?? null,
                reason: disconnectReasonName,
                message: disconnectMessage,
                attempt: streak,
                status: 'logged_out',
              });
              if (!wasNotifiedThisStreak) {
                await fireTerminalDisconnectedWebhook();
              }
              escalatedToTerminal = true;
            }
          } catch (streakError) {
            // A DB blip must not break the close handler — the retry below
            // still runs and the streak resumes on the next 401.
            console.error(
              `❌ auth-rejection streak tracking failed for ${channelId}:`,
              streakError,
            );
          }
        }
        const attempt = this.reconnectAttempts.get(channelId) ?? 0;
        if (escalatedToTerminal || escalatedToGhostRecovery) {
          // Terminal: a human must re-pair. Ghost recovery: its own single
          // delayed reconnect is already armed — no extra retry here.
        } else if (attempt >= MAX_CONFLICT_RECONNECTS) {
          // Fast attempts exhausted on a PERSISTENT conflict. Creds are still
          // valid → do NOT force a QR re-pair. Hold at a steady cooldown and
          // keep retrying: the channel self-heals when the competing device
          // (another linked WhatsApp Web on the same number) closes. Alert once.
          if (!this.conflictAlerted.has(channelId)) {
            this.conflictAlerted.add(channelId);
            console.warn(
              `⚠️ ${channelId} persistent conflict — another device holds the session. ` +
                `Steady retry every ${CONFLICT_COOLDOWN_MS}ms (no QR; creds valid). Check Linked Devices.`,
            );
            channelMetrics.record(channelId, 'conflict', {
              statusCode: disconnectStatusCode ?? null,
              reason: disconnectReasonName,
              message: disconnectMessage,
              attempt,
              status: 'connecting',
            });
          }
          await this.updateChannelStatus(channelId, 'connecting');
          this.scheduleConflictCooldown(channelId, phoneNumber);
        } else {
          const next = attempt + 1;
          this.reconnectAttempts.set(channelId, next);
          const delay =
            CONFLICT_BACKOFF_MS[Math.min(attempt, CONFLICT_BACKOFF_MS.length - 1)];
          console.log(
            `🔁 ${channelId} conflict recoverable, attempt ${next}/${MAX_CONFLICT_RECONNECTS} in ${delay}ms`,
          );
          channelMetrics.record(channelId, 'conflict', {
            statusCode: disconnectStatusCode ?? null,
            reason: disconnectReasonName,
            message: disconnectMessage,
            attempt: next,
            status: 'connecting',
          });
          await this.updateChannelStatus(channelId, 'connecting');
          const t = setTimeout(() => {
            this.reconnectTimers.delete(channelId);
            if (this.isShuttingDown) return; // don't spawn a socket mid-shutdown
            this.connectChannel(channelId, phoneNumber);
          }, delay);
          t.unref(); // don't keep the process alive on shutdown
          this.reconnectTimers.set(channelId, t);
        }
      } else {
        // Transitory (428/408/503/515/network blip): reconnect fast.
        // Feed the host-network detector: a cluster of these across channels
        // means the HOST lost its uplink, not a per-channel failure.
        this.recordTransportDrop(channelId);
        console.log(`🔄 Reconnecting ${channelId} (transitory ${disconnectReasonName})...`);
        channelMetrics.record(channelId, 'reconnect', {
          statusCode: disconnectStatusCode ?? null,
          reason: disconnectReasonName,
          message: disconnectMessage,
          status: 'connecting',
        });
        await this.updateChannelStatus(channelId, 'connecting');
        const t = setTimeout(() => {
          this.reconnectTimers.delete(channelId);
          if (this.isShuttingDown) return; // don't spawn a socket mid-shutdown
          this.connectChannel(channelId, phoneNumber);
        }, TRANSITORY_RECONNECT_DELAY_MS);
        t.unref(); // don't keep the process alive on shutdown
        this.reconnectTimers.set(channelId, t);
      }
    }

    if (connection === 'open') {
      // Identity guard (mirror of the close handler's): an 'open' from a socket
      // that already lost the connections-map slot is an orphan winning the
      // login race. Marking the channel active from it would hide a live
      // duplicate that 401-conflicts every real reconnect — destroy it instead.
      // Its open still disproves revocation, so persist connectedAt first.
      const openSock = this.connections.get(channelId);
      if (eventSock && openSock && openSock !== eventSock) {
        await this.updateChannelConfig(channelId, { connectedAt: new Date() });
        this.destroyOrphanSocket(
          channelId,
          eventSock,
          "'open' won by a replaced socket — live socket untouched",
        );
        return;
      }
      console.log(`✅ ${channelId} connected successfully`);
      await this.updateChannelStatus(channelId, 'active');
      this.connectionStatus.set(channelId, 'active');

      // T3/T8: clear any pending reconnect timer that may have fired late after
      // a successful manual /connect call.
      const pendingTimer = this.reconnectTimers.get(channelId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.reconnectTimers.delete(channelId);
      }
      // WHY: only drop the conflict-attempt budget once the connection has
      // PROVEN stable (stayed open CONFLICT_STABLE_RESET_MS). A flapping
      // conflict (open -> replaced in seconds) must not reset the counter, or
      // it loops forever without escalating to the steady cooldown. Same for
      // the ghost-recovery budget: a recovery whose open flaps back to 401
      // must not regain rescue cycles, or MAX_GHOST_RECOVERIES never parks a
      // session revoked right after an open. A later 'close' cancels this
      // timer (see the close handler). Only arm the stability reset if
      // there's a budget/alert to clear.
      if (
        this.reconnectAttempts.has(channelId) ||
        this.conflictAlerted.has(channelId) ||
        this.ghostRecoveryAttempts.has(channelId)
      ) {
        const prevStable = this.stableTimers.get(channelId);
        if (prevStable) clearTimeout(prevStable);
        const stable = setTimeout(() => {
          if (this.stableTimers.get(channelId) !== stable) return; // superseded
          this.reconnectAttempts.delete(channelId);
          this.conflictAlerted.delete(channelId);
          this.ghostRecoveryAttempts.delete(channelId);
          this.stableTimers.delete(channelId);
        }, CONFLICT_STABLE_RESET_MS);
        stable.unref();
        this.stableTimers.set(channelId, stable);
      }
      channelMetrics.record(channelId, 'open', { status: 'active' });

      // A successful open DISPROVES revocation (a revoked session never gets
      // past "logging in"). Clear the persistent auth-rejection streak and
      // re-arm the webhook guard for future outages. WHY awaited: fired
      // unawaited, this clear raced the {phoneNumber, connectedAt} write a few
      // lines below — the old read-modify-write updateChannelConfig lost it,
      // resurrecting the stale streak/latch (proven: f97e6fc4 wrote streak=0
      // and 22s later the next 401 resumed the streak at 17).
      await this.updateChannelConfig(channelId, {
        authRejectionStreak: 0,
        authRejectionStreakStartedAt: null,
        terminalNotifiedAt: null,
      });

      // Reset preload attempts on successful connection
      this.preloadAttempts.delete(channelId);
      this.lastPreloadAttempt.delete(channelId);

      // Update channel config with phoneNumber if provided
      if (phoneNumber) {
        await this.updateChannelConfig(channelId, { phoneNumber });
      }

      // Get the connected phone number from Baileys and update config
      const sock = this.connections.get(channelId);
      if (sock && sock.user?.id) {
        const connectedPhoneNumber = sock.user.id.split(':')[0];

        // WHY: detect phone rotation on the same channelId so downstream
        // consumers (chatbot-mujeron, n8n) can sync their Bot docs. Read the
        // previous phone BEFORE overwriting config.phoneNumber.
        const channelDoc = await Channel.findOne({ channelId });
        const prevPhoneNumber = (channelDoc?.config as WhatsAppAutomatedConfig)?.phoneNumber;
        const phoneChanged =
          !!prevPhoneNumber && prevPhoneNumber !== connectedPhoneNumber;

        await this.updateChannelConfig(channelId, {
          phoneNumber: connectedPhoneNumber,
          connectedAt: new Date(),
        });
        console.log(
          `📱 Captured connected phone number for ${channelId}: ${connectedPhoneNumber}`,
        );

        if (phoneChanged) {
          console.log(
            `🔄 ${channelId} phone changed: ${prevPhoneNumber} → ${connectedPhoneNumber} (notifying webhooks)`,
          );
          this.sendToWebhooks(channelId, 'channel.credentials_changed', {
            channelId,
            oldPhoneNumber: prevPhoneNumber,
            newPhoneNumber: connectedPhoneNumber,
            name: sock.user.name,
            lid: sock.user.lid,
            changedAt: new Date().toISOString(),
          });
        }
      }

      console.log(
        `📋 Group metadata caching enabled for ${channelId} - will cache on-demand to prevent rate limits (following Baileys best practices)`,
      );
      console.log(
        `ℹ️ Skipping aggressive group preloading to prevent rate-overlimit errors as recommended by Baileys documentation`,
      );
    }

    // Emit connection update event
    this.emit(
      'connection-update',
      channelId,
      connection || 'unknown',
      lastDisconnect,
    );
  }

  /**
   * Resolves LID to actual phone number JID using Baileys 7 LID mapping
   * Baileys 7 LID handling: messages can come from @lid addresses
   * Returns both the resolved JID and whether it was successfully mapped
   */
  private async resolveJidFromMessage(
    channelId: string,
    message: WAMessage,
  ): Promise<{ jid: string; isUnresolvedLid: boolean }> {
    let jid = message.key.remoteJid;
    const originalJid = jid;
    let isUnresolvedLid = false;

    // Check if remoteJid is a LID (@lid)
    if (jid && /@lid/.test(jid)) {
      console.log(`🔍 LID detected in remoteJid: ${jid}`);
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log(
          `📋 Message key details:`,
          JSON.stringify(
            {
              remoteJid: message.key.remoteJid,
              remoteJidAlt: message.key.remoteJidAlt,
              participant: message.key.participant,
              participantAlt: message.key.participantAlt,
              fromMe: message.key.fromMe,
              pushName: message.pushName,
            },
            null,
            2,
          ),
        );
      }

      // For DMs: use senderPn (remoteJidAlt in message key)
      if (message.key.remoteJidAlt) {
        jid = message.key.remoteJidAlt;
        console.log(
          `✅ Resolved LID to actual number using remoteJidAlt: ${originalJid} → ${jid}`,
        );
        console.log(`   Resolution method: remoteJidAlt field`);
      }
      // For Groups: use participantAlt if available
      else if (message.key.participantAlt) {
        jid = message.key.participantAlt;
        console.log(
          `✅ Resolved LID to actual number using participantAlt: ${originalJid} → ${jid}`,
        );
        console.log(`   Resolution method: participantAlt field`);
      }
      // Fallback: check if participant has the actual number
      else if (
        message.key.participant &&
        !/@lid/.test(message.key.participant)
      ) {
        jid = message.key.participant;
        console.log(
          `✅ Using participant as actual number: ${originalJid} → ${jid}`,
        );
        console.log(`   Resolution method: participant field`);
      }
      // Last resort: use Baileys' LID mapping store
      else {
        const sock = this.connections.get(channelId);
        console.log(
          `🔧 Attempting LID mapping store resolution for: ${originalJid}`,
        );
        console.log(`   Socket available: ${!!sock}`);
        console.log(
          `   signalRepository available: ${!!sock?.signalRepository}`,
        );
        console.log(
          `   lidMapping available: ${!!sock?.signalRepository?.lidMapping}`,
        );

        if (sock && sock.signalRepository?.lidMapping) {
          try {
            console.log(
              `🔍 Calling lidMapping.getPNForLID('${originalJid}')...`,
            );
            const pn =
              await sock.signalRepository.lidMapping.getPNForLID(originalJid);
            console.log(
              `   lidMapping.getPNForLID result: ${pn ? pn : 'null'}`,
            );

            if (pn) {
              jid = pn;
              console.log(
                `✅ Resolved LID to PN using lidMapping.getPNForLID: ${originalJid} → ${jid}`,
              );
              console.log(`   Resolution method: Baileys LID mapping store`);
            } else {
              console.warn(`⚠️ LID mapping returned null for: ${originalJid}`);
              console.warn(`   Possible reasons:`);
              console.warn(
                `   - LID mapping not yet synced from WhatsApp server`,
              );
              console.warn(
                `   - User has privacy settings that prevent mapping`,
              );
              console.warn(
                `   - This is a new contact not in the mapping database`,
              );
              isUnresolvedLid = true;
            }
          } catch (error) {
            console.error(
              `❌ Error using lidMapping.getPNForLID for ${originalJid}:`,
            );
            console.error(`   Error details:`, error);
            console.warn(`   Falling back to extracting phone number from LID`);
            isUnresolvedLid = true;
          }
        } else {
          console.warn(
            `⚠️ signalRepository.lidMapping not available for channel ${channelId}`,
          );
          console.warn(
            `   Cannot use Baileys LID mapping - marking as unresolved`,
          );
          isUnresolvedLid = true;
        }
      }

      // Final check: if we still have a LID, mark as unresolved
      if (/@lid/.test(jid)) {
        console.warn(
          `⚠️ LID resolution failed. JID still contains @lid suffix: ${jid}`,
        );
        console.warn(
          `   Will extract phone number: ${jid.replace('@lid', '')}`,
        );
        console.warn(`   Webhook will be marked with isLid: true`);
        isUnresolvedLid = true;
      }
    }

    return { jid: jid || '', isUnresolvedLid };
  }

  /**
   * Handles incoming messages with LID support
   */
  private async handleIncomingMessages(channelId: string, messageUpdate: any) {
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (
      !this.connections.has(channelId) ||
      currentStatus === 'disconnecting' ||
      currentStatus === 'disconnected'
    ) {
      console.log(
        `⚠️ Ignoring incoming message for ${
          currentStatus === 'disconnecting'
            ? 'disconnecting'
            : currentStatus === 'disconnected'
            ? 'disconnected'
            : 'deleted'
        } channel: ${channelId}`,
      );
      return;
    }

    const { messages, type } = messageUpdate;

    if (type !== 'notify') return;

    for (const message of messages) {
      // Resolve LID to actual phone number before processing (Baileys 7 requirement)
      const originalRemoteJid = message.key.remoteJid;
      const resolutionResult = await this.resolveJidFromMessage(
        channelId,
        message,
      );
      const { jid: resolvedJid, isUnresolvedLid } = resolutionResult;

      // Update the remoteJid with the resolved actual phone number
      if (resolvedJid !== originalRemoteJid) {
        console.log(
          `🔄 Replacing LID ${originalRemoteJid} with actual number ${resolvedJid}`,
        );
        message.key.remoteJid = resolvedJid;
      }

      // Store unresolved LID flag in message metadata for webhook formatting
      (message as any)._isUnresolvedLid = isUnresolvedLid;

      // Determine if original message had LID
      const wasLid = /@lid/.test(originalRemoteJid);

      await WhatsAppEvents.create({
        channelId,
        payload: message,
        isLid: wasLid,
        isUnresolvedLid: isUnresolvedLid,
      });

      // Skip if message is from us
      if (message.key.fromMe) continue;

      // Structured one-line log; full payload only when DEBUG_BAILEYS_PAYLOADS=true
      // (default-off avoids the 7.3GB out.log that caused disk pressure).
      const msgIdShort = message.key?.id ?? 'n/a';
      const fromShort = message.key?.remoteJid ?? 'n/a';
      console.log(
        `📨 ${channelId} msg id=${msgIdShort} from=${fromShort} fromMe=${message.key?.fromMe}`,
      );
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log(
          `📨 Incoming message for ${channelId}:`,
          JSON.stringify(message, null, 2),
        );
      }

      // Format message to webhook payload format
      const payload = await this.formatMessageToWebhookPayload(
        channelId,
        message,
      );
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log(JSON.stringify(payload, null, 2));
      }

      // Emit message event with formatted payload
      this.emit('message', channelId, payload);

      // Send to webhooks
      if (payload) {
        this.sendToWebhooks(channelId, 'message.received', payload);
      }

      // TODO: Save to NotificationLogs collection
      // await this.saveIncomingMessage(channelId, message);
    }
  }

  /**
   * Helper function to send webhook with retry logic
   */
  private async sendWebhookWithRetry(
    webhook: any,
    payload: any,
    channelId: string,
    event: string,
  ): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    // Apply optional template + custom headers/method when present on the webhook.
    // Backward compatible: empty fields → legacy JSON-passthrough POST.
    // Auto-localize timestamps: each `xxxAt` ISO string in the payload gets a
    // sibling `xxxAtLocal` formatted in webhook.timezone (default UTC).
    const localizedPayload = withLocalTimestamps(payload, webhook.timezone || 'UTC');
    const { body, contentType } = renderWebhookBody(webhook, localizedPayload, channelId, event);
    const method = (webhook.method || 'POST').toUpperCase();
    const customHeaders = mapToObject(webhook.headers);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const outboundSecret = process.env.LEGIMUS_WEBHOOK_SECRET;
        await axios.request({
          method,
          url: webhook.url,
          data: body,
          headers: {
            'Content-Type': contentType,
            'X-Channel-Id': channelId,
            'X-Event': event,
            ...(outboundSecret ? { 'X-Legimus-Secret': outboundSecret } : {}),
            ...customHeaders, // user-defined headers win (allows overriding auth, content-type, etc.)
          },
          timeout: 30000, // 30 second timeout
        });

        if (attempt > 0) {
          console.log(`  ✅ Successfully sent to ${webhook.url} on attempt ${attempt + 1}`);
        }
        return; // Success, exit retry loop

      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt) {
          console.error(
            `❌ Final attempt failed for webhook ${webhook.url} after ${maxRetries + 1} attempts:`,
            error.message,
          );
          return; // Don't rethrow, just log the final failure
        }

        // Calculate exponential backoff delay: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(
          `  ⚠️  Attempt ${attempt + 1} failed for ${webhook.url}, retrying in ${delay / 1000}s...`,
          error.message
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Sends payload to configured webhooks for a given event.
   */
  private async sendToWebhooks(channelId: string, event: string, payload: any) {
    try {
      const channel = await Channel.findOne({ channelId });
      if (!channel || !channel.webhooks || channel.webhooks.length === 0) {
        return;
      }

      const webhooksToTrigger = channel.webhooks.filter(
        (webhook) => webhook.isActive && webhook.events.includes(event),
      );

      if (webhooksToTrigger.length === 0) {
        return;
      }

      console.log(
        `🚀 Triggering ${webhooksToTrigger.length} webhooks for event '${event}' on channel ${channelId}`,
      );

      const webhookPromises = webhooksToTrigger.map((webhook) => {
        console.log(`  -> Sending to ${webhook.url}`);
        return this.sendWebhookWithRetry(webhook, payload, channelId, event);
      });

      await Promise.all(webhookPromises);
    } catch (error) {
      console.error(
        `❌ Error processing webhooks for channel ${channelId}:`,
        error,
      );
    }
  }

  /**
   * Formats a Baileys message into a WhatsApp Cloud API-like webhook payload.
   */
  private async formatMessageToWebhookPayload(
    channelId: string,
    message: WAMessage,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      return null;
    }

    const from = message.key.remoteJid;
    const messageId = message.key.id;
    const timestamp = message.messageTimestamp;
    const contactName = message.pushName || from;
    const isUnresolvedLid = (message as any)._isUnresolvedLid;

    // If it's an unresolved LID, keep the @lid suffix, otherwise remove all suffixes
    const formattedFrom = isUnresolvedLid ? from : removeSuffixFromJid(from);

    const payload: any = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: channelId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: sock.user?.id.split(':')[0],
                  phone_number_id: sock.user?.id,
                },
                contacts: [
                  {
                    profile: {
                      name: contactName,
                    },
                    wa_id: formattedFrom,
                  },
                ],
                messages: [
                  {
                    from: formattedFrom,
                    id: messageId,
                    timestamp,
                    ...(isUnresolvedLid ? { isLid: true } : {}),
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const messageContent = message.message;
    const messageContainer = payload.entry[0].changes[0].value.messages[0];
    let contextInfo: proto.IContextInfo | null | undefined;

    if (messageContent?.conversation) {
      messageContainer.type = 'text';
      messageContainer.text = { body: messageContent.conversation };
    } else if (messageContent?.extendedTextMessage) {
      messageContainer.type = 'text';
      messageContainer.text = { body: messageContent.extendedTextMessage.text };
      contextInfo = messageContent.extendedTextMessage.contextInfo;
    } else if (messageContent?.imageMessage) {
      messageContainer.type = 'image';
      messageContainer.image = await this.extractMediaPayload(
        channelId,
        message,
        'image',
        messageContent.imageMessage,
      );
      contextInfo = messageContent.imageMessage.contextInfo;
    } else if (messageContent?.videoMessage) {
      messageContainer.type = 'video';
      messageContainer.video = await this.extractMediaPayload(
        channelId,
        message,
        'video',
        messageContent.videoMessage,
      );
      contextInfo = messageContent.videoMessage.contextInfo;
    } else if (messageContent?.audioMessage) {
      messageContainer.type = 'audio';
      messageContainer.audio = await this.extractMediaPayload(
        channelId,
        message,
        'audio',
        messageContent.audioMessage,
      );
      contextInfo = messageContent.audioMessage.contextInfo;
    } else if (messageContent?.documentMessage) {
      messageContainer.type = 'document';
      messageContainer.document = await this.extractMediaPayload(
        channelId,
        message,
        'document',
        messageContent.documentMessage,
      );
      contextInfo = messageContent.documentMessage.contextInfo;
    } else if (messageContent?.stickerMessage) {
      messageContainer.type = 'sticker';
      messageContainer.sticker = await this.extractMediaPayload(
        channelId,
        message,
        'sticker',
        messageContent.stickerMessage,
      );
      contextInfo = messageContent.stickerMessage.contextInfo;
    } else if (messageContent?.reactionMessage) {
      messageContainer.type = 'reaction';
      messageContainer.reaction = {
        message_id: messageContent.reactionMessage.key.id,
        emoji: messageContent.reactionMessage.text,
      };
      console.log(
        `👍 Reaction message detected: ${messageContent.reactionMessage.text} on message ${messageContent.reactionMessage.key.id}`,
      );
    } else {
      messageContainer.type = 'unsupported';
      messageContainer.errors = [
        {
          code: 501,
          title: 'Unsupported message type',
        },
      ];
    }

    // Handle context for replies
    if (contextInfo && contextInfo.stanzaId) {
      messageContainer.context = {
        from: removeSuffixFromJid(contextInfo.participant),
        id: contextInfo.stanzaId,
        quotedMessage: contextInfo.quotedMessage,
      };
    }

    return payload;
  }

  /**
   * Extracts media from a message, saves it, and returns the media payload.
   */
  private async extractMediaPayload(
    channelId: string,
    message: WAMessage,
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
    mediaMessage: any,
  ): Promise<any> {
    try {
      const buffer = await downloadMediaMessage(message, 'buffer', {});
      const fileExtension = mediaMessage.mimetype.split('/')[1].split(';')[0];
      const fileName = `${uuidv4()}.${fileExtension}`;

      const storagePath = path.join(__dirname, `../../storage/${channelId}`);
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      const filePath = path.join(storagePath, fileName);
      await fs.promises.writeFile(filePath, buffer);

      const url = `${process.env.BACKEND_DOMAIN}/storage/${channelId}/${fileName}`;

      const payload: any = {
        mime_type: mediaMessage.mimetype,
        url: url,
        // sha256: mediaMessage.fileSha256.toString('base64'),
        // file_length: mediaMessage.fileLength,
      };

      if ('caption' in mediaMessage) {
        payload.caption = mediaMessage.caption;
      }

      if ('fileName' in mediaMessage) {
        payload.filename = mediaMessage.fileName;
      }

      return payload;
    } catch (error) {
      console.error(
        `❌ Error downloading media for message ${message.key.id}:`,
        error,
      );
      return {
        error: 'Failed to download media',
      };
    }
  }

  /**
   * Formats a Baileys call event into a WhatsApp Cloud API-like webhook payload.
   */
  private async formatCallToWebhookPayload(
    channelId: string,
    callEvent: any,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      return null;
    }

    const from = callEvent.from;
    const callId = callEvent.id;
    const timestamp = callEvent.date || Math.floor(Date.now() / 1000);
    const status = callEvent.status; // 'offer', 'accept', 'reject', 'timeout'
    const isVideo = callEvent.isVideo || false;
    const isGroup = callEvent.isGroup || false;

    const payload: any = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: channelId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: sock.user?.id.split(':')[0],
                  phone_number_id: sock.user?.id,
                },
                statuses: [
                  {
                    id: callId,
                    status: 'call_received',
                    timestamp: timestamp,
                    recipient_id: sock.user?.id.split(':')[0],
                    call: {
                      from: removeSuffixFromJid(from),
                      status: status,
                      type: isVideo ? 'video' : 'voice',
                      is_group: isGroup,
                      call_id: callId,
                    },
                  },
                ],
              },
              field: 'call_status',
            },
          ],
        },
      ],
    };

    console.log(
      `📞 Formatted call event for ${channelId}: ${status} ${
        isVideo ? 'video' : 'voice'
      } call from ${from}`,
    );

    return payload;
  }

  /**
   * Formats a Baileys message status update into a WhatsApp Cloud API-like webhook payload.
   */
  private async formatStatusToWebhookPayload(
    channelId: string,
    statusUpdate: any,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      return null;
    }

    const messageId = statusUpdate.key.id;
    const to = statusUpdate.key.remoteJid;
    const numericStatus = statusUpdate.update?.status; // Baileys sends numeric status codes
    const timestamp = statusUpdate.timestamp || Math.floor(Date.now() / 1000);

    // Map Baileys numeric status codes (from WAProto.proto WebMessageInfo.Status enum)
    // to WhatsApp Cloud API webhook status strings.
    //   0=ERROR, 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
    // See https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc13/WAProto/WAProto.proto
    let webhookStatus: string;
    switch (numericStatus) {
      case 0:
        webhookStatus = 'failed'; // ERROR — message rejected by WhatsApp
        break;
      case 1:
        webhookStatus = 'pending'; // PENDING — queued, not yet acked by server
        break;
      case 2:
        webhookStatus = 'sent'; // SERVER_ACK — server received (single ✓)
        break;
      case 3:
        webhookStatus = 'delivered'; // DELIVERY_ACK — on recipient device (double ✓)
        break;
      case 4:
        webhookStatus = 'read'; // READ — recipient opened the chat (blue ✓✓)
        break;
      case 5:
        webhookStatus = 'played'; // PLAYED — voice/video note reproduced
        break;
      default:
        console.warn(
          `⚠️ Unknown status code ${numericStatus} for message ${messageId}`,
        );
        webhookStatus = 'unknown';
        break;
    }

    const payload: any = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: channelId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: sock.user?.id.split(':')[0],
                  phone_number_id: sock.user?.id,
                },
                statuses: [
                  {
                    id: messageId,
                    status: webhookStatus,
                    timestamp: timestamp,
                    recipient_id: removeSuffixFromJid(to),
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    // Add additional fields for read status
    if (webhookStatus === 'read') {
      payload.entry[0].changes[0].value.statuses[0].conversation = {
        id: removeSuffixFromJid(to),
        origin: {
          type: 'user_initiated',
        },
      };
    }

    console.log(
      `📊 Formatted status update for ${channelId}: ${webhookStatus} (code: ${numericStatus}) for message ${messageId}`,
    );

    return payload;
  }

  /**
   * Resolves a JID (can be LID or PN) to a phone number JID
   */
  private async resolveJid(channelId: string, jid: string): Promise<string> {
    if (!jid) return jid;

    // Check if JID is a LID (@lid)
    if (/@lid/.test(jid)) {
      console.log(`🔍 LID detected in JID: ${jid}`);

      const sock = this.connections.get(channelId);
      if (sock && sock.signalRepository?.lidMapping) {
        try {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
          if (pn) {
            console.log(
              `✅ Resolved LID to PN using lidMapping: ${jid} → ${pn}`,
            );
            return pn;
          } else {
            console.warn(`⚠️ Could not resolve LID using lidMapping: ${jid}`);
          }
        } catch (error) {
          console.error(
            `❌ Error using lidMapping.getPNForLID for ${jid}:`,
            error,
          );
        }
      }
    }

    return jid;
  }

  /**
   * Handles message status updates (sent, delivered, read) with LID resolution
   */
  private async handleMessageStatusUpdates(channelId: string, updates: any[]) {
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (
      !this.connections.has(channelId) ||
      currentStatus === 'disconnecting' ||
      currentStatus === 'disconnected'
    ) {
      console.log(
        `⚠️ Ignoring message status update for ${
          currentStatus === 'disconnecting'
            ? 'disconnecting'
            : currentStatus === 'disconnected'
            ? 'disconnected'
            : 'deleted'
        } channel: ${channelId}`,
      );
      return;
    }

    for (const update of updates) {
      const updIdShort = update.key?.id ?? 'n/a';
      const updRemoteShort = update.key?.remoteJid ?? 'n/a';
      const updStatusShort = (update as { update?: { status?: unknown } })?.update?.status ?? 'n/a';
      console.log(
        `📊 ${channelId} status id=${updIdShort} to=${updRemoteShort} status=${String(updStatusShort)}`,
      );
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log(
          `📊 Message status update for ${channelId}:`,
          JSON.stringify(update, null, 2),
        );
      }

      // Resolve LID to PN if present in remoteJid
      if (update.key?.remoteJid) {
        const originalJid = update.key.remoteJid;
        const resolvedJid = await this.resolveJid(channelId, originalJid);
        if (resolvedJid !== originalJid) {
          console.log(
            `🔄 Status update - Resolved JID: ${originalJid} → ${resolvedJid}`,
          );
          update.key.remoteJid = resolvedJid;
        }
      }

      // Format status update to webhook payload format
      const payload = await this.formatStatusToWebhookPayload(
        channelId,
        update,
      );
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log('📊 Formatted status', JSON.stringify(payload, null, 2));
      }

      if (payload) {
        // Emit status update event
        this.emit('message-status', channelId, payload);

        // Derive a specific webhook event name per status so downstream
        // consumers can subscribe to the exact lifecycle moment they care
        // about (e.g. `message.failed` for retry pipelines, `message.played`
        // for voice-note analytics). Unknown statuses fall back to the
        // generic `message.status` event to preserve forward compatibility.
        const webhookStatus =
          payload.entry[0]?.changes[0]?.value?.statuses[0]?.status;
        const webhookEventByStatus: Record<string, string> = {
          failed: 'message.failed',
          pending: 'message.pending',
          sent: 'message.sent',
          delivered: 'message.delivered',
          read: 'message.read',
          played: 'message.played',
        };
        const webhookEventType =
          webhookEventByStatus[webhookStatus] ?? 'message.status';

        // Send to webhooks
        this.sendToWebhooks(channelId, webhookEventType, payload);
      }

      // TODO: Update NotificationLogs collection
      // await this.updateMessageStatus(channelId, update);
    }
  }

  /**
   * Handles incoming calls
   */
  private async handleIncomingCalls(channelId: string, callEvents: any[]) {
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (
      !this.connections.has(channelId) ||
      currentStatus === 'disconnecting' ||
      currentStatus === 'disconnected'
    ) {
      console.log(
        `⚠️ Ignoring incoming call for ${
          currentStatus === 'disconnecting'
            ? 'disconnecting'
            : currentStatus === 'disconnected'
            ? 'disconnected'
            : 'deleted'
        } channel: ${channelId}`,
      );
      return;
    }

    for (const callEvent of callEvents) {
      const callIdShort = (callEvent as { id?: string })?.id ?? 'n/a';
      const callFromShort = (callEvent as { from?: string })?.from ?? 'n/a';
      const callStatusShort = (callEvent as { status?: string })?.status ?? 'n/a';
      console.log(
        `📞 ${channelId} call id=${callIdShort} from=${callFromShort} status=${callStatusShort}`,
      );
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log(
          `📞 Incoming call for ${channelId}:`,
          JSON.stringify(callEvent, null, 2),
        );
      }

      // Save call event to database
      await WhatsAppEvents.create({ channelId, payload: callEvent });

      // Format call event to webhook payload format
      const payload = await this.formatCallToWebhookPayload(
        channelId,
        callEvent,
      );
      if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
        console.log('Call payload formatted:', JSON.stringify(payload, null, 2));
      }
      if (payload) {
        // Emit call event
        this.emit('call', channelId, payload);

        // Send to webhooks
        this.sendToWebhooks(channelId, 'call.received', payload);
      }
    }
  }

  /**
   * Extracts URL from text message
   */
  private extractUrlFromText(text: string): string | null {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
  }

  /**
   * Checks if URL is from Instagram
   */
  private isInstagramUrl(url: string): boolean {
    return url.includes('instagram.com') || url.includes('instagr.am');
  }

  /**
   * Fetches Instagram link preview using oEmbed API
   */
  private async getInstagramLinkPreview(
    url: string,
  ): Promise<any | null> {
    try {
      console.log(`📸 Fetching Instagram link preview for: ${url}`);

      // Use Instagram's oEmbed API
      const oEmbedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;
      const response = await axios.get(oEmbedUrl, {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const data = response.data;
      console.log(`✅ Instagram oEmbed response:`, JSON.stringify(data, null, 2));

      if (!data.title && !data.author_name) {
        console.log('⚠️ Instagram oEmbed returned no useful data');
        return null;
      }

      // Build link preview object for Baileys
      const linkPreview: any = {
        'canonical-url': url,
        'matched-text': url,
        title: data.title || `${data.author_name} on Instagram`,
        description:
          data.title ||
          `Post by ${data.author_name}` ||
          'Instagram post',
      };

      // Try to get thumbnail from oEmbed
      if (data.thumbnail_url) {
        try {
          console.log(`🖼️ Fetching Instagram thumbnail: ${data.thumbnail_url}`);

          // Download and upload the thumbnail for high quality preview
          const imageResponse = await axios.get(data.thumbnail_url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });

          const imageBuffer = Buffer.from(imageResponse.data);
          linkPreview.jpegThumbnail = imageBuffer;
          linkPreview.originalThumbnailUrl = data.thumbnail_url;

          console.log(
            `✅ Instagram thumbnail fetched: ${imageBuffer.length} bytes`,
          );
        } catch (thumbError) {
          console.error(
            `⚠️ Failed to fetch Instagram thumbnail:`,
            thumbError.message,
          );
        }
      }

      return linkPreview;
    } catch (error) {
      console.error(`❌ Error fetching Instagram link preview:`, error.message);
      return null;
    }
  }

  /**
   * Marks messages as read (sends "seen" status)
   * Call this before responding to simulate human-like behavior
   */
  async markAsRead(
    channelId: string,
    messageKeys: { remoteJid: string; id: string; fromMe?: boolean; participant?: string }[],
  ): Promise<void> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      console.warn(`⚠️ Cannot mark as read: Channel ${channelId} not connected`);
      return;
    }

    try {
      await sock.readMessages(messageKeys);
      console.log(`👁️ Marked ${messageKeys.length} message(s) as read`);
    } catch (error) {
      console.error(`❌ Error marking messages as read:`, error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Sends "composing" presence to show typing indicator
   * Call this when agent starts processing a response
   */
  async startTyping(channelId: string, jid: string): Promise<void> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      console.warn(`⚠️ Cannot start typing: Channel ${channelId} not connected`);
      return;
    }

    try {
      await sock.sendPresenceUpdate('composing', jid);
      console.log(`⌨️ Started typing indicator for ${jid}`);
    } catch (error) {
      console.error(`❌ Error starting typing indicator:`, error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Sends "paused" presence to hide typing indicator
   * Call this right before sending the message
   */
  async stopTyping(channelId: string, jid: string): Promise<void> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      console.warn(`⚠️ Cannot stop typing: Channel ${channelId} not connected`);
      return;
    }

    try {
      await sock.sendPresenceUpdate('paused', jid);
      console.log(`⏸️ Stopped typing indicator for ${jid}`);
    } catch (error) {
      console.error(`❌ Error stopping typing indicator:`, error);
      // Don't throw - this is a non-critical operation
    }
  }
  /**
   * Calculates typing delay based on text length to simulate human typing
   * Minimum 200ms, scales with text length, max 800ms
   */
  private calculateTypingDelay(text: string): number {
    const minDelay = 200;
    const maxDelay = 800;
    // Roughly 25ms per character, simulating ~40 chars/second typing speed
    const calculatedDelay = Math.min(text.length * 25, maxDelay);
    return Math.max(calculatedDelay, minDelay);
  }

  /**
   * Sends a text message with automatic anti-ban measures
   * Flow: markAsRead → startTyping → delay based on text length → stopTyping → send
   */
  async sendTextMessage(
    channelId: string,
    to: string,
    text: string,
    replyToMessage?: { remoteJid: string; id: string; fromMe?: boolean; participant?: string },
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    try {
      // Anti-ban: Mark the original message as read first (send "seen")
      if (replyToMessage) {
        await this.markAsRead(channelId, [replyToMessage]);
      }

      // Anti-ban: Start typing indicator
      await this.startTyping(channelId, to);

      // Anti-ban: Simulate typing delay based on text length
      const typingDelay = this.calculateTypingDelay(text);
      console.log(`⏱️ Simulating typing for ${typingDelay}ms (text length: ${text.length})`);
      await new Promise(resolve => setTimeout(resolve, typingDelay));

      // Anti-ban: Stop typing indicator before sending
      await this.stopTyping(channelId, to);

      // Check if message contains an Instagram URL
      const url = this.extractUrlFromText(text);
      const messageContent: any = { text };

      if (url && this.isInstagramUrl(url)) {
        const linkPreview = await this.getInstagramLinkPreview(url);
        if (linkPreview) {
          messageContent.linkPreview = linkPreview;
          console.log(`📎 Using custom Instagram link preview`);
        }
      }

      const message = await sock.sendMessage(to, messageContent);
      console.log(`📤 Message sent from ${channelId} to ${to}`);
      return message;
    } catch (error) {
      console.error(`❌ Error sending message from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Sends a media message with automatic anti-ban measures
   * Flow for media with caption: markAsRead → startTyping → delay based on caption length → stopTyping → send
   * Flow for media without caption: markAsRead → send
   */
  async sendMediaMessage(
    channelId: string,
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    media: Buffer | string,
    caption?: string,
    replyToMessage?: { remoteJid: string; id: string; fromMe?: boolean; participant?: string },
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    try {
      // Anti-ban: Mark the original message as read first (send "seen")
      if (replyToMessage) {
        await this.markAsRead(channelId, [replyToMessage]);
      }

      // Anti-ban: Only show typing if there's a caption
      if (caption) {
        await this.startTyping(channelId, to);

        // Simulate typing delay based on caption length
        const typingDelay = this.calculateTypingDelay(caption);
        console.log(`⏱️ Simulating typing for ${typingDelay}ms (caption length: ${caption.length})`);
        await new Promise(resolve => setTimeout(resolve, typingDelay));

        await this.stopTyping(channelId, to);
      }

      const messageContent: any = {};
      messageContent[mediaType] = media;
      if (caption) messageContent.caption = caption;

      const message = await sock.sendMessage(to, messageContent);
      console.log(`📤 Media message sent from ${channelId} to ${to}`);
      return message;
    } catch (error) {
      console.error(`❌ Error sending media message from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Tear down a socket COMPLETELY so V8 can GC it. Just calling sock.end()
   * leaves the event listeners (which capture `this`, the auth.creds Signal-key
   * Map, and the socket itself) reachable. Across 1000s of reconnect cycles in
   * production this leaks ~6GB of heap → FATAL "Reached heap limit" → no-graceful
   * restart → device-slot stays alive in WhatsApp → 401 <conflict replaced/>
   * cascade → channel marked logged_out. Always go through this helper when
   * discarding a socket.
   *
   * Also clears any pending reconnect timer for the channel so concurrent
   * reconnects don't pile up two sockets at once (another conflict cause).
   */
  private teardownSocket(channelId: string, sock?: WASocket): void {
    const target = sock ?? this.connections.get(channelId);
    this.connections.delete(channelId);

    const timer = this.reconnectTimers.get(channelId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(channelId);
    }
    const stable = this.stableTimers.get(channelId);
    if (stable) {
      clearTimeout(stable);
      this.stableTimers.delete(channelId);
    }
    this.conflictAlerted.delete(channelId);

    if (!target) return;
    this.unregisterSocket(channelId, target);
    this.destroySocketResources(target);
  }

  private registerSocket(channelId: string, sock: WASocket): void {
    const channelSockets =
      this.liveSockets.get(channelId) ?? new Set<WASocket>();
    channelSockets.add(sock);
    this.liveSockets.set(channelId, channelSockets);
  }

  private unregisterSocket(channelId: string, sock: WASocket): void {
    const channelSockets = this.liveSockets.get(channelId);
    if (!channelSockets) return;
    channelSockets.delete(sock);
    if (channelSockets.size === 0) this.liveSockets.delete(channelId);
  }

  /**
   * Full-stop for a channel: teardownSocket (map entry + timers + mapped
   * socket) PLUS every registry orphan that lost the map slot. WHY: the only
   * way to guarantee the WhatsApp device slot is actually free (terminal
   * parking, manual disconnect, QR refresh, ghost recovery).
   */
  private destroyAllSocketsForChannel(channelId: string): void {
    this.teardownSocket(channelId);
    const orphanSockets = this.liveSockets.get(channelId);
    if (orphanSockets && orphanSockets.size > 0) {
      console.warn(
        `👻 ${channelId} destroying ${orphanSockets.size} orphan socket(s) outside the map`,
      );
      for (const orphanSock of orphanSockets) {
        this.destroySocketResources(orphanSock);
      }
    }
    this.liveSockets.delete(channelId);
  }

  /**
   * Kill a socket that emitted an event without owning the map slot — a live
   * duplicate that would otherwise hold the WhatsApp device slot and
   * 401-conflict every reconnect.
   */
  private destroyOrphanSocket(
    channelId: string,
    sock: WASocket,
    context: string,
  ): void {
    console.warn(`👻 ${channelId} destroying orphan socket (${context})`);
    this.unregisterSocket(channelId, sock);
    this.destroySocketResources(sock);
  }

  /**
   * True (after destroying the socket) when an event came from a socket that
   * is not the channel's mapped one. Gate for per-socket event handlers.
   */
  private dropIfOrphan(
    channelId: string,
    sock: WASocket,
    context: string,
  ): boolean {
    if (this.connections.get(channelId) === sock) return false;
    this.destroyOrphanSocket(channelId, sock, context);
    return true;
  }

  /**
   * Drop a socket's listeners + close its transport, WITHOUT touching the
   * channel→socket map or reconnect timers. Used both by teardownSocket and by
   * the stale-close identity guard (where the live socket must NOT be disturbed).
   */
  private destroySocketResources(sock: WASocket): void {
    // CRITICAL: breaks the closures that retain `this`, `auth.creds` and the
    // socket itself across the EventEmitter — without this V8 can't GC them.
    // BaileysEventEmitter is strictly typed: removeAllListeners requires the
    // event name. Iterate the 7 events we register in connectChannel.
    const ourEvents = [
      'connection.update',
      'creds.update',
      'messages.upsert',
      'messages.update',
      'groups.update',
      'call',
      'lid-mapping.update',
    ] as const;
    for (const ev of ourEvents) {
      try {
        sock.ev.removeAllListeners(ev);
      } catch (_e) {
        /* noop: emitter may already be torn down */
      }
    }
    try {
      sock.ws?.close();
    } catch (_e) {
      /* noop: ws may already be closed */
    }
    try {
      sock.end(undefined);
    } catch (_e) {
      /* noop: end() throws if already ended */
    }
  }

  /**
   * Resets socket connection without clearing auth state (no QR needed on reconnect)
   */
  async resetSocketConnection(channelId: string): Promise<void> {
    try {
      console.log(
        `🔄 Resetting socket connection for channel: ${channelId} (preserving auth state)`,
      );

      // Orphan-only states (registry socket without a map entry, e.g. a
      // survivor of terminal parking) must be swept too — that stray socket
      // holds the device slot and would 401-conflict the fresh connect.
      const hasAnySocket =
        this.connections.has(channelId) || this.liveSockets.has(channelId);
      if (hasAnySocket) {
        // Update memory status to indicate reset BEFORE teardown so any
        // in-flight callback observing this state takes the resetting branch.
        this.connectionStatus.set(channelId, 'resetting');

        // T8: removes listeners + closes ws + ends sockets + cancels pending
        // reconnect timers — INCLUDING registry orphans (a reset that leaves a
        // duplicate alive re-creates the 401-conflict loop it tries to cure).
        this.destroyAllSocketsForChannel(channelId);
        console.log(`🔌 Socket fully torn down for channel: ${channelId}`);

        // Update database status
        await this.updateChannelStatus(channelId, 'reset');

        console.log(
          `✅ Channel ${channelId} socket reset successfully (auth state preserved)`,
        );
      } else {
        console.log(`⚠️ No active socket found for channel ${channelId}`);
      }
    } catch (error) {
      console.error(
        `❌ Error resetting socket for channel ${channelId}:`,
        error,
      );
      // Ensure cleanup even on error
      this.connections.delete(channelId);
      this.connectionStatus.set(channelId, 'error');
      throw error;
    }
  }

  /**
   * True while the engine is already handling a reconnect for this channel
   * (pending retry timer or connect in flight). The auto-heal cron checks this
   * so it never races the engine's own reconnect — that exact collision bred
   * the 2026-07-07 double-socket ghost.
   */
  isReconnectPending(channelId: string): boolean {
    return (
      this.reconnectTimers.has(channelId) || this.connectInFlight.has(channelId)
    );
  }

  /**
   * Disconnects a channel
   */
  async disconnectChannel(channelId: string): Promise<void> {
    try {
      console.log(`🔌 Disconnecting WhatsApp channel: ${channelId}`);

      const sock = this.connections.get(channelId);
      if (sock) {
        // Update memory status to prevent event processing
        this.connectionStatus.set(channelId, 'disconnecting');

        try {
          // Gracefully logout from WhatsApp (releases device slot)
          await sock.logout();
          console.log(
            `📱 Successfully logged out from WhatsApp for channel: ${channelId}`,
          );
        } catch (logoutError) {
          console.warn(
            `⚠️ Error during logout for channel ${channelId}:`,
            logoutError,
          );
          // Continue with cleanup even if logout fails
        }

        // T8: even after logout(), the socket's listeners still hold `this` +
        // auth.creds. Tear everything down (orphans included) so V8 can
        // reclaim the memory and the device slot is truly free.
        this.destroyAllSocketsForChannel(channelId);
        this.reconnectAttempts.delete(channelId);

        // Clean up memory status
        this.connectionStatus.delete(channelId);

        // Update database status
        await this.updateChannelStatus(channelId, 'disconnected');

        console.log(`✅ Channel ${channelId} disconnected successfully`);
      } else {
        console.log(`⚠️ Channel ${channelId} was not connected`);
        // Kill any orphan socket still holding the device slot (a socket can
        // survive terminal parking outside the map) so a follow-up /connect
        // gets a free slot instead of a 401 conflict.
        this.destroyAllSocketsForChannel(channelId);
        // Still update status in case it was marked as active in DB
        await this.updateChannelStatus(channelId, 'disconnected');
      }
    } catch (error) {
      console.error(`❌ Error disconnecting channel ${channelId}:`, error);
      // Ensure cleanup even on error
      this.connections.delete(channelId);
      this.connectionStatus.delete(channelId);
      await this.updateChannelStatus(channelId, 'error');
      throw error;
    }
  }

  /**
   * Gets connection status for a channel
   */
  /**
   * True only if a live socket exists for this channel. Same source of truth the
   * send path uses (connections.get) — survives a socket dying without a 'close'.
   */
  isChannelConnected(channelId: string): boolean {
    return !!this.connections.get(channelId);
  }

  getChannelStatus(channelId: string): string {
    // First check in-memory status
    const memoryStatus = this.connectionStatus.get(channelId);

    // WHY: connections is the source of truth for a LIVE socket (deleted on 'close').
    // The cache can still go stale at 'active'/'open' if a socket dies via
    // device_removed/conflict without a clean reset. If the cache claims connected
    // but no live socket exists, report 'logged_out' so the UI never shows
    // "Connected" for a dead channel.
    if (
      (memoryStatus === 'active' || memoryStatus === 'open') &&
      !this.connections.has(channelId)
    ) {
      return 'logged_out';
    }

    if (memoryStatus) {
      return memoryStatus;
    }

    // If not in memory, return 'inactive' (will be restored if it was actually active)
    return 'inactive';
  }

  /**
   * Gets connection status for a channel from database
   */
  async getChannelStatusFromDB(channelId: string): Promise<string> {
    try {
      const channel = await Channel.findOne({ channelId });
      return channel?.status || 'inactive';
    } catch (error) {
      console.error(
        `❌ Error getting channel status from DB for ${channelId}:`,
        error,
      );
      return 'inactive';
    }
  }

  /**
   * Syncs memory status with database status (useful after server restart)
   */
  async syncChannelStatus(channelId: string): Promise<string> {
    try {
      const dbStatus = await this.getChannelStatusFromDB(channelId);

      // If database shows active status but memory shows inactive, update memory
      if (
        dbStatus !== 'inactive' &&
        this.connectionStatus.get(channelId) === undefined
      ) {
        console.log(`🔄 Syncing status for channel ${channelId}: ${dbStatus}`);
        this.connectionStatus.set(channelId, dbStatus);
      }

      return dbStatus;
    } catch (error) {
      console.error(`❌ Error syncing channel status for ${channelId}:`, error);
      return 'inactive';
    }
  }

  /**
   * Completely removes a channel from memory and prevents future events
   */
  async removeChannel(channelId: string): Promise<void> {
    try {
      console.log(`🗑️ Removing channel ${channelId} from WhatsApp service...`);

      // Close and remove the socket connection if it exists
      const socket = this.connections.get(channelId);
      if (socket) {
        console.log(`🔌 Closing socket connection for channel ${channelId}`);
        try {
          // Gracefully close the Baileys connection
          await socket.logout();
        } catch (error) {
          console.warn(`⚠️ Error closing socket for ${channelId}:`, error);
        }
      }
      // Destroy every socket (orphans included) — logout() alone leaves the
      // listeners (and their `this`/creds closures) retained → heap leak.
      this.destroyAllSocketsForChannel(channelId);

      // Remove from all memory maps
      this.connectionStatus.delete(channelId);
      this.preloadAttempts.delete(channelId);
      this.lastPreloadAttempt.delete(channelId);
      this.ghostRecoveryAttempts.delete(channelId);

      // Clear auth state if it exists
      await this.clearAuthState(channelId);

      // Clear phone validation cache for this channel
      this.clearPhoneValidationCache(channelId);

      console.log(
        `✅ Channel ${channelId} removed from WhatsApp service memory`,
      );
    } catch (error) {
      console.error(`❌ Error removing channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Gets all active connections
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Updates channel status in database
   */
  private async updateChannelStatus(
    channelId: string,
    status: string,
  ): Promise<void> {
    // WHY: connectionStatus is the in-memory cache read by getChannelStatus(). It
    // MUST move in lockstep with the persisted status — otherwise a socket that dies
    // keeps reporting its last 'active' value (the cache was only ever set on connect,
    // never on disconnect). This is the root of the channel status desync.
    this.connectionStatus.set(channelId, status);
    try {
      const update: Record<string, unknown> = {
        status,
        lastStatusUpdate: new Date(),
      };
      // "Con problemas desde": seal it once when the channel leaves 'active',
      // clear it when it recovers. Read current config so the retry loop never
      // overwrites the original problem timestamp.
      if (status === 'active') {
        update['config.disconnectedSince'] = null;
      } else {
        const doc = await Channel.findOne({ channelId }, { config: 1 });
        const cfg = doc?.config as WhatsAppAutomatedConfig | undefined;
        if (!cfg?.disconnectedSince) {
          update['config.disconnectedSince'] = new Date();
        }
      }
      await Channel.findOneAndUpdate({ channelId }, update);
    } catch (error) {
      console.error(
        `❌ Error updating channel status for ${channelId}:`,
        error,
      );
    }
  }

  /**
   * Updates channel config fields atomically via dot-path $set.
   */
  private async updateChannelConfig(
    channelId: string,
    configUpdate: Partial<any>,
  ): Promise<void> {
    try {
      // WHY dot-path $set: the previous findOne → spread-merge →
      // findOneAndUpdate replaced the WHOLE config, so two concurrent calls
      // lost one write (the streak clear on 'open' was clobbered by the
      // {phoneNumber, connectedAt} write → stale terminalNotifiedAt disabled
      // terminal escalation forever). Field-level $set makes concurrent
      // writers touch disjoint paths and never overwrite each other.
      const setFields: Record<string, unknown> = {
        lastStatusUpdate: new Date(),
      };
      for (const [key, value] of Object.entries(configUpdate)) {
        setFields[`config.${key}`] = value;
      }
      await Channel.findOneAndUpdate({ channelId }, { $set: setFields });

      console.log(
        `📝 Updated config for channel ${channelId}:`,
        configUpdate,
      );
    } catch (error) {
      console.error(
        `❌ Error updating channel config for ${channelId}:`,
        error,
      );
    }
  }

  /**
   * Refreshes QR code for an existing channel by clearing auth state and reconnecting
   */
  async refreshQRCode(channelId: string): Promise<void> {
    try {
      console.log(`🔄 Refreshing QR code for channel: ${channelId}`);

      // Step 1: Disconnect current connection if exists
      const currentConnection = this.connections.get(channelId);
      if (currentConnection) {
        console.log(`🔌 Disconnecting current connection for ${channelId}`);
        try {
          await currentConnection.logout();
        } catch (error) {
          console.warn(`⚠️ Error during logout for ${channelId}:`, error);
        }
      }
      // Full teardown, UNCONDITIONAL (not gated on the map entry): an orphan
      // socket outside the map still holds the device slot — exactly what
      // would conflict the fresh QR pairing.
      this.destroyAllSocketsForChannel(channelId);

      // Step 2: Clear auth state to force fresh QR generation
      console.log(
        `🧹 Clearing auth state for ${channelId} to generate fresh QR`,
      );
      await this.clearAuthState(channelId);

      // Step 3: Update channel status
      await this.updateChannelStatus(channelId, 'generating_qr');
      this.connectionStatus.set(channelId, 'generating_qr');

      // Step 4: Clear any cached config QR code
      await this.updateChannelConfig(channelId, { qrCode: null });

      // Step 5: Reconnect to generate new QR code (human-initiated pairing flow)
      console.log(`🔄 Starting fresh connection for ${channelId}`);
      await this.connectChannel(channelId, undefined, { allowPairing: true });

      console.log(`✅ QR refresh initiated for channel: ${channelId}`);
    } catch (error) {
      console.error(`❌ Error refreshing QR code for ${channelId}:`, error);
      await this.updateChannelStatus(channelId, 'error');
      throw error;
    }
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up WhatsApp connections...');
    const disconnectPromises = Array.from(this.connections.keys()).map(
      (channelId) => this.disconnectChannel(channelId),
    );
    await Promise.all(disconnectPromises);

    // Clear all cached group metadata
    this.clearGroupCache();

    // Clear phone validation cache
    this.clearPhoneValidationCache();

    // Clear all tracking maps
    this.preloadAttempts.clear();
    this.lastPreloadAttempt.clear();
  }

  /**
   * Clears auth state for a channel (useful for debugging)
   */
  async clearAuthState(channelId: string): Promise<void> {
    try {
      await WhatsAppAuthState.deleteMany({ channelId });
      await WhatsAppAuthKey.deleteMany({ channelId });
      console.log(`🧹 Cleared auth state for channel: ${channelId}`);
    } catch (error) {
      console.error(`❌ Error clearing auth state for ${channelId}:`, error);
    }
  }

  /**
   * DEPRECATED: Manual group metadata preloading is discouraged by Baileys documentation
   * as it causes rate-overlimit errors. The cachedGroupMetadata function handles this automatically.
   *
   * This method is kept for backward compatibility but should not be used.
   * See: https://baileys.wiki/docs/socket/configuration#cachedgroupmetadata
   */
  async preloadGroupMetadata(): Promise<void> {
    console.warn(
      `⚠️ preloadGroupMetadata is deprecated - Baileys handles group metadata caching automatically to prevent rate limits`,
    );
    console.warn(
      `ℹ️ See: https://baileys.wiki/docs/socket/configuration#cachedgroupmetadata`,
    );

    // Don't actually preload - let Baileys handle it on-demand
    return;
  }

  /**
   * Clears cached group metadata for a specific channel or all channels
   */
  clearGroupCache(channelId?: string): void {
    if (channelId) {
      // Clear cache entries for specific channel (if we had channel-specific keys)
      console.log(`🧹 Clearing group cache for channel: ${channelId}`);
      // Since we're using JID as keys, we can't easily filter by channel
      // This would require a more complex key structure if needed
    } else {
      // Clear all cached group metadata
      this.groupCache.flushAll();
      console.log('🧹 Cleared all cached group metadata');
    }
  }

  /**
   * Clears phone validation cache for a specific channel or all channels
   */
  clearPhoneValidationCache(channelId?: string): void {
    if (channelId) {
      // Clear cache entries for specific channel
      const keys = this.phoneValidationCache.keys();
      const channelKeys = keys.filter((key) => key.startsWith(`${channelId}:`));
      this.phoneValidationCache.del(channelKeys);
      console.log(
        `🧹 Cleared phone validation cache for channel: ${channelId} (${channelKeys.length} entries)`,
      );
    } else {
      // Clear all cached phone validations
      const totalKeys = this.phoneValidationCache.keys().length;
      this.phoneValidationCache.flushAll();
      console.log(
        `🧹 Cleared all phone validation cache (${totalKeys} entries)`,
      );
    }
  }

  /**
   * Invalidates cache for a specific phone number
   */
  invalidatePhoneValidation(channelId: string, phoneNumber: string): void {
    const cacheKey = `${channelId}:${phoneNumber}`;
    const wasDeleted = this.phoneValidationCache.del(cacheKey);
    if (wasDeleted) {
      console.log(`🗑️ Invalidated phone validation cache for: ${phoneNumber}`);
    } else {
      console.log(`ℹ️ No cache entry found for phone number: ${phoneNumber}`);
    }
  }

  /**
   * Gets phone validation cache statistics
   */
  getPhoneValidationCacheStats(): {
    totalKeys: number;
    hits: number;
    misses: number;
    keys: string[];
  } {
    const stats = this.phoneValidationCache.getStats();
    return {
      totalKeys: this.phoneValidationCache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      keys: this.phoneValidationCache.keys(),
    };
  }

  /**
   * Validates a phone number with caching to prevent repeated validations
   */
  private async validatePhoneNumberWithCache(
    channelId: string,
    phoneNumber: string,
  ): Promise<void> {
    const cacheKey = `${channelId}:${phoneNumber}`;

    // Check if validation result is cached
    const cachedResult = this.phoneValidationCache.get<boolean>(cacheKey);

    if (cachedResult !== undefined) {
      console.log(
        `📋 Using cached validation for ${phoneNumber}: ${
          cachedResult ? 'valid' : 'invalid'
        }`,
      );
      if (!cachedResult) {
        throw new Error(
          `Phone number ${phoneNumber} is not registered on WhatsApp`,
        );
      }
      return;
    }

    // Perform validation if not cached
    console.log(`🔍 Validating phone number: ${phoneNumber} (not in cache)`);
    try {
      const validation = await this.checkIdExists(channelId, phoneNumber);

      // Cache the validation result
      this.phoneValidationCache.set(cacheKey, validation.exists);

      if (!validation.exists) {
        console.log(
          `❌ Phone number ${phoneNumber} is not registered on WhatsApp (cached for future use)`,
        );
        throw new Error(
          `Phone number ${phoneNumber} is not registered on WhatsApp`,
        );
      }

      console.log(
        `✅ Phone number ${phoneNumber} is valid on WhatsApp (cached for future use)`,
      );
    } catch (error) {
      if (error.message.includes('not registered on WhatsApp')) {
        throw error; // Re-throw our custom error
      }
      console.error(`❌ Error validating phone number ${phoneNumber}:`, error);
      throw new Error(
        `Failed to validate phone number ${phoneNumber}. Please check the number format and try again.`,
      );
    }
  }

  /**
   * Sends a message using a format similar to the WhatsApp Cloud API.
   * This handles both single and bulk messages, including replies with context.
   *
   * Order of operations matters: payload-shape validation runs FIRST so that
   * a malformed request gets a precise "X is required" error instead of being
   * masked by a downstream "Channel is not connected" message — important for
   * AI-agent debuggability.
   */
  async sendMessageFromApi(channelId: string, payload: any): Promise<any> {
    let to = payload.to;
    if (!to) {
      throw new Error('Recipient "to" is required');
    }
    validateMessagePayload(payload);

    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    const originalNumber = to; // Store original for validation

    // Format JID properly (handles @lid, @s.whatsapp.net, @g.us, etc.)
    to = formatJid(to);

    const isLid = to.includes('@lid');
    console.log(`📨 Sending message to: ${to}${isLid ? ' (LID)' : ''}`);

    // Validate phone number exists on WhatsApp (skip for LIDs)
    if (!isLid) {
      await this.validatePhoneNumberWithCache(channelId, originalNumber);
    } else {
      console.log(`⏭️ Skipping phone validation for LID: ${to}`);
    }

    let messageContent: any;

    // Handle context for replies
    let quotedMessage: any = null;
    if (payload.context && payload.context.message_id) {
      console.log(
        `🔄 Looking up original message for reply: ${payload.context.message_id}`,
      );

      try {
        // Look up the original message from WhatsAppEvents collection
        const originalMessageDoc = await WhatsAppEvents.findOne({
          channelId,
          'payload.key.id': payload.context.message_id,
        }).sort({ createdAt: -1 }); // Get the most recent match

        if (originalMessageDoc && originalMessageDoc.payload) {
          quotedMessage = originalMessageDoc.payload;
          console.log(
            `✅ Found original message for reply: ${payload.context.message_id}`,
          );
        } else {
          console.warn(
            `⚠️ Original message not found for reply: ${payload.context.message_id}`,
          );
        }
      } catch (error) {
        console.error(`❌ Error looking up original message for reply:`, error);
        // Continue without quote if lookup fails
      }
    }

    switch (payload.type) {
      case 'text': {
        const textBody = payload.text?.body;
        if (!textBody) {
          throw new Error('"text.body" is required for text type');
        }
        messageContent = { text: textBody };

        // Check for Instagram URLs and add custom link preview
        const urlInText = this.extractUrlFromText(textBody);
        if (urlInText && this.isInstagramUrl(urlInText)) {
          const instagramPreview = await this.getInstagramLinkPreview(urlInText);
          if (instagramPreview) {
            messageContent.linkPreview = instagramPreview;
            console.log(`📎 Using custom Instagram link preview for API message`);
          }
        }
        break;
      }
      case 'image':
      case 'video':
      case 'audio':
      case 'sticker': {
        const mediaPayload = payload[payload.type];
        const mediaSource = resolveMediaSource(mediaPayload, payload.type);
        const isVoiceNote = payload.type === 'audio' && mediaPayload?.voice === true;
        messageContent = {
          [payload.type]: mediaSource,
          caption: mediaPayload?.caption,
          mimetype: mediaPayload?.mime_type ?? (isVoiceNote ? 'audio/ogg; codecs=opus' : undefined),
          ptt: isVoiceNote || undefined,
        };
        break;
      }
      case 'document': {
        const documentPayload = payload.document;
        const mediaSource = resolveMediaSource(documentPayload, 'document');
        messageContent = {
          document: mediaSource,
          caption: documentPayload?.caption,
          fileName: documentPayload?.filename,
          mimetype: documentPayload?.mime_type,
        };
        break;
      }
      case 'location': {
        const loc = payload.location;
        if (loc?.latitude === undefined || loc?.longitude === undefined) {
          throw new Error('"latitude" and "longitude" are required for location type');
        }
        messageContent = {
          location: {
            degreesLatitude: Number(loc.latitude),
            degreesLongitude: Number(loc.longitude),
            name: loc.name,
            address: loc.address,
          },
        };
        break;
      }
      case 'contacts':
      case 'contact': {
        const contacts = payload.contacts ?? [payload.contact];
        if (!Array.isArray(contacts) || contacts.length === 0) {
          throw new Error('"contacts" array is required for contact type');
        }
        const vcards = contacts.map((c: any) => buildVCard(c));
        messageContent = {
          contacts: {
            displayName: contacts[0]?.name?.formatted_name ?? contacts[0]?.name?.first_name ?? 'Contact',
            contacts: vcards.map((vcard) => ({ vcard })),
          },
        };
        break;
      }
      case 'reaction': {
        const reaction = payload.reaction;
        if (!reaction?.message_id) {
          throw new Error('"message_id" is required for reaction type');
        }
        const reactedDoc = await WhatsAppEvents.findOne({
          channelId,
          'payload.key.id': reaction.message_id,
        }).sort({ createdAt: -1 });
        if (!reactedDoc?.payload?.key) {
          throw new Error(`Cannot react: message ${reaction.message_id} not found`);
        }
        messageContent = {
          react: {
            text: reaction.emoji ?? '',
            key: reactedDoc.payload.key,
          },
        };
        break;
      }
      case 'interactive': {
        messageContent = buildInteractiveContent(payload.interactive);
        break;
      }
      default:
        throw new Error(`Unsupported message type: "${payload.type}"`);
    }

    console.log('Quoted message:', quotedMessage);

    // Anti-ban: Mark the original message as read first (send "seen")
    if (quotedMessage) {
      await this.markAsRead(channelId, [
        {
          remoteJid: quotedMessage.key.remoteJid,
          id: quotedMessage.key.id,
          fromMe: quotedMessage.key.fromMe,
          participant: quotedMessage.key.participant,
        },
      ]);
    }

    // Anti-ban measures: typing indicator flow
    // For text: always show typing. For media w/ caption: typing pre-caption.
    // For reaction/location/contact/interactive: skip typing (no text content).
    const textForTyping =
      payload.type === 'text'
        ? payload.text?.body
        : payload[payload.type]?.caption;

    if (textForTyping) {
      // Start typing indicator
      await this.startTyping(channelId, to);

      // Simulate typing delay based on text length
      const typingDelay = this.calculateTypingDelay(textForTyping);
      console.log(`⏱️ Simulating typing for ${typingDelay}ms (text length: ${textForTyping.length})`);
      await new Promise(resolve => setTimeout(resolve, typingDelay));

      // Stop typing before sending
      await this.stopTyping(channelId, to);
    }

    try {
      let message;

      // Send message with quoted reply if context is provided
      if (quotedMessage) {
        console.log(
          `📝 Sending reply to message: ${payload.context.message_id}`,
        );
        message = await sock.sendMessage(to, messageContent, {
          quoted: quotedMessage,
        });
      } else {
        message = await sock.sendMessage(to, messageContent);
      }

      console.log(
        `📤 Message sent from ${channelId} to ${to}${
          quotedMessage ? ' (reply)' : ''
        }`,
      );

      // Save the sent message to WhatsAppEvents for future reply reference
      try {
        const whatsAppEvent = new WhatsAppEvents({
          channelId: channelId,
          payload: message, // Save the full message object returned by Baileys
        });
        await whatsAppEvent.save();
        console.log(
          `💾 Sent message saved to WhatsAppEvents: ${message?.key?.id}`,
        );
      } catch (saveError) {
        console.error(
          `❌ Error saving sent message to WhatsAppEvents:`,
          saveError,
        );
        // Don't throw error here - message was sent successfully, saving is just for reference
      }

      return message;
    } catch (error) {
      console.error(`❌ Error sending message from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Checks if a given ID (JID) exists on WhatsApp.
   */
  async checkIdExists(
    channelId: string,
    jid: string,
  ): Promise<{ exists: boolean; jid: string }> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }
    const [result] = await sock.onWhatsApp(jid);
    if (result) {
      return { jid: result.jid, exists: !!result.exists };
    }
    return { exists: false, jid };
  }

  /**
   * Fetches the status of a contact.
   */
  async fetchContactStatus(
    channelId: string,
    jid: string,
  ): Promise<{ status: string; setAt: Date } | undefined> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }
    try {
      const status = await sock.fetchStatus(jid);
      return status as any;
    } catch (error) {
      console.error(`❌ Error fetching status for ${jid}:`, error);
      // It often fails if the user doesn't have a status or has privacy settings
      return undefined;
    }
  }

  /**
   * Fetches the profile picture URL of a contact or group.
   */
  async fetchProfilePictureUrl(
    channelId: string,
    jid: string,
    type: 'preview' | 'image' = 'preview',
  ): Promise<string | undefined> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }
    try {
      const url = await sock.profilePictureUrl(jid, type);
      return url;
    } catch (error) {
      console.error(`❌ Error fetching profile picture for ${jid}:`, error);
      // This can fail if the user has no profile picture or due to privacy settings
      return undefined;
    }
  }

  /**
   * Downloads and saves a profile picture locally, returning the local URL.
   */
  async downloadAndSaveProfilePicture(
    channelId: string,
    jid: string,
    type: 'preview' | 'image' = 'preview',
  ): Promise<string | undefined> {
    try {
      // First get the profile picture URL from WhatsApp
      const profilePictureUrl = await this.fetchProfilePictureUrl(
        channelId,
        jid,
        type,
      );

      if (!profilePictureUrl) {
        return undefined;
      }

      // Download the image
      const response = await axios.get(profilePictureUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });

      const buffer = Buffer.from(response.data);

      // Determine file extension from content type or default to jpg
      const contentType = response.headers['content-type'];
      let fileExtension = 'jpg';
      if (contentType) {
        if (contentType.includes('png')) fileExtension = 'png';
        else if (contentType.includes('gif')) fileExtension = 'gif';
        else if (contentType.includes('webp')) fileExtension = 'webp';
      }

      // Create filename with sanitized JID
      const sanitizedJid = jid.replace(/[@.]/g, '_');
      const fileName = `profile_${sanitizedJid}_${type}_${Date.now()}.${fileExtension}`;

      // Ensure storage directory exists
      const storagePath = path.join(__dirname, `../../storage/${channelId}`);
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      // Save the file
      const filePath = path.join(storagePath, fileName);
      await fs.promises.writeFile(filePath, buffer);

      // Return the public URL
      const publicUrl = `${process.env.BACKEND_DOMAIN}/storage/${channelId}/${fileName}`;

      console.log(`📸 Profile picture saved for ${jid}: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error(
        `❌ Error downloading and saving profile picture for ${jid}:`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Get all known LID to phone number mappings for a channel
   */
  async getAllLids(
    channelId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Array<{ lid: string; pn: string }>> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      console.warn(`⚠️ LID mapping not available for channel ${channelId}`);
      return [];
    }

    try {
      // Access the internal store if available
      // Note: This is implementation-specific and may need adjustment based on Baileys version
      const store = sock.signalRepository.lidMapping as any;

      // Try to get all mappings if the store exposes them
      if (store.store && typeof store.store.toJSON === 'function') {
        const allMappings = store.store.toJSON();
        const mappings = Object.entries(allMappings).map(([lid, pn]) => ({
          lid,
          pn: pn as string,
        }));

        // Apply pagination
        return mappings.slice(offset, offset + limit);
      }

      console.warn(
        `⚠️ LID mapping store structure not accessible for channel ${channelId}`,
      );
      return [];
    } catch (error) {
      console.error(`❌ Error getting LID mappings for ${channelId}:`, error);
      return [];
    }
  }

  /**
   * Get count of known LID mappings for a channel
   */
  async getLidsCount(channelId: string): Promise<number> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      return 0;
    }

    try {
      const store = sock.signalRepository.lidMapping as any;

      if (store.store && typeof store.store.toJSON === 'function') {
        const allMappings = store.store.toJSON();
        return Object.keys(allMappings).length;
      }

      return 0;
    } catch (error) {
      console.error(`❌ Error getting LID count for ${channelId}:`, error);
      return 0;
    }
  }

  /**
   * Get phone number for a specific LID
   */
  async getPhoneNumberByLid(
    channelId: string,
    lid: string,
  ): Promise<{ lid: string; pn: string } | null> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      throw new Error(`LID mapping not available for channel ${channelId}`);
    }

    // Ensure LID has proper suffix
    const formattedLid = lid.includes('@') ? lid : `${lid}@lid`;

    try {
      const pn =
        await sock.signalRepository.lidMapping.getPNForLID(formattedLid);

      if (pn) {
        return { lid: formattedLid, pn };
      }

      return null;
    } catch (error) {
      console.error(
        `❌ Error getting phone number for LID ${formattedLid}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get LID for a specific phone number
   */
  async getLidByPhoneNumber(
    channelId: string,
    phoneNumber: string,
  ): Promise<{ lid: string; pn: string } | null> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      throw new Error(`LID mapping not available for channel ${channelId}`);
    }

    // Ensure phone number has proper suffix
    let formattedPn = phoneNumber;
    if (!phoneNumber.includes('@')) {
      formattedPn = `${phoneNumber}@s.whatsapp.net`;
    }

    try {
      const lid =
        await sock.signalRepository.lidMapping.getLIDForPN(formattedPn);

      if (lid) {
        return { lid, pn: formattedPn };
      }

      return null;
    } catch (error) {
      console.error(
        `❌ Error getting LID for phone number ${formattedPn}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Post a WhatsApp Status (Story) on behalf of the channel.
   *
   * Baileys sends Status by addressing `status@broadcast` with the message
   * options carrying `statusJidList` (the contacts who'll see the story),
   * `broadcast: true`, and optional `backgroundColor` + `font` for text
   * stories. Returns the message id Baileys assigned so callers can track
   * it via the same status webhook pipeline as 1-to-1 messages.
   *
   * Payload schema:
   *   { type: 'text', text: string,
   *       statusJidList: string[],            // recipients: ['51983724476@s.whatsapp.net', ...]
   *       backgroundColor?: string,           // e.g. '#FF5733'
   *       font?: number }                     // 0..6 per WA font index
   *   { type: 'image'|'video', image|video: {link|data}, caption?, statusJidList, backgroundColor?, font? }
   */
  async sendStatus(channelId: string, payload: any): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    const {
      type,
      text,
      image,
      video,
      audio,
      caption,
      statusJidList,
      backgroundColor,
      font,
    } = payload ?? {};

    if (!Array.isArray(statusJidList) || statusJidList.length === 0) {
      throw new Error(
        '"statusJidList" must be a non-empty array of JIDs (e.g. ["51983724476@s.whatsapp.net"])',
      );
    }

    // Each entry must be a fully-qualified phone JID — formatJid normalizes
    // bare numbers so callers can pass `"51983724476"` or the full form.
    const normalizedJidList = statusJidList.map((jid: string) =>
      formatJid(jid),
    );

    let content: any;
    switch (type) {
      case 'text': {
        if (!text || typeof text !== 'string') {
          throw new Error('"text" string is required for status type "text"');
        }
        content = { text };
        break;
      }
      case 'image': {
        if (!image?.link && !image?.data) {
          throw new Error('"image.link" or "image.data" is required');
        }
        content = { image: resolveMediaSource(image, 'image'), caption };
        break;
      }
      case 'video': {
        if (!video?.link && !video?.data) {
          throw new Error('"video.link" or "video.data" is required');
        }
        content = { video: resolveMediaSource(video, 'video'), caption };
        break;
      }
      case 'audio': {
        if (!audio?.link && !audio?.data) {
          throw new Error('"audio.link" or "audio.data" is required');
        }
        content = { audio: resolveMediaSource(audio, 'audio') };
        break;
      }
      default:
        throw new Error(
          `Unsupported status type: "${type}" — expected text|image|video|audio`,
        );
    }

    const options: any = {
      statusJidList: normalizedJidList,
      broadcast: true,
    };
    if (backgroundColor) options.backgroundColor = backgroundColor;
    if (font !== undefined && font !== null) options.font = font;

    console.log(
      `📰 Posting WhatsApp Status from ${channelId} type=${type} to ${normalizedJidList.length} recipient(s)`,
    );

    const sendResult: any = await sock.sendMessage(
      'status@broadcast',
      content,
      options,
    );

    const statusMessageId = sendResult?.key?.id ?? null;
    console.log(
      `✅ Status posted from ${channelId} (msgId=${statusMessageId ?? 'unknown'})`,
    );

    return {
      ok: true,
      messageId: statusMessageId,
      statusJidList: normalizedJidList,
      type,
    };
  }
}

// Singleton instance
export const whatsAppService = new WhatsAppService();

// ── Webhook payload templating ─────────────────────────────────────────────
// Simple {{var}} → payload[var] substitution. Used when a per-channel webhook
// defines a `payloadTemplate` — lets users wire alerts to APIs that expect a
// specific shape (e.g. WhatsApp Cloud API /messages endpoint) instead of the
// raw event JSON we'd send by default.

export function renderWebhookBody(
  webhook: any,
  payload: any,
  channelId: string,
  event: string,
): { body: any; contentType: string } {
  if (!webhook.payloadTemplate) {
    // Legacy path: send raw payload JSON.
    return { body: payload, contentType: 'application/json' };
  }
  const vars = { ...payload, channelId, event };
  const rendered = webhook.payloadTemplate.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_match: string, key: string) => {
      const value = vars[key];
      if (value === undefined || value === null) return '';
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  );
  // Try parse as JSON; if invalid, send as raw text.
  try {
    return { body: JSON.parse(rendered), contentType: 'application/json' };
  } catch {
    return { body: rendered, contentType: 'text/plain; charset=utf-8' };
  }
}

// Format a Date in the given IANA timezone as "DD/MM/YYYY HH:mm:ss" (24h).
// Used by the dispatcher to auto-add a "<key>Local" sibling for every payload
// timestamp key ending in "At", per the webhook's `timezone` setting.
// Falls back to UTC if the timezone is invalid.
export function formatDateInTimezone(d: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return d.toISOString();
  }
}

// Detect ISO 8601 timestamp strings to auto-localize. Strict-ish — avoids
// false positives like "createdAt": "now" (which would be returned as-is).
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// For every payload key ending in "At" that holds an ISO date, add a sibling
// "<key>Local" formatted in the webhook's timezone. Mutation-free.
export function withLocalTimestamps(
  payload: Record<string, any>,
  timezone: string,
): Record<string, any> {
  const out = { ...payload };
  for (const [key, value] of Object.entries(payload)) {
    if (!key.endsWith('At') || typeof value !== 'string') continue;
    if (!ISO_DATETIME_RE.test(value)) continue;
    const localKey = `${key}Local`;
    if (localKey in out) continue; // don't overwrite a manually-set field
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    out[localKey] = formatDateInTimezone(date, timezone);
  }
  return out;
}

export function mapToObject(
  m: Map<string, string> | Record<string, string> | undefined,
): Record<string, string> {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m);
  return m;
}
