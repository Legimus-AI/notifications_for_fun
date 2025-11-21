import dotenv from 'dotenv-safe';
dotenv.config();
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import passport from 'passport';
import { loadRoutes } from './routes/api';
import i18n from 'i18n';
import initMongo from './config/mongo';
import path from 'path';
import { createServer } from 'http';
import { SocketService } from './services/api/SocketService';
import { whatsAppService } from './services/WhatsAppService';
import { slackService } from './services/SlackService';
import { telegramService } from './services/TelegramService';
import { telegramPhonesService } from './services/TelegramPhonesService';
import { fileCleanupService } from './services/api/FileCleanupService';
import {
  startWhatsAppHealthCheck,
  stopWhatsAppHealthCheck,
} from './cronjobs/WhatsAppHealthCheckCron';

// =================================================================
// ✨ NEW: Global Error Handlers for Uncaught Exceptions and Rejections
// =================================================================

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
  // It's often recommended to gracefully shut down in such cases
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // This is a critical error. The process is in an undefined state.
  // It's not safe to continue. Perform synchronous cleanup and then shut down.
  process.exit(1);
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop file cleanup service
  console.log('🛑 Stopping file cleanup service...');
  fileCleanupService.stop();

  // Stop WhatsApp health check cron
  console.log('🛑 Stopping WhatsApp health check cron...');
  stopWhatsAppHealthCheck();

  // Close HTTP server
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error(
      '❌ Could not close connections in time, forcefully shutting down',
    );
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const app = express();

// Setup express server port from ENV, default: 3000
app.set('port', process.env.PORT || 3000);

app.get('/', (req: express.Request, res: express.Response) => {
  res.send('Hello World!');
});

app.get('/health', (req: express.Request, res: express.Response) => {
  res.status(200).json({
    ok: true,
    message: 'OK',
    version: '1.0.1',
  });
});

// Enable only in development HTTP request logger middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// For parsing json
app.use(express.json({ limit: '100mb' }));

// For parsing application/x-www-form-urlencoded
app.use(
  bodyParser.urlencoded({
    limit: '100mb',
    extended: true,
  }),
);

// i18n
i18n.configure({
  locales: ['en', 'es'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'en',
  objectNotation: true,
});
app.use(i18n.init);

// Init all other stuff
app.use(cors());
app.use(passport.initialize());
app.use(compression());
app.use(helmet());
app.use(express.static('public'));
app.use('/storage', express.static(path.join(__dirname, '../storage')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io service
let socketService: SocketService;

// Load routes and then register error handlers
loadRoutes().then((routes) => {
  app.use('/api', routes);
});

const startServer = async () => {
  try {
    // Init MongoDB
    console.log('🔄 Initializing MongoDB connection...');
    await initMongo();
    console.log('✅ MongoDB connected successfully');

    // Initialize Socket.io service
    console.log('🔄 Initializing Socket.io service...');
    socketService = new SocketService(httpServer);
    console.log('✅ Socket.io service initialized');

    // Start HTTP server
    const port = app.get('port');
    httpServer.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV}`);
      console.log(`📱 WhatsApp service ready`);
      console.log(`💬 Slack service ready`);
      console.log(`📲 Telegram service ready`);
      console.log(`📞 Telegram Phones service ready`);
      console.log(
        `🔌 Socket.io server ready on ws:// ${process.env.BACKEND_DOMAIN}:${port}/socket.io/`,
      );
    });

    // Restore active WhatsApp channels
    console.log('🔄 Restoring active WhatsApp channels...');
    if (process.env.NODE_ENV === 'production') {
      await whatsAppService.restoreActiveChannels();
    }
    console.log('✅ WhatsApp channels restoration completed');

    // Restore active Slack channels
    console.log('🔄 Restoring active Slack channels...');
    if (process.env.NODE_ENV === 'production') {
      await slackService.restoreActiveChannels();
    }
    console.log('✅ Slack channels restoration completed');

    // Restore active Telegram channels
    console.log('🔄 Restoring active Telegram channels...');
    if (process.env.NODE_ENV === 'production') {
      await telegramService.restoreActiveChannels();
    }
    console.log('✅ Telegram channels restoration completed');

    // Restore active Telegram Phones channels
    console.log('🔄 Restoring active Telegram Phones channels...');
    if (process.env.NODE_ENV === 'production') {
      await telegramPhonesService.restoreActiveChannels();
    }
    console.log('✅ Telegram Phones channels restoration completed');

    // Start file cleanup service
    console.log('🔄 Starting file cleanup service...');
    fileCleanupService.start();
    console.log('✅ File cleanup service started');

    // Start WhatsApp health check cron (production only)
    if (process.env.NODE_ENV === 'production') {
    console.log('🔄 Starting WhatsApp health check cron...');
    startWhatsAppHealthCheck();
    console.log('✅ WhatsApp health check cron started');
    } else {
      console.log(
        '⏭️ WhatsApp health check cron skipped (not in production)',
      );
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app; // for testing
export { socketService };
