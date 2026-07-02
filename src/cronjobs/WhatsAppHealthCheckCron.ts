import * as cron from 'node-cron';
import { whatsAppService } from '../services/WhatsAppService';
import { sendAlertToAllRecipients } from '../services/alertDelivery';
import Channel from '../models/Channels';
import {
  MAX_CONSECUTIVE_ALERTS,
  MASS_UNHEALTHY_ALERT_THRESHOLD,
  HEALTH_CHECK_SCHEDULE,
  HEALTH_CHECK_TIMEZONE,
  MAX_HEAL_ATTEMPTS,
  HEAL_RECHECK_DELAY_MS,
  UNHEALABLE_REASONS,
} from '../config/healthCheck.config';

type UnhealthyChannel = {
  channelId: string;
  phoneNumber?: string;
  status: string;
};

// Track alert counts per channel
// Structure: { channelId: { count: number, lastStatus: string } }
const alertCounters = new Map<string, { count: number; lastStatus: string }>();

// Track consecutive auto-heal attempts per channel.
// Resets when channel becomes healthy. Channels above MAX_HEAL_ATTEMPTS
// stop being auto-healed until they recover or the process restarts.
const healAttempts = new Map<string, number>();

// Per-channel lock to prevent overlapping connectChannel calls when a heal
// from a previous cron tick is still running.
const healInProgress = new Set<string>();

// Re-entrancy guard: a slow tick (heal + recheck) can outlast the 5min cron
// interval, so block the next tick instead of running them concurrently.
let isExecutionInProgress = false;

/**
 * Deep check if a WhatsApp connection is truly alive
 * Checks: connection exists, WebSocket is open, and can query own phone number
 */
const isConnectionAlive = async (
  channelId: string,
  phoneNumber?: string,
): Promise<{ alive: boolean; reason: string }> => {
  try {
    // Check 1: Does connection exist in service?
    const activeConnections = whatsAppService.getActiveConnections();
    if (!activeConnections.includes(channelId)) {
      // Distinguish a recoverable drop from an irreversible logout.
      // On 'loggedOut' the close handler deletes the socket BEFORE we get here,
      // so the in-memory status map is stale — DB is the source of truth.
      const dbStatus = await whatsAppService.getChannelStatusFromDB(channelId);
      if (dbStatus === 'logged_out') {
        return { alive: false, reason: 'status_logged_out' };
      }
      return { alive: false, reason: 'no_connection' };
    }

    // Check 2: What's the status in service?
    const status = whatsAppService.getChannelStatus(channelId);
    if (status !== 'active') {
      return { alive: false, reason: `status_${status}` };
    }

    // Check 3: Try to verify the phone number is still registered (if available)
    if (phoneNumber) {
      try {
        // Format phone number (remove + and spaces)
        const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
        const jid = `${formattedPhone}@s.whatsapp.net`;

        // Try to check if the number exists on WhatsApp
        const result = await whatsAppService.checkIdExists(channelId, jid);

        if (!result.exists) {
          return {
            alive: false,
            reason: 'phone_not_registered',
          };
        }
      } catch (error) {
        // If check fails, log but don't mark as dead (might be a temporary issue)
        console.log(
          `⚠️ Could not verify phone number for ${channelId}:`,
          error,
        );
      }
    }

    // All checks passed
    return { alive: true, reason: 'healthy' };
  } catch (error) {
    console.error(
      `❌ Error checking connection alive for ${channelId}:`,
      error,
    );
    return { alive: false, reason: 'check_error' };
  }
};

/**
 * Check health of all WhatsApp connections
 * Returns an object with healthy and unhealthy channels
 */
const checkWhatsAppHealth = async (): Promise<{
  healthy: string[];
  unhealthy: Array<UnhealthyChannel>;
}> => {
  try {
    // Get all channels where isActive is true (regardless of current status)
    const activeChannels = await Channel.find({
      type: 'whatsapp_automated',
      isActive: true,
    });

    console.log(
      `🏥 Health check: Found ${activeChannels.length} channels with isActive=true`,
    );

    const healthy: string[] = [];
    const unhealthy: Array<UnhealthyChannel> = [];

    // Check each channel with deep alive check
    for (const channel of activeChannels) {
      const channelId = channel.channelId;
      const phoneNumber =
        channel.type === 'whatsapp_automated'
          ? (channel.config as any)?.phoneNumber
          : undefined;

      // Perform deep alive check using Baileys
      const aliveCheck = await isConnectionAlive(channelId, phoneNumber);

      if (aliveCheck.alive) {
        healthy.push(channelId);
        console.log(
          `✅ ${channelId} is healthy (phone: ${phoneNumber || 'N/A'})`,
        );

        // Reset alert + heal counters when channel becomes healthy
        if (alertCounters.has(channelId)) {
          console.log(
            `🔄 Resetting alert counter for ${channelId} (now healthy)`,
          );
          alertCounters.delete(channelId);
        }
        if (healAttempts.has(channelId)) {
          console.log(
            `🔄 Resetting heal counter for ${channelId} (now healthy)`,
          );
          healAttempts.delete(channelId);
        }
      } else {
        const status = aliveCheck.reason;
        unhealthy.push({ channelId, phoneNumber, status });
        console.log(
          `❌ ${channelId} is unhealthy (reason: ${status}, phone: ${
            phoneNumber || 'N/A'
          })`,
        );
      }
    }

    return { healthy, unhealthy };
  } catch (error) {
    console.error('❌ Error checking WhatsApp health:', error);
    throw error;
  }
};

/**
 * Filter unhealthy channels based on alert counter
 * Only includes channels that haven't exceeded the max consecutive alerts
 */
const filterChannelsForAlert = (
  unhealthy: Array<UnhealthyChannel>,
): Array<UnhealthyChannel> => {
  const channelsToAlert: Array<UnhealthyChannel> = [];

  for (const channel of unhealthy) {
    const { channelId, status } = channel;
    const counter = alertCounters.get(channelId);

    if (!counter) {
      // First alert for this channel
      alertCounters.set(channelId, { count: 1, lastStatus: status });
      channelsToAlert.push(channel);
      console.log(`📊 ${channelId}: First alert (1/${MAX_CONSECUTIVE_ALERTS})`);
    } else if (counter.count < MAX_CONSECUTIVE_ALERTS) {
      // Increment counter and send alert
      counter.count++;
      counter.lastStatus = status;
      alertCounters.set(channelId, counter);
      channelsToAlert.push(channel);
      console.log(
        `📊 ${channelId}: Alert ${counter.count}/${MAX_CONSECUTIVE_ALERTS}`,
      );
    } else {
      // Max alerts reached, don't send
      console.log(
        `⏭️ ${channelId}: Max alerts (${MAX_CONSECUTIVE_ALERTS}) reached, skipping notification`,
      );
    }
  }

  return channelsToAlert;
};

// Track if notification is currently being sent to prevent duplicates
let isNotificationInProgress = false;

/**
 * Send notification about unhealthy channels
 */
const notifyUnhealthyChannels = async (
  unhealthy: Array<UnhealthyChannel>,
): Promise<void> => {
  if (unhealthy.length === 0) {
    return;
  }

  // Prevent duplicate notifications if one is already in progress
  if (isNotificationInProgress) {
    console.log('⏭️ Notification already in progress, skipping duplicate');
    return;
  }

  try {
    isNotificationInProgress = true;

    // Filter channels based on alert counter
    const channelsToAlert = filterChannelsForAlert(unhealthy);

    if (channelsToAlert.length === 0) {
      console.log(
        '⏭️ All unhealthy channels have reached max alerts, no notification sent',
      );
      return;
    }

    // Helper function to get status emoji and description
    const getStatusInfo = (
      status: string,
    ): { emoji: string; description: string } => {
      const statusMap: Record<string, { emoji: string; description: string }> = {
        no_connection: { emoji: '🔌', description: 'No Connection' },
        status_inactive: { emoji: '⚫', description: 'Inactive' },
        status_disconnected: { emoji: '🔴', description: 'Disconnected' },
        status_connecting: { emoji: '🟡', description: 'Connecting' },
        status_qr_ready: { emoji: '📱', description: 'QR Ready' },
        status_pairing_code_ready: {
          emoji: '🔑',
          description: 'Pairing Code Ready',
        },
        phone_not_registered: {
          emoji: '❌',
          description: 'Number Not Registered',
        },
        check_error: { emoji: '⚠️', description: 'Check Error' },
      };

      // Handle status_ prefix
      const normalizedStatus = status.startsWith('status_')
        ? status
        : `status_${status}`;

      return (
        statusMap[normalizedStatus] ||
        statusMap[status] || {
          emoji: '❓',
          description: status
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
        }
      );
    };

    // Format phone number nicely
    const formatPhoneNumber = (phone?: string): string => {
      if (!phone) return 'N/A';
      // Format: +XX XXX XXX XXXX or just show as is if already formatted
      const cleaned = phone.replace(/[^0-9]/g, '');
      if (cleaned.length >= 10) {
        return `+${cleaned}`;
      }
      return phone;
    };

    // Build beautiful message
    const channelCount = channelsToAlert.length;
    const header = `🚨 *WhatsApp Health Alert* 🚨\n\n`;
    const summary = `📊 *${channelCount} channel${channelCount > 1 ? 's' : ''} ${
      channelCount > 1 ? 'are' : 'is'
    } affected*\n\n`;
    const separator = '━━━━━━━━━━━━━━━━━━━━';

    const channelsList = channelsToAlert
      .map((ch, index) => {
        const shortId = ch.channelId.substring(0, 8);
        const statusInfo = getStatusInfo(ch.status);
        const formattedPhone = formatPhoneNumber(ch.phoneNumber);

        return `${index + 1}. ${
          statusInfo.emoji
        } *${formattedPhone}*\n   └─ ID: \`${shortId}\`\n   └─ Status: ${
          statusInfo.description
        }`;
      })
      .join('\n\n');

    const footer = `\n\n${separator}\n⏰ ${new Date().toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    })} UTC`;

    const message = `${header}${summary}${separator}\n\n${channelsList}${footer}`;

    console.log(`📤 Dispatching health alert across all configured channels...`);

    const deliveryResults = await sendAlertToAllRecipients(message);

    for (const deliveryResult of deliveryResults) {
      const recipientLabel = deliveryResult.name ?? deliveryResult.recipient;
      if (deliveryResult.ok) {
        console.log(
          `✅ Alert via ${deliveryResult.channel} → ${recipientLabel} (msgId=${deliveryResult.messageId ?? 'n/a'})`,
        );
      } else {
        console.error(
          `❌ Alert via ${deliveryResult.channel} → ${recipientLabel} failed: ${deliveryResult.error}`,
        );
      }
    }

    const successfulDeliveries = deliveryResults.filter((d) => d.ok).length;
    const failedDeliveries = deliveryResults.length - successfulDeliveries;
    console.log(
      `📊 Alert dispatch summary: ${successfulDeliveries}/${deliveryResults.length} channels delivered (${failedDeliveries} failed)`,
    );
  } finally {
    isNotificationInProgress = false;
  }
};

// In-memory rate limit for the aggregate mass-outage alert.
// WHY 1h: the tick runs every 5min — without a cooldown an ongoing mass
// outage would page 12x/hour; once it still re-pages hourly while unresolved.
let lastMassAlertAt = 0;
const MASS_ALERT_COOLDOWN_MS = 60 * 60_000;

/**
 * Send ONE aggregate alert on a systemic outage, BYPASSING the per-channel
 * MAX_CONSECUTIVE_ALERTS cap (that cap silenced a 14-channel outage).
 */
const notifyMassOutage = async (
  unhealthyCount: number,
  totalCount: number,
): Promise<void> => {
  if (unhealthyCount < MASS_UNHEALTHY_ALERT_THRESHOLD) {
    return;
  }

  const now = Date.now();
  if (now - lastMassAlertAt < MASS_ALERT_COOLDOWN_MS) {
    console.log(
      `⏭️ Mass-outage alert suppressed (last sent ${Math.round((now - lastMassAlertAt) / 60_000)}min ago, cooldown 60min)`,
    );
    return;
  }
  lastMassAlertAt = now;

  const message = `🚨 *MASS OUTAGE*: ${unhealthyCount}/${totalCount} channels unhealthy\n\nPer-channel alerts may be capped — check the gateway host/network NOW.\n\n⏰ ${new Date().toLocaleString(
    'en-US',
    { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' },
  )} UTC`;

  console.log(
    `📤 Dispatching MASS OUTAGE alert (${unhealthyCount}/${totalCount} channels unhealthy)...`,
  );

  const deliveryResults = await sendAlertToAllRecipients(message);

  for (const deliveryResult of deliveryResults) {
    const recipientLabel = deliveryResult.name ?? deliveryResult.recipient;
    if (deliveryResult.ok) {
      console.log(
        `✅ Mass-outage alert via ${deliveryResult.channel} → ${recipientLabel} (msgId=${deliveryResult.messageId ?? 'n/a'})`,
      );
    } else {
      console.error(
        `❌ Mass-outage alert via ${deliveryResult.channel} → ${recipientLabel} failed: ${deliveryResult.error}`,
      );
    }
  }
};

/**
 * Re-run isConnectionAlive on a known subset of channels (no Mongo round-trip)
 */
const recheckChannels = async (
  channels: Array<UnhealthyChannel>,
): Promise<Array<UnhealthyChannel>> => {
  const stillUnhealthy: Array<UnhealthyChannel> = [];
  for (const channel of channels) {
    const { channelId, phoneNumber } = channel;
    const aliveCheck = await isConnectionAlive(channelId, phoneNumber);
    if (!aliveCheck.alive) {
      stillUnhealthy.push({ channelId, phoneNumber, status: aliveCheck.reason });
    }
  }
  return stillUnhealthy;
};

/**
 * Try to auto-heal unhealthy channels by triggering connectChannel.
 * Returns the subset still unhealthy (caller notifies humans about these).
 */
const attemptAutoHeal = async (
  unhealthy: Array<UnhealthyChannel>,
): Promise<Array<UnhealthyChannel>> => {
  if (unhealthy.length === 0) {
    return [];
  }

  const healable: Array<UnhealthyChannel> = [];
  const skipped: Array<UnhealthyChannel> = [];

  for (const channel of unhealthy) {
    const { channelId, status } = channel;

    if (UNHEALABLE_REASONS.includes(status)) {
      console.log(
        `⏭️ ${channelId}: skipping auto-heal (reason "${status}" requires human action)`,
      );
      skipped.push(channel);
      continue;
    }

    const previousAttempts = healAttempts.get(channelId) ?? 0;
    if (previousAttempts >= MAX_HEAL_ATTEMPTS) {
      console.log(
        `⏭️ ${channelId}: skipping auto-heal (max ${MAX_HEAL_ATTEMPTS} attempts reached)`,
      );
      skipped.push(channel);
      continue;
    }

    if (healInProgress.has(channelId)) {
      console.log(
        `⏭️ ${channelId}: skipping auto-heal (previous heal still in progress)`,
      );
      skipped.push(channel);
      continue;
    }

    healable.push(channel);
  }

  if (healable.length === 0) {
    return skipped;
  }

  console.log(
    `🔧 Auto-healing ${healable.length} channel${
      healable.length > 1 ? 's' : ''
    }: ${healable.map((channel) => channel.channelId).join(', ')}`,
  );

  await Promise.allSettled(
    healable.map(async (channel) => {
      const { channelId, phoneNumber } = channel;
      const attemptNumber = (healAttempts.get(channelId) ?? 0) + 1;
      healAttempts.set(channelId, attemptNumber);
      healInProgress.add(channelId);
      try {
        console.log(
          `🔧 ${channelId}: heal attempt ${attemptNumber}/${MAX_HEAL_ATTEMPTS}`,
        );
        await whatsAppService.connectChannel(channelId, phoneNumber);
      } catch (error) {
        console.error(`❌ Auto-heal failed for ${channelId}:`, error);
      } finally {
        healInProgress.delete(channelId);
      }
    }),
  );

  // Give Baileys time to complete handshake before re-checking
  await new Promise((resolve) => setTimeout(resolve, HEAL_RECHECK_DELAY_MS));

  const stillUnhealthyAfterHeal = await recheckChannels(healable);

  const recovered = healable.length - stillUnhealthyAfterHeal.length;
  if (recovered > 0) {
    console.log(`✅ Auto-heal recovered ${recovered} channel${recovered > 1 ? 's' : ''}`);
  }

  return [...skipped, ...stillUnhealthyAfterHeal];
};

/**
 * Drop entries for channels that no longer exist (deleted or marked isActive=false)
 */
const pruneStaleCounters = (knownChannelIds: Set<string>): void => {
  for (const channelId of alertCounters.keys()) {
    if (!knownChannelIds.has(channelId)) {
      alertCounters.delete(channelId);
    }
  }
  for (const channelId of healAttempts.keys()) {
    if (!knownChannelIds.has(channelId)) {
      healAttempts.delete(channelId);
    }
  }
  for (const channelId of healInProgress) {
    if (!knownChannelIds.has(channelId)) {
      healInProgress.delete(channelId);
    }
  }
};

/**
 * Execute health check, attempt auto-heal, then notify only what stayed unhealthy
 */
const executeHealthCheck = async (): Promise<void> => {
  if (isExecutionInProgress) {
    console.log('⏭️ Health check skipped: previous tick still running');
    return;
  }
  isExecutionInProgress = true;
  try {
    console.log('🏥 Starting WhatsApp health check...');

    const { healthy, unhealthy } = await checkWhatsAppHealth();

    pruneStaleCounters(new Set([...healthy, ...unhealthy.map((c) => c.channelId)]));

    console.log(`✅ Healthy channels: ${healthy.length}`);
    console.log(`❌ Unhealthy channels: ${unhealthy.length}`);

    // Log all findings
    if (healthy.length > 0) {
      console.log('📋 Healthy channels:', healthy.join(', '));
    }

    if (unhealthy.length > 0) {
      console.log(
        '📋 Unhealthy channels:',
        unhealthy.map((channel) => channel.channelId).join(', '),
      );

      const stillUnhealthy = await attemptAutoHeal(unhealthy);

      // Systemic outage → one aggregate alert, immune to the per-channel cap
      await notifyMassOutage(
        stillUnhealthy.length,
        healthy.length + unhealthy.length,
      );

      if (stillUnhealthy.length > 0) {
        console.log(
          `📨 Notifying about ${stillUnhealthy.length} channel${
            stillUnhealthy.length > 1 ? 's' : ''
          } still unhealthy after auto-heal`,
        );
        await notifyUnhealthyChannels(stillUnhealthy);
      }
    }

    console.log('✅ WhatsApp health check completed');
  } catch (error) {
    console.error('❌ Error executing health check:', error);
  } finally {
    isExecutionInProgress = false;
  }
};

/**
 * Cron job instance
 */
let healthCheckJob: cron.ScheduledTask | null = null;

/**
 * Start the WhatsApp health check cron job
 * Runs every 5 minutes
 */
export const startWhatsAppHealthCheck = (): void => {
  if (healthCheckJob) {
    console.log('⚠️ WhatsApp health check cron is already running');
    return;
  }

  console.log('🏥 Starting WhatsApp health check cron...');

  // Run on configured schedule
  healthCheckJob = cron.schedule(
    HEALTH_CHECK_SCHEDULE,
    () => {
      executeHealthCheck();
    },
    {
      timezone: HEALTH_CHECK_TIMEZONE,
    },
  );

  // Start the cron job explicitly
  healthCheckJob.start();

  console.log(
    `✅ WhatsApp health check cron started - running on schedule: ${HEALTH_CHECK_SCHEDULE}`,
  );

  // Delay first tick by 30s so that boot-time restoration finishes before the
  // cron observes channels in transitional states. Otherwise the cron sees
  // status_connecting and (used to) race-fire auto-heal, creating parallel
  // sockets and triggering WhatsApp <conflict type=replaced>.
  setTimeout(() => executeHealthCheck(), 30_000);
};

/**
 * Stop the WhatsApp health check cron job
 */
export const stopWhatsAppHealthCheck = (): void => {
  if (healthCheckJob) {
    console.log('🛑 Stopping WhatsApp health check cron...');
    healthCheckJob.stop();
    healthCheckJob = null;
    console.log('✅ WhatsApp health check cron stopped');
  }
};

/**
 * Manual health check (can be called via API endpoint if needed)
 */
export const manualHealthCheck = async (): Promise<{
  healthy: string[];
  unhealthy: Array<UnhealthyChannel>;
}> => {
  return await checkWhatsAppHealth();
};
