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

**Documentation:**
- `NOTIFICATION_API_GUIDE.md` - Complete API reference with curl examples for all providers
- `NOTIFICATION_ARCHITECTURE.md` - System architecture and how to add new providers

## Project Structure

### Base Classes Pattern

The codebase uses inheritance-based patterns for consistency:

**BaseController** (`src/controllers/BaseController.ts`):
- Provides CRUD operations: `listAll`, `list`, `listOne`, `create`, `update`, `delete`
- Automatic duplicate checking via `uniqueFields` constructor parameter
- All controllers extend this base class for consistent API behavior
- Uses helpers from `src/helpers/db.ts` for database operations

**BaseValidation** (`src/controllers/BaseValidation.ts`):
- Uses `express-validator` for request validation
- Default validations for CRUD operations
- Can be customized via `setCreate()`, `setUpdate()`, `setListOne()`, `setDelete()` methods
- Each controller has a `validation` property extending this class

**BaseRouter** (`src/routes/api/BaseRouter.ts`):
- Auto-generates RESTful routes for controllers
- Default auth: JWT + role check for SUPERADMIN/ADMIN
- Standard routes: `GET /all`, `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
- Auth middlewares customizable via `setAuthMiddlewares()`

### Dynamic Route Loading

Routes are auto-loaded from `src/routes/api/` directory:
- Each file exports a router and optional `basePath`
- `loadRoutes()` scans directory and mounts routes dynamically
- Convention: filename becomes route path (e.g., `users.ts` → `/api/users`)
- 404 handler automatically added for unknown routes

### Helpers (`src/helpers/`)

Utility modules for common operations:

**db.ts** - Database operations:
- `getItems()`, `getAllItems()`, `getItem()` - Retrieve with pagination support
- `createItem()`, `updateItem()`, `deleteItem()` - CRUD operations
- `checkQueryString()` - Query parameter validation and sanitization

**utils.ts** - General utilities:
- `handleError()` - Centralized error handling with status codes
- `isIDGood()` - Mongoose ObjectId validation
- `itemAlreadyExists()` - Duplicate checking helper
- `validationResultMiddleware()` - express-validator result processing
- Request helpers: `getIP()`, `getBrowserInfo()`, `getCountry()`

**auth.ts** - Authentication utilities used by controllers

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
- `WhatsAppService.ts` - WhatsApp connection and message handling (EventEmitter-based)
- `SlackService.ts` - Slack API integration
- `SocketService.ts` - Socket.io real-time events (authenticates clients with API keys)
- `FileCleanupService.ts` - Scheduled file cleanup (cron: every 12 hours, deletes files >12 hours old)
- `BaseNotificationService.ts` - Unified notification interface
- `NotificationServiceFactory.ts` - Service factory pattern

See `src/docs/FILE_CLEANUP.md` for file cleanup service API and configuration.

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

## Common Development Patterns

### Adding a New CRUD Controller

```typescript
// 1. Create controller extending BaseController
import BaseController from './BaseController';
import MyModel from '../models/MyModel';

class MyController extends BaseController {
  constructor() {
    super(MyModel, ['uniqueField1', 'uniqueField2']); // uniqueFields for duplicate checking
  }

  // Add custom methods if needed
  myCustomMethod = async (req, res) => {
    // Custom logic
  }
}

// 2. Create validation extending BaseValidation (optional customization)
import BaseValidation from './BaseValidation';
import { check } from 'express-validator';

class MyValidation extends BaseValidation {
  constructor() {
    super();
    this.setCreate([
      check('customField').exists().withMessage('Required'),
      // ... other validations
    ]);
  }
}

// 3. Create route using BaseRouter
import BaseRouter from './BaseRouter';
import controller from '../../controllers/my.controller';

const router = new BaseRouter(controller);
router.setupRoutes();

export default router.getRouter();
```

### Adding a New Notification Provider

1. Create adapter in `src/services/adapters/[Provider]NotificationAdapter.ts` implementing `INotificationProvider`
2. Create provider service in `src/services/[Provider]Service.ts` with provider-specific logic
3. Register in `NotificationServiceFactory.ts` switch statement
4. Add provider type to Channel model enum if needed

See `NOTIFICATION_ARCHITECTURE.md` for detailed examples.

## Important Notes

### WhatsApp Specifics
- Auth state persists in MongoDB for production reliability (separate collections for creds and keys)
- LID (Linked Identity) support for WhatsApp contacts - maintain `@lid` suffix for unresolved IDs
- Channel restoration happens only in production mode (see `src/index.ts` startup sequence)
- WhatsAppService extends EventEmitter for event-driven architecture
- Uses latest WhatsApp Web version to reduce ban risk

### Architecture Conventions
- Controllers automatically inject `userId` from JWT token into `req.body` (see BaseController create/update)
- Default role authorization: SUPERADMIN and ADMIN (customizable per route)
- All routes use `trim-request` middleware to sanitize inputs
- Error handling centralized in `src/helpers/utils.ts` with environment-aware logging

### Performance & Maintenance
- File cleanup service: runs every 12 hours, removes files >12 hours old from `storage/`
- Socket.io CORS configured via `FRONTEND_DOMAIN` environment variable
- Optional Redis caching via `USE_REDIS` environment variable
- Coverage reporting merges Jest (unit) and Mocha (e2e) results

### Development Requirements
- TypeScript compilation required before running (`npm run build` or `npm run tsc`)
- Path aliases (`@/*`) require `tsconfig-paths/register` for ts-node execution
- Database must be seeded before e2e tests (`npm run fresh` or `npm run test:e2e`)
- `postinstall` hook automatically runs TypeScript compilation after `npm install`
