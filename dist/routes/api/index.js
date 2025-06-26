"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.loadRoutes = void 0;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = express_1.default.Router();
const routesPath = `${__dirname}/`;
/*
 * Load routes statically and/or dynamically
 */
function loadRoutes() {
    return __awaiter(this, void 0, void 0, function* () {
        // Read all route files except for the current file (index.ts or index.js)
        const routeFiles = fs_1.default
            .readdirSync(routesPath)
            .filter((file) => file !== 'index.ts' && file !== 'index.js');
        // Dynamically import each route file and configure the route
        yield Promise.all(routeFiles.map((file) => __awaiter(this, void 0, void 0, function* () {
            const routeFile = path_1.default.basename(file, path_1.default.extname(file));
            try {
                const route = yield Promise.resolve(`${`${routesPath}${routeFile}`}`).then(s => __importStar(require(s)));
                // Use a specific base path for certain routes if needed, or default to the file name
                const basePath = route.basePath || `/${routeFile}`;
                if (route && route.default) {
                    router.use(basePath, route.default);
                }
            }
            catch (error) {
                console.error(`Failed to load route '${routeFile}':`, error);
            }
        })));
        // Optional: Setup a generic index route or 404 handler
        // Index Route Example:
        router.get('/', (req, res) => {
            res.json({ ok: true, msg: 'API is working!' });
        });
        // 404 Error Handler
        router.use('*', (req, res) => {
            res.status(404).json({ errors: { msg: 'URL_NOT_FOUND' } });
        });
        return router;
    });
}
exports.loadRoutes = loadRoutes;
//# sourceMappingURL=index.js.map