# START PROJECT

Multi-channel notification service for Slack, Telegram, and WhatsApp/Baileys.

## Agent Docs

- [WhatsApp Baileys capability map](docs/WHATSAPP_BAILEYS_CAPABILITIES.md) - native elements, rich cards, commerce, payments, status/channel findings, and raw proto experiments.
- [WhatsApp integration](WHATSAPP_INTEGRATION.md) - channel setup, QR/pairing, socket events, and REST endpoints.
- [Notification API guide](NOTIFICATION_API_GUIDE.md) - unified notification endpoint examples.
- [WhatsApp health check](docs/WHATSAPP_HEALTH_CHECK.md) - operational health checks.

Agents working on WhatsApp experiments must read `docs/WHATSAPP_BAILEYS_CAPABILITIES.md` before sending new element types.

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
