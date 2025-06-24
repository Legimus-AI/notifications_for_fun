"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseRouter_1 = __importDefault(require("./BaseRouter"));
const users_controller_1 = __importDefault(require("../../controllers/users.controller"));
class ResourceRouter extends BaseRouter_1.default {
    constructor() {
        super(users_controller_1.default, []);
        this.setupRoutes();
    }
}
const router = new ResourceRouter();
exports.default = router.getRouter();
//# sourceMappingURL=users.js.map