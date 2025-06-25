import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
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
import { SocketService } from './services/SocketService';
import { whatsAppService } from './services/WhatsAppService';

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
    version: '1.0.0',
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
  // Register API routes
  app.use('/api', routes);

  // =================================================================
  // ✨ NEW: Express Error Handling Middleware (must be after routes)
  // =================================================================

  // Handle 404 - Not Found
  // This middleware is triggered when no other route matches
  app.use((req, res, next) => {
    const error: any = new Error(
      'Not Found - The requested resource does not exist.',
    );
    error.status = 404;
    next(error);
  });

  // Global Express Error Handler
  // This middleware catches all errors passed by `next(error)`
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Log the error for debugging purposes
    console.error(err);

    // Set a default status code if one isn't already set on the error
    const statusCode = err.status || 500;

    // Send a structured error response
    res.status(statusCode).json({
      error: {
        message: err.message || 'An unexpected internal server error occurred.',
        // Optionally include the stack trace in development environment for easier debugging
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      },
    });
  });
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
      console.log(`📱 WhatsApp service ready`);
      console.log(
        `🔌 Socket.io server ready on ws://localhost:${port}/socket.io/`,
      );
    });

    // Restore active WhatsApp channels
    console.log('🔄 Restoring active WhatsApp channels...');
    await whatsAppService.restoreActiveChannels();
    console.log('✅ WhatsApp channels restoration completed');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app; // for testing
export { socketService };
