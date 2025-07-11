"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseRouter_1 = __importDefault(require("./BaseRouter"));
const WhatsAppEvents_controller_1 = __importDefault(require("../../controllers/WhatsAppEvents.controller"));
const authMiddlewares = [];
class ResourceRouter extends BaseRouter_1.default {
    constructor() {
        super(WhatsAppEvents_controller_1.default, authMiddlewares);
        // Initialize rest of CRUD routes
        this.setupRoutes();
    }
}
const router = new ResourceRouter();
exports.default = router.getRouter();
//# sourceMappingURL=whatsapp_events.js.map