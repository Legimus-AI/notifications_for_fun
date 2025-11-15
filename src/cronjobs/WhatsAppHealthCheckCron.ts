import * as cron from 'node-cron';
import { whatsAppService } from '../services/WhatsAppService';
import { sendCallMeBotNotification } from '../services/callMeBotWhatsAppNotifications';
import Channel from '../models/Channels';

// Configuration from environment variables
const CALLMEBOT_PHONE = process.env.CALLMEBOT_PHONE || '51983724476';
const CALLMEBOT_API_KEY = process.env.CALLMEBOT_API_KEY || '4189609';
const MAX_CONSECUTIVE_ALERTS = 3;

// Track alert counts per channel
// Structure: { channelId: { count: number, lastStatus: string } }
const alertCounters = new Map<string, { count: number; lastStatus: string }>();

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
  unhealthy: Array<{ channelId: string; phoneNumber?: string; status: string }>;
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
    const unhealthy: Array<{
      channelId: string;
      phoneNumber?: string;
      status: string;
    }> = [];

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

        // Reset alert counter when channel becomes healthy
        if (alertCounters.has(channelId)) {
          console.log(
            `🔄 Resetting alert counter for ${channelId} (now healthy)`,
          );
          alertCounters.delete(channelId);
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
  unhealthy: Array<{ channelId: string; phoneNumber?: string; status: string }>,
): Array<{ channelId: string; phoneNumber?: string; status: string }> => {
  const channelsToAlert: Array<{
    channelId: string;
    phoneNumber?: string;
    status: string;
  }> = [];

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

/**
 * Send notification about unhealthy channels
 */
const notifyUnhealthyChannels = async (
  unhealthy: Array<{ channelId: string; phoneNumber?: string; status: string }>,
): Promise<void> => {
  if (unhealthy.length === 0) {
    return;
  }

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
  const separator = '━━━━━━━━━━━━━━━━━━━━\n';

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

  const footer = `\n\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${new Date().toLocaleString(
    'en-US',
    {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    },
  )} UTC`;

  const message = `${header}${summary}${separator}\n${channelsList}${footer}`;

  console.log('📤 Sending health alert notification via CallMeBot...');

  await sendCallMeBotNotification(CALLMEBOT_PHONE, message, CALLMEBOT_API_KEY);
};

/**
 * Execute health check and notify if needed
 */
const executeHealthCheck = async (): Promise<void> => {
  try {
    console.log('🏥 Starting WhatsApp health check...');

    const { healthy, unhealthy } = await checkWhatsAppHealth();

    console.log(`✅ Healthy channels: ${healthy.length}`);
    console.log(`❌ Unhealthy channels: ${unhealthy.length}`);

    // Log all findings
    if (healthy.length > 0) {
      console.log('📋 Healthy channels:', healthy.join(', '));
    }

    if (unhealthy.length > 0) {
      console.log(
        '📋 Unhealthy channels:',
        unhealthy.map((ch) => ch.channelId).join(', '),
      );
      await notifyUnhealthyChannels(unhealthy);
    }

    console.log('✅ WhatsApp health check completed');
  } catch (error) {
    console.error('❌ Error executing health check:', error);
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

  // Run every 5 minutes: */5 * * * *
  healthCheckJob = cron.schedule(
    '*/5 * * * *',
    () => {
      executeHealthCheck();
    },
    {
      timezone: 'UTC',
    },
  );

  console.log(
    '✅ WhatsApp health check cron started - running every 5 minutes',
  );

  // Execute immediately on start
  executeHealthCheck();
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
  unhealthy: Array<{ channelId: string; phoneNumber?: string; status: string }>;
}> => {
  return await checkWhatsAppHealth();
};
