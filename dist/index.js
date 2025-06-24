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
require("dotenv/config");
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
const SocketService_1 = require("./services/SocketService");
const WhatsAppService_1 = require("./services/WhatsAppService");
const app = (0, express_1.default)();
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
    app.use((0, morgan_1.default)('dev'));
}
// for parsing json
// app.use(
//   bodyParser.json({
//     limit: '100mb',
//   }),
// );
app.use(express_1.default.json());
// for parsing application/x-www-form-urlencoded
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
app.set('views', path_1.default.join(__dirname, 'views'));
app.set('view engine', 'html');
// Create HTTP server
const httpServer = (0, http_1.createServer)(app);
// Initialize Socket.io service
let socketService;
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
        // Restore active WhatsApp channels
        console.log('🔄 Restoring active WhatsApp channels...');
        yield WhatsAppService_1.whatsAppService.restoreActiveChannels();
        console.log('✅ WhatsApp channels restoration completed');
        // Start HTTP server
        const port = app.get('port');
        httpServer.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`📱 WhatsApp service ready`);
            console.log(`🔌 Socket.io server ready on ws://localhost:${port}/socket.io/`);
        });
        // Graceful shutdown handling
        const gracefulShutdown = (signal) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`\n📥 Received ${signal}. Starting graceful shutdown...`);
            try {
                // Stop accepting new connections
                httpServer.close(() => {
                    console.log('🔌 HTTP server closed');
                });
                // Cleanup WhatsApp connections
                yield WhatsAppService_1.whatsAppService.cleanup();
                console.log('📱 WhatsApp service cleaned up');
                // Cleanup Socket.io connections
                if (socketService) {
                    yield socketService.cleanup();
                    console.log('🔌 Socket.io service cleaned up');
                }
                console.log('✅ Graceful shutdown completed');
                process.exit(0);
            }
            catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        });
        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
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