"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseRouter_1 = __importDefault(require("./BaseRouter"));
const webhooks_controller_1 = __importDefault(require("../../controllers/webhooks.controller"));
const authMiddlewares = [];
class ResourceRouter extends BaseRouter_1.default {
    constructor() {
        super(webhooks_controller_1.default, authMiddlewares);
        // Add custom route
        super.getRouter().get('/custom-route', (req, res) => {
            res.status(200).json({ message: 'Custom route' });
        });
        // Initialize rest of CRUD routes
        this.setupRoutes();
    }
}
const router = new ResourceRouter();
exports.default = router.getRouter();
//# sourceMappingURL=webhooks.js.map