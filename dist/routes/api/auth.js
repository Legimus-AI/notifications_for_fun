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
const controller = __importStar(require("../../controllers/auth.controller"));
const validate = __importStar(require("../../controllers/auth.validate"));
const router = express_1.default.Router();
require("../../config/passport");
const requireAuth = passport_1.default.authenticate('jwt', {
    session: false,
});
/*
 * Auth routes
 */
/*
 * Register route
 */
router.post('/register', trim_request_1.default.all, validate.register, controller.register);
/*
 * Verify route
 */
router.post('/verify', trim_request_1.default.all, validate.verify, controller.verify);
/*
 * Forgot password route
 */
router.post('/forgot', trim_request_1.default.all, validate.forgotPassword, controller.forgotPassword);
/*
 * Reset password route
 */
router.post('/reset', trim_request_1.default.all, validate.resetPassword, controller.resetPassword);
/*
 * Get new refresh token
 */
router.get('/token', requireAuth, controller.roleAuthorization(['USER', 'ADMIN', 'SUPERADMIN']), trim_request_1.default.all, controller.getRefreshToken);
/*
 * Login route
 */
router.post('/login', trim_request_1.default.all, validate.login, controller.login);
exports.default = router;
//# sourceMappingURL=auth.js.map