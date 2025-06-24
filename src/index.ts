import 'dotenv/config';
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
import { SocketService } from './services/SocketService';
import { whatsAppService } from './services/WhatsAppService';

const app = express();

// app.use((req: Request, res: Response, next: NextFunction) => {
//   console.log("🐞 LOG HERE req:", req);

//   // If there's an error in the request
//   if (req.error) {
//     return res.status(req.error.status || 422).json({ errors: req.error.array() });
//   }

//   // Other logic can be added here

//   // Continue to the next middleware or route handler
//   next();
// });

// Setup express server port from ENV, default: 3000
app.set('port', process.env.PORT || 3000);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Enable only in development HTTP request logger middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// for parsing json
// app.use(
//   bodyParser.json({
//     limit: '100mb',
//   }),
// );

app.use(express.json());
// for parsing application/x-www-form-urlencoded
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
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io service
let socketService: SocketService;

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

    // Restore active WhatsApp channels
    console.log('🔄 Restoring active WhatsApp channels...');
    await whatsAppService.restoreActiveChannels();
    console.log('✅ WhatsApp channels restoration completed');

    // Start HTTP server
    const port = app.get('port');
    httpServer.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📱 WhatsApp service ready`);
      console.log(
        `🔌 Socket.io server ready on ws://localhost:${port}/socket.io/`,
      );
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n📥 Received ${signal}. Starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        httpServer.close(() => {
          console.log('🔌 HTTP server closed');
        });

        // Cleanup WhatsApp connections
        await whatsAppService.cleanup();
        console.log('📱 WhatsApp service cleaned up');

        // Cleanup Socket.io connections
        if (socketService) {
          await socketService.cleanup();
          console.log('🔌 Socket.io service cleaned up');
        }

        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app; // for testing
export { socketService };
