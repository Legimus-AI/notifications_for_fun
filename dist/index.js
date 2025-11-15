"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketService = void 0;
const dotenv_safe_1 = __importDefault(require("dotenv-safe"));
dotenv_safe_1.default.config();
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const passport_1 = __importDefault(require("passport"));
const api_1 = require("./routes/api");
const i18n_1 = __importDefault(require("i18n"));
const mongo_1 = __importDefault(require("./config/mongo"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const SocketService_1 = require("./services/api/SocketService");
const WhatsAppService_1 = require("./services/WhatsAppService");
const SlackService_1 = require("./services/SlackService");
const TelegramService_1 = require("./services/TelegramService");
const TelegramPhonesService_1 = require("./services/TelegramPhonesService");
const FileCleanupService_1 = require("./services/api/FileCleanupService");
const WhatsAppHealthCheckCron_1 = require("./cronjobs/WhatsAppHealthCheckCron");
console.log('Env variables:', process.env);
console.log('Env variables:', process.env.DOMAIN);
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
const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    // Stop file cleanup service
    console.log('🛑 Stopping file cleanup service...');
    FileCleanupService_1.fileCleanupService.stop();
    // Stop WhatsApp health check cron
    console.log('🛑 Stopping WhatsApp health check cron...');
    (0, WhatsAppHealthCheckCron_1.stopWhatsAppHealthCheck)();
    // Close HTTP server
    httpServer.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('❌ Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};
// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
const app = (0, express_1.default)();
// Setup express server port from ENV, default: 3000
app.set('port', process.env.PORT || 3000);
app.get('/', (req, res) => {
    res.send('Hello World!');
});
app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        message: 'OK',
        version: '1.0.1',
    });
});
// Enable only in development HTTP request logger middleware
if (process.env.NODE_ENV === 'development') {
    app.use((0, morgan_1.default)('dev'));
}
// For parsing json
app.use(express_1.default.json({ limit: '100mb' }));
// For parsing application/x-www-form-urlencoded
app.use(body_parser_1.default.urlencoded({
    limit: '100mb',
    extended: true,
}));
// i18n
i18n_1.default.configure({
    locales: ['en', 'es'],
    directory: path_1.default.join(__dirname, 'locales'),
    defaultLocale: 'en',
    objectNotation: true,
});
app.use(i18n_1.default.init);
// Init all other stuff
app.use((0, cors_1.default)());
app.use(passport_1.default.initialize());
app.use((0, compression_1.default)());
app.use((0, helmet_1.default)());
app.use(express_1.default.static('public'));
app.use('/storage', express_1.default.static(path_1.default.join(__dirname, '../storage')));
app.set('views', path_1.default.join(__dirname, 'views'));
app.set('view engine', 'html');
// Create HTTP server
const httpServer = (0, http_1.createServer)(app);
// Initialize Socket.io service
let socketService;
// Load routes and then register error handlers
(0, api_1.loadRoutes)().then((routes) => {
    app.use('/api', routes);
});
const startServer = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Init MongoDB
        console.log('🔄 Initializing MongoDB connection...');
        yield (0, mongo_1.default)();
        console.log('✅ MongoDB connected successfully');
        // Initialize Socket.io service
        console.log('🔄 Initializing Socket.io service...');
        exports.socketService = socketService = new SocketService_1.SocketService(httpServer);
        console.log('✅ Socket.io service initialized');
        // Start HTTP server
        const port = app.get('port');
        httpServer.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`📱 WhatsApp service ready`);
            console.log(`💬 Slack service ready`);
            console.log(`📲 Telegram service ready`);
            console.log(`📞 Telegram Phones service ready`);
            console.log(`🔌 Socket.io server ready on ws:// ${process.env.BACKEND_DOMAIN}:${port}/socket.io/`);
        });
        // Restore active WhatsApp channels
        console.log('🔄 Restoring active WhatsApp channels...');
        if (process.env.NODE_ENV === 'production') {
            yield WhatsAppService_1.whatsAppService.restoreActiveChannels();
        }
        console.log('✅ WhatsApp channels restoration completed');
        // Restore active Slack channels
        console.log('🔄 Restoring active Slack channels...');
        if (process.env.NODE_ENV === 'production') {
            yield SlackService_1.slackService.restoreActiveChannels();
        }
        console.log('✅ Slack channels restoration completed');
        // Restore active Telegram channels
        console.log('🔄 Restoring active Telegram channels...');
        if (process.env.NODE_ENV === 'production') {
            yield TelegramService_1.telegramService.restoreActiveChannels();
        }
        console.log('✅ Telegram channels restoration completed');
        // Restore active Telegram Phones channels
        console.log('🔄 Restoring active Telegram Phones channels...');
        if (process.env.NODE_ENV === 'production') {
            yield TelegramPhonesService_1.telegramPhonesService.restoreActiveChannels();
        }
        console.log('✅ Telegram Phones channels restoration completed');
        // Start file cleanup service
        console.log('🔄 Starting file cleanup service...');
        FileCleanupService_1.fileCleanupService.start();
        console.log('✅ File cleanup service started');
        // Start WhatsApp health check cron
        console.log('🔄 Starting WhatsApp health check cron...');
        (0, WhatsAppHealthCheckCron_1.startWhatsAppHealthCheck)();
        console.log('✅ WhatsApp health check cron started');
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
});
// Start the server
startServer();
exports.default = app; // for testing
//# sourceMappingURL=index.js.map