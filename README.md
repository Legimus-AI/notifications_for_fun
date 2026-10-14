# START PROJECT

Multi-channel notification service for Slack, Telegram, and WhatsApp/Baileys.

## Agent Docs

- [WhatsApp Baileys capability map](docs/WHATSAPP_BAILEYS_CAPABILITIES.md) - native elements, rich cards, commerce, payments, status/channel findings, and raw proto experiments.
- [WhatsApp integration](WHATSAPP_INTEGRATION.md) - channel setup, QR/pairing, socket events, and REST endpoints.
- [Notification API guide](NOTIFICATION_API_GUIDE.md) - unified notification endpoint examples.
- [WhatsApp health check](docs/WHATSAPP_HEALTH_CHECK.md) - operational health checks.

Agents working on WhatsApp experiments must read `docs/WHATSAPP_BAILEYS_CAPABILITIES.md` before sending new element types.

# DEPLOY (Beelink, PM2)

Production runs on the Beelink from `~/Data/victor/notifications_for_fun` as the PM2 app
`notifications_for_fun` (`ecosystem.config.js`, port 4500 → `api-notifications.legimus.ai`
via the `beelink-ser8` Cloudflare tunnel). ts-node compiles at boot, so merged code only goes
live after a PM2 restart.

```bash
cd ~/Data/victor/notifications_for_fun
git fetch origin
git status --short                                  # expect only src/services/api/SocketService.ts
git checkout -- src/services/api/SocketService.ts   # that hand-edited CORS list now ships in main
git switch main                                     # the folder still sits on wip/beelink-interactive-messages (already in main)
git merge --ff-only origin/main
npm install --no-audit --no-fund                    # sharp is now a direct dependency (same 0.34.5 Baileys already pulled)
pm2 restart notifications_for_fun                   # graceful (kill_timeout 30s); WhatsApp alerts pause for a few seconds
pm2 logs notifications_for_fun --lines 100 --nostream
curl -s localhost:4500/api/health_check/channels
```

The restart also activates every fix merged after the last boot (e.g. `9b18448`, the Mongo
pool leak on reconnect). If `git status` shows anything besides `SocketService.ts`, stop and
review it before discarding.

# COMMANDS TO RUN IN PRODUCTION
```
docker-compose -f docker-compose.prod.yml up -d --build
```

# ALSO COULD BE USEFUL

```
1. docker-compose -f docker-compose.prod.yml build
```

  ```
2. docker-compose -f docker-compose.prod.yml up -d
  ```
