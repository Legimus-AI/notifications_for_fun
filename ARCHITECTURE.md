# 📐 Arquitectura del Proyecto - Patrón Adapter

## 🗂️ Estructura de Carpetas

```
src/
├── adapters/                              # Adapters para el patrón Adapter
│   ├── SlackNotificationAdapter.ts       # Adapta SlackService a INotificationProvider
│   └── WhatsAppNotificationAdapter.ts    # Adapta WhatsAppService a INotificationProvider
│
├── factories/                             # Factories para crear objetos
│   └── NotificationServiceFactory.ts     # Crea adapters según el tipo de provider
│
├── services/
│   ├── api/                               # Services internos del proyecto
│   │   ├── notifications.service.ts      # Lógica de negocio para notificaciones
│   │   ├── FileCleanupService.ts         # Limpieza de archivos
│   │   └── SocketService.ts              # WebSocket service
│   │
│   ├── SlackService.ts                    # API externa de Slack
│   └── WhatsAppService.ts                 # API externa de WhatsApp
│
├── controllers/
│   ├── notifications.controller.ts        # Controller para notificaciones
│   └── slack.controller.ts                # Controller para Slack
│
├── routes/api/
│   ├── notifications.ts                   # Rutas unificadas de notificaciones
│   └── slack.ts                           # Rutas directas de Slack
│
└── interfaces/
    └── INotificationProvider.ts           # Interface común para todos los adapters
```

## 🎯 Separación de Responsabilidades

| Carpeta | Propósito | Ejemplo |
|---------|-----------|---------|
| **`services/`** (raíz) | APIs externas (third-party) | SlackService, WhatsAppService |
| **`services/api/`** | Services internos del proyecto | NotificationsService, SocketService |
| **`adapters/`** | Adaptación de interfaces | SlackNotificationAdapter |
| **`factories/`** | Creación de objetos | NotificationServiceFactory |
| **`controllers/`** | Lógica de endpoints | NotificationsController |
| **`routes/`** | Definición de rutas | notifications.ts |

## 🔄 Flujo de la Aplicación

### Envío de Notificación

```
1. Request → /api/notifications/send
           ↓
2. Route → notifications.ts
           ↓
3. Controller → notificationsController.send()
           ↓
4. Service → notificationsService.sendNotification()
           ↓
5. Factory → NotificationServiceFactory.createAdapter('slack')
           ↓
6. Adapter → SlackNotificationAdapter.send()
           ↓
7. External API → SlackService
```

## 📝 Componentes Principales

### 1. INotificationProvider (Interface)
```typescript
interface INotificationProvider {
  send(channelId: string, recipient: string, message: string, options?: any): Promise<any>;
  getProviderType(): string;
}
```

### 2. NotificationsService (Internal Service)
- **Ubicación**: `src/services/api/notifications.service.ts`
- **Responsabilidad**: Lógica de negocio para enviar notificaciones
- **Métodos**:
  - `sendNotification()` - Envía una notificación
  - `sendMultipleNotifications()` - Envía múltiples notificaciones

### 3. NotificationsController (Controller)
- **Ubicación**: `src/controllers/notifications.controller.ts`
- **Responsabilidad**: Manejar requests HTTP y respuestas
- **Métodos**:
  - `send()` - POST /api/notifications/send
  - `sendMulti()` - POST /api/notifications/send-multi

### 4. Adapters (Adapter Pattern)
- **SlackNotificationAdapter**: Adapta SlackService a INotificationProvider
- **WhatsAppNotificationAdapter**: Adapta WhatsAppService a INotificationProvider

### 5. Factory (Factory Pattern)
- **NotificationServiceFactory**: Crea el adapter apropiado según el tipo de provider

## 🚀 Uso

### Enviar Notificación por Slack
```bash
curl -X POST http://localhost:4500/api/notifications/send \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "slack",
    "channelId": "channel-id",
    "recipient": "C09QDCWC8NL",
    "message": "Hello from Slack!",
    "options": {
      "blocks": [...]
    }
  }'
```

### Enviar Notificación por WhatsApp
```bash
curl -X POST http://localhost:4500/api/notifications/send \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "whatsapp",
    "channelId": "channel-id",
    "recipient": "1234567890",
    "message": "Hello from WhatsApp!"
  }'
```

### Enviar a Múltiples Providers
```bash
curl -X POST http://localhost:4500/api/notifications/send-multi \
  -H 'Content-Type: application/json' \
  -d '{
    "notifications": [
      {
        "provider": "slack",
        "channelId": "slack-channel-id",
        "recipient": "C09QDCWC8NL",
        "message": "Alert message"
      },
      {
        "provider": "whatsapp",
        "channelId": "whatsapp-channel-id",
        "recipient": "1234567890",
        "message": "Alert message"
      }
    ]
  }'
```

## ✨ Ventajas de esta Arquitectura

1. **Separación Clara**: Services externos vs internos
2. **Escalable**: Fácil agregar nuevos providers (Email, SMS, etc.)
3. **Mantenible**: Cada componente tiene una responsabilidad única
4. **Testeable**: Fácil hacer mock de services y adapters
5. **Reutilizable**: Adapters y factory pueden usarse en otros contextos
6. **Limpia**: Controller → Service → Adapter → External API

## 🔧 Agregar Nuevo Provider (Ejemplo: Email)

### 1. Crear el Service Externo
```typescript
// src/services/EmailService.ts
export class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    // Implementación con API externa
  }
}
```

### 2. Crear el Adapter
```typescript
// src/adapters/EmailNotificationAdapter.ts
export class EmailNotificationAdapter implements INotificationProvider {
  async send(channelId: string, recipient: string, message: string, options?: any) {
    // Adaptar parámetros y llamar EmailService
  }
  
  getProviderType() {
    return 'email';
  }
}
```

### 3. Registrar en Factory
```typescript
// src/factories/NotificationServiceFactory.ts
case 'email':
  return new EmailNotificationAdapter();
```

### 4. ¡Listo! Ya puedes usar:
```bash
curl -X POST .../send -d '{"provider": "email", ...}'
```

## 📊 Patrones Utilizados

1. **Adapter Pattern**: Adaptadores unifican interfaces de diferentes APIs
2. **Factory Pattern**: Factory crea los adapters apropiados
3. **MVC Pattern**: Controllers, Services, Routes
4. **Singleton Pattern**: Services exportados como instancias únicas
5. **Dependency Injection**: Controllers usan services inyectados
