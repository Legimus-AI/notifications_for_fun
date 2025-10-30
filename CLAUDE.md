# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-channel notification system built with Node.js, Express, TypeScript, and MongoDB. It supports sending notifications through multiple providers (currently Slack and WhatsApp) using an adapter pattern architecture. The system includes real-time capabilities via Socket.io, JWT authentication, and MongoDB for persistence.

## Core Commands

### Development
```bash
npm run dev              # Start development server with hot-reload
npm start                # Start production server
```

### Building
```bash
npm run build            # Compile TypeScript to JavaScript
npm run tsc              # Run TypeScript compiler directly
```

### Testing
```bash
npm run test             # Run all tests (unit + e2e) with coverage
npm run test:unit        # Run Jest unit tests only
npm run test:e2e         # Clean database, seed, and run Mocha e2e tests
npm run mocha            # Run Mocha tests directly
```

### Database Management
```bash
npm run fresh            # Clean and re-seed database
npm run clean            # Clean database using clean.js
```

### Code Quality
```bash
npm run lint             # Run ESLint with auto-fix
npm run prettier         # Format code with Prettier
```

## Architecture

### Adapter Pattern for Multi-Provider Notifications

The system uses the **Adapter Pattern** to provide a unified interface for different notification providers:

```
INotificationProvider (interface)
    ├── SlackNotificationAdapter → SlackService
    ├── WhatsAppNotificationAdapter → WhatsAppService
    └── [Future adapters: Email, SMS, etc.]

BaseNotificationService (uses INotificationProvider)
    ↑
NotificationServiceFactory (creates services with appropriate adapters)
```

**Key files:**
- `src/interfaces/INotificationProvider.ts` - Common interface for all providers
- `src/services/adapters/SlackNotificationAdapter.ts` - Slack adapter implementation
- `src/services/adapters/WhatsAppNotificationAdapter.ts` - WhatsApp adapter implementation
- `src/services/BaseNotificationService.ts` - Main service using adapters
- `src/services/NotificationServiceFactory.ts` - Factory for creating services

### WhatsApp Integration

Uses `@whiskeysockets/baileys` for WhatsApp Web API with production-grade features:

**Key components:**
- `src/services/WhatsAppService.ts` - Core WhatsApp service managing connections
- `src/models/WhatsAppAuthState.ts` - MongoDB-based auth state persistence
- `src/controllers/WhatsAppEvents.controller.ts` - HTTP endpoints for WhatsApp operations
- Socket.io events: `qr_code`, `pairing_code`, `connection_update`, `incoming_message`, `message_status_update`

**Connection states:** `inactive`, `connecting`, `qr_ready`, `pairing_code_ready`, `active`, `error`, `logged_out`

See `WHATSAPP_INTEGRATION.md` for detailed API documentation and usage examples.

### Slack Integration

Direct Slack API integration for sending messages:

**Key components:**
- `src/services/SlackService.ts` - Core Slack service
- Stores bot tokens in Channel model's config field
- Supports rich message formatting with blocks

### Unified Notification API

The system provides a unified REST API for sending notifications across providers:

**Endpoints:**
- `POST /api/notifications/send` - Send single notification
- `POST /api/notifications/send-multi` - Send to multiple providers

See `NOTIFICATION_ARCHITECTURE.md` for usage examples and how to add new providers.

## Project Structure

### Controllers (`src/controllers/`)
Controllers extend `BaseController` and use `BaseValidation` for input validation:
- `auth.controller.ts` - User authentication endpoints
- `channels.controller.ts` - Channel CRUD operations
- `WhatsAppEvents.controller.ts` - WhatsApp-specific operations
- `webhooks.controller.ts` - Webhook management
- `notificationLogs.controller.ts` - Notification history

### Routes (`src/routes/api/`)
All routes extend `BaseRouter` class for consistent structure:
- Routes loaded dynamically via `loadRoutes()` in `src/routes/api/index.ts`
- Path aliases configured with `@/*` for `./src/*` (see tsconfig.json)

### Models (`src/models/`)
Mongoose models with TypeScript interfaces:
- `Users.ts` - User accounts with bcrypt password hashing
- `Channels.ts` - Notification channels (WhatsApp, Slack, etc.)
- `WhatsAppAuthState.ts` - WhatsApp authentication persistence
- `NotificationLogs.ts` - Notification history tracking
- `Webhooks.ts` - Webhook configurations
- `ApiKeys.ts` - API key management

### Services (`src/services/`)
Business logic and external integrations:
- `WhatsAppService.ts` - WhatsApp connection and message handling
- `SlackService.ts` - Slack API integration
- `SocketService.ts` - Socket.io real-time events
- `FileCleanupService.ts` - Scheduled file cleanup with node-cron
- `BaseNotificationService.ts` - Unified notification interface
- `NotificationServiceFactory.ts` - Service factory pattern

## Key Technologies

- **TypeScript** with path aliases (`@/*` → `src/*`)
- **Express** with Passport-JWT authentication
- **MongoDB** with Mongoose ODM
- **Socket.io** for real-time communication
- **@whiskeysockets/baileys** for WhatsApp integration
- **i18n** for internationalization (en, es)
- **Redis** optional caching (USE_REDIS env variable)
- **Jest** for unit tests, **Mocha/Chai** for e2e tests

## Environment Setup

Copy `.env.example` to `.env` and configure:

**Required variables:**
- `PORT` - Server port (default: 3000)
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT token signing
- `FRONTEND_DOMAIN` - Frontend URL for CORS and Socket.io

**Optional:**
- `USE_REDIS` - Enable Redis caching (true/false)
- `REDIS_HOST`, `REDIS_PORT` - Redis configuration
- Email configuration for Mailgun

## Application Startup Sequence

When the server starts (`src/index.ts`):

1. Connect to MongoDB
2. Initialize Socket.io service
3. Start HTTP server
4. Restore active WhatsApp channels (production only)
5. Restore active Slack channels (production only)
6. Start file cleanup service (node-cron scheduled jobs)

Graceful shutdown handles SIGTERM/SIGINT to close connections properly.

## Authentication

- JWT-based authentication via Passport
- API keys for webhook and external integrations
- Tokens stored in Users model
- Protected routes use passport.authenticate('jwt') middleware

## Real-time Communication

Socket.io endpoints:
- Client authenticates with API key: `socket.emit('authenticate', { apiKey })`
- Subscribe to channels: `socket.emit('subscribe_channel', { channelId })`
- Events: `qr_code`, `pairing_code`, `connection_update`, `incoming_message`, `message_status_update`

## Testing Strategy

- **Unit tests** (Jest): Individual service/utility testing
- **E2E tests** (Mocha/Chai): Full API endpoint testing with database
- Coverage reports merged from both test suites
- Test database automatically seeded before e2e tests

## Docker Deployment

Production deployment uses Docker Compose:
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

## Adding New Notification Providers

1. Create adapter in `src/services/adapters/[Provider]NotificationAdapter.ts`
2. Implement `INotificationProvider` interface
3. Add provider service in `src/services/[Provider]Service.ts`
4. Register in `NotificationServiceFactory.ts` switch statement
5. Add provider type to Channel model enum

See `NOTIFICATION_ARCHITECTURE.md` for detailed examples.

## Important Notes

- WhatsApp auth state persists in MongoDB for production reliability
- LID (Linked Identity) support for WhatsApp contacts - maintain `@lid` suffix for unresolved IDs
- File cleanup service runs on cron schedule (see `src/services/FileCleanupService.ts`)
- Socket.io CORS configured via `FRONTEND_DOMAIN` environment variable
- TypeScript compilation required before running (`npm run build` or `npm run tsc`)
- Path aliases require `tsconfig-paths/register` for ts-node execution
