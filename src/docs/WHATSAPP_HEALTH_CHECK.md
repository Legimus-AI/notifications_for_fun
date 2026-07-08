# WhatsApp Health Check Cron Job

## Overview

Every 5 minutes the cron deep-checks all active WhatsApp channels, auto-heals the ones it safely can, and alerts humans about the rest. It is the safety net for channels that die WITHOUT a 'close' event (a socket that hangs, or a connect that threw mid-flight and left the channel frozen in `error`) — the engine's own reconnect machinery only reacts to close events.

## Files

1. **`/src/cronjobs/WhatsAppHealthCheckCron.ts`** — cron implementation (`node-cron`).
   Exports: `startWhatsAppHealthCheck()`, `stopWhatsAppHealthCheck()`, `manualHealthCheck()`.
2. **`/src/config/healthCheck.config.ts`** — every threshold/constant, each with a WHY comment. Change behavior there, not in the cron.
3. **`/src/services/alertDelivery.ts`** — multi-channel alert dispatch (`sendAlertToAllRecipients`); recipients in `alertRecipients.config.ts`. (CallMeBot was removed 2026-05-29.)
4. Started/stopped automatically from `/src/index.ts`. First tick is delayed 30s so boot restoration finishes before the cron observes transitional states.

## Health check logic

Monitors only channels with `isActive: true` and `type: 'whatsapp_automated'`.

Per channel, three levels (in `isConnectionAlive`):

1. **Connection exists** — socket present in WhatsAppService. If missing, DB status distinguishes `status_logged_out` (terminal, human action) from `no_connection` (healable).
2. **Status check** — in-memory status must be `active`.
3. **Phone registration** — Baileys `onWhatsApp()` verifies the number is still registered (`phone_not_registered` = banned/deactivated). A failed *check* (network blip) logs a warning but does NOT mark the channel dead.

## Auto-heal

Unhealthy channels get `connectChannel` fired, EXCEPT when:

- Reason is in `UNHEALABLE_REASONS` (terminal like `status_logged_out`/`phone_not_registered`, or in-progress states like `status_connecting`/`status_qr_ready`).
- `whatsAppService.isReconnectPending(channelId)` is true — the engine already has a retry timer armed or a connect in flight. **WHY: the cron tick can land seconds after a disconnect the engine is already handling; healing then spawned a second socket with the same device identity (2026-07-07 double-socket incident: the orphan held the WhatsApp slot and 401-looped the channel into a false "revoked" parking).** The engine's per-channel connect lock is the second line of defense.
- `MAX_HEAL_ATTEMPTS` (3) consecutive attempts already failed (counter resets when the channel turns healthy).
- A previous heal for that channel is still running (`healInProgress`).

After healing it waits `HEAL_RECHECK_DELAY_MS` (10s) and re-checks; only channels still unhealthy are notified.

## Alerts

- **Per-channel cap:** max `MAX_CONSECUTIVE_ALERTS` (3) consecutive alerts per channel; counter resets on recovery. After the cap the channel stays broken SILENTLY — that's what the mass alarm covers.
- **Mass-outage alarm:** ≥ `MASS_UNHEALTHY_ALERT_THRESHOLD` (5) unhealthy at once sends ONE aggregate 🚨 alert that BYPASSES the per-channel cap, with a 1h cooldown. While ≥5 channels sit parked awaiting re-pair this re-fires hourly — expected, not an incident.
- Delivery via `sendAlertToAllRecipients` (WhatsApp channel + any configured recipients).

## Interplay with the engine (WhatsAppService)

- Engine handles reactive reconnects itself (transitory retry, conflict backoff, steady cooldown, ghost recovery). The cron NEVER competes with those paths (`isReconnectPending` guard).
- Revoked sessions park as `logged_out` and are skipped by auto-heal ("requires human action") — recovery is a human re-pair (pairing code first, QR fallback).
- **Ghost recovery** (engine-side, not cron): a 401 streak on a channel that OPENED during the streak is a self-conflict, not a revocation — the engine full-stops every socket and does one clean reconnect after `GHOST_RECOVERY_DELAY_MS` (90s), max `MAX_GHOST_RECOVERIES` (2) per streak. During that window the channel reads `status_connecting` → cron leaves it alone.

## Schedule

`HEALTH_CHECK_SCHEDULE = '*/5 * * * *'` (UTC). A slow tick blocks the next one (`isExecutionInProgress`) instead of overlapping.

## Manual usage

```typescript
import { manualHealthCheck } from './cronjobs/WhatsAppHealthCheckCron';
const { healthy, unhealthy } = await manualHealthCheck();
```

## Log indicators

- `🏥` tick start · `✅/❌` per-channel verdict · `🔧` heal attempt N/3
- `⏭️` skipped (max alerts, unhealable reason, or engine reconnect pending)
- `📊` alert counter · `📤` alert dispatch · `🚨` mass outage
- Engine-side (not cron): `👻` orphan destruction / ghost recovery · `🚪` terminal parking

## Troubleshooting

- **Alerts not arriving:** check `alertRecipients.config.ts` + the alert WhatsApp channel itself is connected (the alert path uses a channel too).
- **Cron not running:** look for "Starting WhatsApp health check cron" at boot.
- **False positives:** transitional states are already skipped; a channel flapping under WA-side churn self-heals in seconds and never reaches the alert path unless it stays down a full tick.
