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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const passport_1 = __importDefault(require("passport"));
const trim_request_1 = __importDefault(require("trim-request"));
const AuthController = __importStar(require("../../controllers/auth.controller"));
const requireAuth = passport_1.default.authenticate('jwt', {
    session: false,
});
class BaseRouter {
    constructor(controller, authMiddlewares) {
        this.router = express_1.default.Router();
        this.controller = controller;
        this.authMiddlewares = authMiddlewares || [
            requireAuth,
            AuthController.roleAuthorization(['SUPERADMIN', 'ADMIN']),
        ];
    }
    setAuthMiddlewares(middlewares) {
        this.authMiddlewares = middlewares;
    }
    getAuthMiddlewares() {
        return this.authMiddlewares;
    }
    setupRoutes() {
        this.router.get('/all', this.authMiddlewares, trim_request_1.default.all, this.controller.listAll);
        this.router.get('/', this.authMiddlewares, trim_request_1.default.all, this.controller.list);
        this.router.post('/', this.authMiddlewares, trim_request_1.default.all, this.controller.validation.create, this.controller.create);
        this.router.get('/:id', this.authMiddlewares, trim_request_1.default.all, this.controller.validation.listOne, this.controller.listOne);
        this.router.put('/:id', this.authMiddlewares, trim_request_1.default.all, this.controller.validation.update, this.controller.update);
        this.router.delete('/:id', this.authMiddlewares, trim_request_1.default.all, this.controller.validation.delete, this.controller.delete);
    }
    getRouter() {
        return this.router;
    }
}
exports.default = BaseRouter;
//# sourceMappingURL=BaseRouter.js.map