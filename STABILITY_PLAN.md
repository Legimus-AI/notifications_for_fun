# Solución Definitiva — Estabilidad Gateway WhatsApp (notifications_for_fun)

> CED v2.4 · 2026-05-29 · Trazas: Claude (Opus) + Gemini 3 Flash + GPT-5.5 (xhigh) + Web/Sources
> Repo afectado: `~/Developer/TodofullServer/notifications_for_fun` en `ssh-julian.legimus.ai`

## Diagnóstico (causa raíz verificada)

Existe **un ciclo vicioso de memoria + reconexión**, no fallos independientes:

```
tormenta de reconexión (sockets solapados)
   → fuga de memoria (listeners/sockets no liberados, store en RAM)
   → OOM heap (FATAL "Reached heap limit") ≥12 veces
   → PM2 restart NO-graceful (crash, no SIGTERM)
   → ghost device-slot vivo en WhatsApp
   → 401 <conflict type=replaced> al reconectar
   → marca canal logged_out (terminal) + alerta
   → repite
```

Evidencia: `uptime` 17h (no reinició a las 13:45 de hoy), `FATAL ERROR: Reached heap limit` ≥12, `Closing open session in favor of incoming prekey bundle` **1894 veces**, `Existing socket detected` 10. El `out.log` de **7.3 GB** (logea JSON completo de cada mensaje) agrava el I/O.

El código mete **todos** los 401 en `logged_out` permanente — pero Baileys distingue: `conflict`/`Connection Failure` (recuperable, creds válidas) vs `device_removed`/badSession (terminal real). Tratar el conflict recuperable como terminal es lo que hace que canales sanos queden caídos esperando QR.

## Solución (priorizada · código / config / operación)

### P0 — Operación manual (inmediato, sin código)
1. **Deduplicar canales**: el mismo número `+56976282350` tiene 2 channelId. Elegir el canónico, desactivar el duplicado e invalidar su auth-dir. *(Dos sockets sobre la misma cuenta = conflict garantizado.)*
2. **Rotación de logs YA**: `pm2 install pm2-logrotate` →
   ```
   pm2 set pm2-logrotate:max_size 50M
   pm2 set pm2-logrotate:retain 14
   pm2 set pm2-logrotate:compress true
   pm2 set pm2-logrotate:workerInterval 30
   pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
   ```
   Luego `pm2 flush notifications_bot` para vaciar el out.log de 7.3 GB.

### P0 — Código (fixes quirúrgicos)
3. **`utils.ts:183` `removeSuffixFromJid`**: guard `if (!jid) return ''`. Mata 850 TypeError / 292 unhandledRejections. *(No causa los restarts —eso es OOM— pero rompe el webhook de acks y mete ruido.)*
4. **Clasificación correcta del 401** en `WhatsAppService.ts` `connection.update`:
   - `428/408/503/515` → recuperable, reconnect con **backoff exponencial + jitter**.
   - `401` con message `conflict`/`replaced`/`Connection Failure` + auth presente → **`conflict_recoverable`**: cooldown 60-120s, **NO** borrar creds, **NO** QR, **NO** webhook terminal en el primer evento; cap de reintentos (p.ej. 5) y recién ahí `logged_out`.
   - `401 device_removed` / `403` / `411` / badSession persistente → terminal `logged_out` (QR manual).
   - Nueva razón `status_conflict_recoverable` (distinta de `status_logged_out` que sigue siendo unhealable).
5. **Anti-fuga / anti-conflict**: antes de reconectar, `await sock.end()` del socket viejo + **mutex por channelId** durante connect/reconnect + registro runtime `phoneJid → channelId` (si aparece otro canal con el mismo `sock.user.id`, no levantar el segundo). Esto corta la tormenta y la fuga de memoria a la vez.

### P0/P1 — Código (verbosidad de logs = causa raíz del 7.3GB)
6. Quitar `console.log(JSON.stringify(mensaje/evento))` en producción. Log estructurado de 1 línea: `channelId event messageId from to statusCode reason attempt`. Payload completo solo con `DEBUG_BAILEYS_PAYLOADS=true`.

### P1 — Observabilidad / tracking (lo pedido)
7. `ChannelMetricsService` in-memory: por canal `status, lastStatusCode, lastReason, reconnectCount, connectedSince, lastDisconnectAt, healAttempts` (consolidar mapas ya existentes).
8. **Colección Mongo `channel_events`** con índice TTL (~30d): persiste cada transición (disconnect/reconnect/open) con `channelId, statusCode, reason, ts`. Audit trail durable y consultable — sobrevive reinicios.
9. Endpoint `GET /health/channels`: snapshot de métricas + `restart_time` del proceso + memoria + event-loop lag.
10. Línea de log estructurada en cada `connection.update` (no más grep de 7GB).

### P1/P2 — Config PM2 + alertas
11. `ecosystem.config.js`: `kill_timeout: 30000`, `min_uptime: 10000`, `max_restarts: 15`, `restart_delay: 10000`. Evaluar bajar `--max-old-space-size` y arreglar la fuga en vez de subir RAM.
12. Reemplazar **CallMeBot** (devuelve "Account Paused") como canal de alerta crítico → Telegram/Slack/webhook propio. Alertar en `logged_out_real`, `duplicate_detected`, `reconnect_exhausted`, `oom_restart_spike`.

## Por qué esta solución

Ataca el **ciclo** en su punto de quiebre (reconexión + fuga), no los síntomas por separado. El backoff capado evita tanto el flapeo a `logged_out` como la acumulación de sockets que dispara el OOM. Es quirúrgico (edits puntuales, sin reescribir). Convergencia de 3 modelos + best-practice Baileys; la única divergencia (causa del restart) se resolvió empíricamente: **es OOM, no el bug JID** — por eso el fix de fondo es la reconexión/memoria, no solo el null-check.

## Evidencia verificada

| Afirmación | Verificación | Resultado |
|---|---|---|
| Restarts = OOM, no crash por JID | `pm2 jlist` uptime 17h + grep error.log | `FATAL: Reached heap limit` ≥12; uptime 17h ✔ |
| Tormenta de reconexión real | grep out/error.log | `Closing open session` ×1894 ✔ |
| 401 conflict ≠ logout real | Baileys docs + issues #1052/#2094/#2110 | conflict recuperable con creds válidas ✔ |
| Canales duplicados causan conflict | health-alert dumps | `+56976282350` ×2 channelId ✔ |
| 7.3GB por logear payloads | tail out.log | JSON completo por mensaje ✔ |
| Alertas rotas | grep error.log | CallMeBot "Account Paused" ✔ |

## Supuestos sin verificar (plan)

- Las creds del 401-conflict siguen válidas → verificar tras desplegar: un canal en conflict debe auto-recuperarse sin QR (ver `channel_events`).
- La fuga de memoria proviene de sockets no liberados → confirmar con heap snapshot antes/después del fix de cleanup.

## Confianza

**Alta** — 6/6 afirmaciones clave verificadas con observación directa; ancla `observation`+`sources`. La parte con menor certeza es la magnitud exacta de la fuga (medible post-fix).

## Siguiente paso para subir certeza (10 min)

Heap snapshot del proceso vivo (`node --inspect` / `pm2 monit` + `take_heapsnapshot`) para confirmar qué retiene memoria (sockets Baileys vs store de mensajes) antes de tocar `--max-old-space-size`.

---

# PLAN DE IMPLEMENTACIÓN PARA ALBOR

> **Para el agente que ejecuta (Albor).** Trabaja TODO en el Beelink. NADA se despliega ni se escribe a DB sin confirmación explícita de Victor.

## ESTADO DE IMPLEMENTACIÓN (actualizado 2026-05-29, rama `fix/whatsapp-gateway-stability`)

| Tarea | Estado | Commit |
|-------|--------|--------|
| T1 — guard removeSuffixFromJid/formatJid | ✅ HECHO | `6b3399d` (+ test `utils.test.ts`) |
| T2 — gate verbosidad de logs (DEBUG_BAILEYS_PAYLOADS) | ✅ HECHO | `22a7db2` |
| T3 — clasificación 401 conflict + backoff capado | ✅ HECHO | `505dcac` |
| T8 — fix OOM: teardownSocket + removeAllListeners + timers | ✅ HECHO (código) | `505dcac` |
| T4 — ChannelMetricsService + channel_events (TTL) | ✅ HECHO | `f8ff7f1` |
| T5 — GET /health_check/channels | ✅ HECHO | `472611f` |
| T6 — ecosystem hardening (kill_timeout/min_uptime/max_restarts) | ✅ HECHO (código) | `9c798d6` |
| T7 — drop CallMeBot + Telegram Ghost | ✅ HECHO | `863f6a3` |
| T8.5 — max_memory_restart (red de seguridad OOM) | ✅ HECHO | `22ab98e` |
| T8.7 — TTL en WhatsAppEvents (bloat DB) | ✅ HECHO | `22ab98e` |
| **T8.6 — verificación heap snapshot (curativa)** | ⏳ PENDIENTE | requiere proceso vivo + Victor |
| **Baileys rc13 → evaluar upgrade (leaks #2090/#2104)** | ⏳ PENDIENTE | post heap-snapshot |
| **T0 — dedupe canal +56976282350 + re-pair QR** | ⏳ PENDIENTE | operación, requiere OK Victor |
| **pm2-logrotate install + flush 7.3GB** | ⏳ PENDIENTE | operación en Mac Julian, requiere OK Victor |
| **DEPLOY a Mac de Julian** | ⏳ PENDIENTE | requiere OK Victor |

`tsc --noEmit` pasa limpio en la rama. **Nada desplegado.** Lo que falta es: confirmar la cura del OOM con heap snapshot (T8 ataca una fuga REAL confirmada en código —listeners no removidos— pero hay que verificar que no haya otra fuente, p.ej. Baileys 7.0.0-rc13), el TTL de WhatsAppEvents, y las operaciones que requieren OK de Victor (dedupe, QR, logrotate, deploy).


## Setup (ya hecho)

- **Repo:** `~/Data/victor/notifications_for_fun` en el Beelink (`viktorjjf@192.168.1.82`).
- **Rama segura ya creada:** `fix/whatsapp-gateway-stability` (desde `f83274b` = producción). Trabaja en esa rama.
- **Runtime:** node v24 + pnpm 10 vía nvm (`export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh`).
- **Producción** = misma `main` `f83274b` en `ssh ssh-julian.legimus.ai:/Users/juliancuervo/Developer/TodofullServer/notifications_for_fun` (alcanzable desde el Beelink).
- **Auth NO es file-based:** está en Mongo (`WhatsAppAuthState`). No migrar.
- **NO tocar** los cambios sin commitear de producción (ecosystem.config.js, physicalphone, TelegramGhost) — son ajenos a esta tarea.

## Reglas duras

1. **DB writes** (dedupe de canales, invalidar auth) → SOLO con confirmación de Victor. Dejar listo el script, no ejecutarlo.
2. **Deploy / pm2 restart en Mac de Julian** → SOLO con confirmación de Victor.
3. Verificar con `tsc --noEmit` + tests en Beelink ANTES de proponer deploy.
4. Commits atómicos por tarea, formato `<type>: <summary>`. NO Co-Authored-By.

## Tareas (en orden, commits separados)

### T1 — Fix `removeSuffixFromJid` + `formatJid` (P0, trivial) · `src/helpers/utils.ts`
Ambas funciones hacen `jid.includes(...)` y crashean con `jid` undefined (850 TypeError / 292 unhandledRejections). Llamadas desde el handler de message-status (`WhatsAppService.ts:1502,1516`).
```ts
// línea ~151 formatJid:
const formatJid = (jid: string): string => {
  if (!jid || typeof jid !== 'string') return jid;        // WHY: status updates traen `to` undefined
  // ...resto igual
};
// línea ~172 removeSuffixFromJid:
const removeSuffixFromJid = (jid: string): string => {
  if (!jid || typeof jid !== 'string') return jid ?? '';  // WHY: idem, no crashear el webhook de acks
  // ...resto igual
};
```
**Verificar:** test unitario `removeSuffixFromJid(undefined|null|'')` no lanza.

### T2 — Gating de verbosidad de logs (P0, causa del out.log de 7.3GB) · `src/services/WhatsAppService.ts`
`grep -n "JSON.stringify" src/services/WhatsAppService.ts` y `grep -n "console.log" src/services/WhatsAppService.ts | grep -i "payload\|message\|📥\|raw"`. Los `console.log` que vuelcan el JSON completo del mensaje/evento entrante (handleIncomingMessages y el `📴 disconnect raw` en :730) deben gatearse:
```ts
if (process.env.DEBUG_BAILEYS_PAYLOADS === 'true') {
  console.log(`📥 ${channelId} raw payload:`, JSON.stringify(payload));
}
```
Dejar SIEMPRE solo una línea estructurada: `channelId event messageId from statusCode`. No borrar el `📴 ... statusCode= reason= message=` de :728 (es la línea diagnóstica buena).

### T3 — Clasificación de 401 + backoff capado (P1, CORE) · `src/services/WhatsAppService.ts`
**Problema:** `handleConnectionUpdate` (línea ~741) mete TODO 401 y 440 en `logged_out` permanente. Pero un 401 con message `conflict`/`replaced`/`Connection Failure` es recuperable (creds válidas).
- Agregar mapa de intentos en la clase (junto a :228): `private reconnectAttempts: Map<string, number> = new Map();`
- Agregar consts a `src/config/healthCheck.config.ts`: `export const MAX_CONFLICT_RECONNECTS = 5;` y `export const CONFLICT_BACKOFF_MS = [15000, 30000, 60000, 120000, 300000];`
- Reemplazar el bloque `const shouldReconnect = ...` (líneas ~741-779) por clasificación de 3 vías:
  ```ts
  const msg = (disconnectMessage || '').toLowerCase();
  const isConflict =
    disconnectStatusCode === DisconnectReason.connectionReplaced ||   // 440
    (disconnectStatusCode === DisconnectReason.loggedOut &&            // 401 recuperable
      /(conflict|replaced|connection failure)/.test(msg) &&
      !/device_removed/.test(msg));
  const isTerminal =
    /device_removed/.test(msg) ||
    disconnectStatusCode === 403 ||                                    // forbidden
    disconnectStatusCode === DisconnectReason.badSession ||            // 500
    (disconnectStatusCode === DisconnectReason.loggedOut && !isConflict);

  if (isTerminal) {
    // marca logged_out + webhook (lógica actual del else), reset attempts
    this.reconnectAttempts.delete(channelId);
    // ...mantener bloque logged_out actual...
  } else if (isConflict) {
    const n = (this.reconnectAttempts.get(channelId) ?? 0);
    if (n >= MAX_CONFLICT_RECONNECTS) {
      // agotado: AHORA sí logged_out + webhook + reset
      this.reconnectAttempts.delete(channelId);
      // ...bloque logged_out...
    } else {
      this.reconnectAttempts.set(channelId, n + 1);
      const delay = CONFLICT_BACKOFF_MS[Math.min(n, CONFLICT_BACKOFF_MS.length - 1)];
      console.log(`🔁 ${channelId} conflict recuperable, intento ${n + 1}/${MAX_CONFLICT_RECONNECTS} en ${delay}ms`);
      await this.updateChannelStatus(channelId, 'connecting');
      setTimeout(() => this.connectChannel(channelId, phoneNumber), delay);
    }
  } else {
    // transitorio (428/408/503/515): reconnect 5s como hoy
    await this.updateChannelStatus(channelId, 'connecting');
    setTimeout(() => this.connectChannel(channelId, phoneNumber), 5000);
  }
  ```
- En el handler de `connection === 'open'` (línea ~782) agregar `this.reconnectAttempts.delete(channelId);` (resetear al reconectar OK).
- `connectChannel` ya cierra el socket viejo antes de reconectar (líneas 505-511) — bien, no duplicar. Verificar que `resetSocketConnection` realmente libera listeners (chequear fuga: `sock.ev.removeAllListeners()` / `sock.ws?.close()`), esto ataca el OOM.
**Riesgo:** si es ban real de WhatsApp, el cap de 5 evita loop infinito. NO bajar el cap a 0.

### T8 — Fix del OOM de heap (`JavaScript heap out of memory`) [P0 · CAUSA RAÍZ de los 143 restarts]

**Evidencia:** `FATAL ERROR: Reached heap limit Allocation failed` ≥12 veces; límite V8 en `--max-old-space-size=6144` (6GB); `Closing open session in favor of incoming prekey bundle` **1894 veces** (churn de sockets). Los restarts NO son por el bug de T1 (uptime 17h, handlers no hacen `process.exit`) — son **OOM por fuga de memoria en el ciclo de reconexión**.

**Causa raíz confirmada en código:** `resetSocketConnection` (`WhatsAppService.ts:1961-2006`) hace `sock.end(undefined)` pero **NUNCA** llama `sock.ev.removeAllListeners()`. Y el handler de `connection === 'close'` (`:739`) solo hace `this.connections.delete(channelId)` — **no tumba los listeners del socket muerto**. Cada `connectChannel` (`:578-590`) registra listeners (`connection.update`, `creds.update`, `messages.upsert`, `messages.update`, etc.) cuyos closures capturan `this` (todo el `WhatsAppService`), `auth.creds` (Map de claves Signal que crece) y el `sock`. Al reconectar sin remover listeners, **cada socket viejo + su EventEmitter + su Map de auth + buffers quedan vivos**. 1894 reconexiones × N listeners × Map de Signal = heap a 6GB → OOM → restart no-graceful → `<conflict replaced>` → más reconexión. Ciclo cerrado.

**Fix (en este orden):**

**8.1 — Helper de teardown completo** (nuevo método privado en `WhatsAppService`):
```ts
/**
 * Tear down a socket COMPLETELY so V8 can GC it. Just calling sock.end() leaves
 * the event listeners (which capture `this`, auth.creds Signal-key Map, and the
 * socket) reachable → leak across 1000s of reconnects → heap OOM. Always go
 * through here when discarding a socket.
 */
private teardownSocket(channelId: string, sock?: WASocket): void {
  const target = sock ?? this.connections.get(channelId);
  this.connections.delete(channelId);
  // clear any pending reconnect timer for this channel (ver 8.3)
  const timer = this.reconnectTimers.get(channelId);
  if (timer) { clearTimeout(timer); this.reconnectTimers.delete(channelId); }
  if (!target) return;
  try { target.ev.removeAllListeners(); } catch (e) { /* noop */ } // <-- CRÍTICO: corta los closures
  try { target.ws?.close(); } catch (e) { /* noop */ }
  try { target.end(undefined); } catch (e) { /* noop */ }
}
```

**8.2 — Usar el helper en los 3 puntos de descarte de socket:**
- `resetSocketConnection` (`:1967-1985`): reemplazar el bloque `sock.end(undefined)` por `this.teardownSocket(channelId, sock);` (mantener los logs y el `updateChannelStatus('reset')`).
- `handleConnectionUpdate`, rama `connection === 'close'` (`:739`): cambiar `this.connections.delete(channelId);` por `const deadSock = this.connections.get(channelId); this.teardownSocket(channelId, deadSock);` ANTES de decidir reconexión. El socket ya disparó 'close', pero sus listeners siguen referenciados — hay que removerlos explícitamente.
- `disconnectChannel` (`:2015-2038`): tras `sock.logout()`, llamar `this.teardownSocket(channelId, sock)` en vez de solo `connections.delete`.

**8.3 — Eliminar timers de reconexión apilados** (otra fuente de sockets paralelos = más fuga + más conflict):
- Agregar a la clase (junto a `:228`): `private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();`
- Donde se hace `setTimeout(() => this.connectChannel(...), delay)` (en T3 y en `:749`): guardar el handle → `const t = setTimeout(...); this.reconnectTimers.set(channelId, t);` y SIEMPRE `clearTimeout` el anterior antes de agendar uno nuevo (ya lo hace `teardownSocket`). En `connection === 'open'`: `clearTimeout` + `reconnectTimers.delete(channelId)`.

**8.4 — Capturar señales de fuga a nivel proceso** (`src/index.ts`, junto a los handlers `:34-43`):
```ts
process.on('warning', (w) => {
  // MaxListenersExceededWarning es señal directa de listener leak
  console.warn(`⚠️ process warning: ${w.name} — ${w.message}`);
});
```

**8.5 — Observabilidad de memoria** (integrar con T4/T5): loguear cada 5 min `process.memoryUsage().rss/heapUsed` + nº de sockets vivos (`this.connections.size`) en una línea, y exponerlo en `GET /health/channels`. Alertar si `heapUsed > 4.5GB` (antes del OOM a 6GB) con evento `oom_risk`.

**8.6 — Verificación empírica del fix (heap snapshots, en Mac de Julian con confirmación):**
```bash
# 1) PID del proceso
pm2 pid notifications_bot
# 2) mandar señal para abrir el inspector en el proceso vivo (node soporta SIGUSR1)
kill -USR1 <pid>            # abre inspector en 127.0.0.1:9229
# 3) túnel SSH desde tu máquina:  ssh -L 9229:127.0.0.1:9229 ssh-julian.legimus.ai
# 4) Chrome → chrome://inspect → tomar Heap Snapshot, esperar ~30min, tomar otro, COMPARAR (Comparison view)
#    Buscar retención creciente de: WASocket, EventEmitter/Listener, Uint8Array/Buffer (claves Signal), Boom.
```
Criterio de éxito: tras 8.1-8.3, con tráfico/reconexiones por 1-2h, `heapUsed` se estabiliza (no crece monótono) y `this.connections.size` == nº de canales activos (no crece). **Si se estabiliza → NO subir `--max-old-space-size`; el 6GB queda como red de seguridad.**

**8.7 — Bloat de DB (relacionado, no heap pero mismo origen):** `WhatsAppEvents` persiste el payload completo de CADA mensaje entrante sin TTL → crece sin límite. Agregar índice TTL (ej. 90d) en `src/models/WhatsAppEvents.ts`: `schema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 })`. Flag para Victor: confirmar retención deseada antes de aplicar (no borra histórico viejo hasta que Mongo corra el TTL monitor).

**Riesgos T8:** (1) `removeAllListeners()` sobre un socket que aún está cerrando podría perder un evento 'close' tardío — mitigado porque ya marcamos estado y el reconnect es idempotente vía `teardownSocket`. (2) `ws?.close()` puede lanzar si ya está cerrado — envuelto en try/catch. (3) Si la fuga persiste tras el snapshot, el segundo sospechoso es el Map de `createMongoAuthState` (`:531`) reteniendo claves Signal por socket — revisar que no se cachee globalmente.

### T4 — Observabilidad / tracking (P1) · nuevos archivos
- **Modelo** `src/models/ChannelConnectionEvents.ts` (mongoose, espejo de `WhatsAppEvents.ts`): campos `channelId:String(index)`, `event:String` (`open|close|reconnect|logged_out|conflict`), `statusCode:Number`, `reason:String`, `message:String`, `attempt:Number`, `timestamps:true`. **Índice TTL:** `schema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 })` (30d). Registrar en `src/models/index.ts`.
- **Servicio** `src/services/ChannelMetricsService.ts` (singleton): `Map<channelId, { status, lastStatusCode, lastReason, reconnectCount, connectedSince, lastDisconnectAt }>` en memoria + `record(channelId, event, {statusCode, reason, message, attempt})` que actualiza memoria E inserta en `ChannelConnectionEvents` (fire-and-forget con catch). + `getSnapshot()`.
- **Cablear** en `handleConnectionUpdate`: llamar `channelMetrics.record(...)` en cada rama close/open/conflict.

### T5 — Endpoint `GET /health/channels` (P1) · `src/routes/api/health_check.ts` + `src/controllers/healthCheck.controller.ts`
Devuelve `channelMetrics.getSnapshot()` + proceso: `process.uptime()`, `process.memoryUsage().rss`, `restartCount` (leer de pm2 no; exponer solo uptime+mem). Sin auth o con la misma que el health existente.

### T6 — Tuning PM2 + rotación de logs (P0 operación, requiere confirmación) · `ecosystem.config.js`
- En la app: agregar `kill_timeout: 30000`, `min_uptime: 10000`, `max_restarts: 15`. (PM2 manda SIGINT primero — `index.ts` ya escucha SIGINT+SIGTERM ✔.)
- **En Mac de Julian (confirmar con Victor):**
  ```bash
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 50M
  pm2 set pm2-logrotate:retain 14
  pm2 set pm2-logrotate:compress true
  pm2 set pm2-logrotate:workerInterval 30
  pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
  pm2 flush notifications_bot   # vacía el out.log de 7.3GB
  ```
- El OOM real lo ataca T3 (menos churn de sockets). NO subir `--max-old-space-size`; primero medir con heap snapshot.

### T7 — Reemplazar CallMeBot (P2) · `src/config/alertRecipients.config.ts` + cron
CallMeBot devuelve "Account Paused". Cambiar transporte de alertas críticas a Telegram/webhook propio. Eventos: `logged_out_real`, `duplicate_detected`, `reconnect_exhausted`, `oom_restart_spike`.

### T0 — Operación manual (requiere confirmación de Victor, NO auto-ejecutar)
- **Dedupe:** `+56976282350` tiene 2 channelId. Identificar canónico (`Channel.find({...})`), desactivar duplicado e invalidar su `WhatsAppAuthState`. Dejar script `scripts/dedupeChannels.js` en dry-run.
- **Re-vincular por QR** los caídos: `+56941174851` (5af90a60), `+51922034115` (86251e87), `+56976282350` (339d182f / 1d75377d).

## Verificación (Beelink, antes de proponer deploy)
```bash
cd ~/Data/victor/notifications_for_fun
pnpm install
npx tsc --noEmit                 # debe pasar
pnpm test                        # + tests nuevos de T1 y T3
```

## Deploy (Mac de Julian — SOLO con "sí, deployá" de Victor)
```bash
# merge rama → main, push; en Julian:
ssh ssh-julian.legimus.ai
cd /Users/juliancuervo/Developer/TodofullServer/notifications_for_fun
git stash   # cuidado: hay cambios locales ajenos sin commitear
git pull && pnpm install
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
pm2 restart notifications_bot    # el graceful shutdown libera el device-slot
```
Tras deploy: vigilar `GET /health/channels` y `channel_events` — un canal en conflict debe auto-recuperarse sin QR (eso valida T3).

