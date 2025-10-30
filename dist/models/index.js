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
exports.SlackEvents = exports.WhatsAppEvents = exports.WhatsAppAuthKey = exports.WhatsAppAuthState = exports.UserAccess = exports.ForgotPassword = exports.Users = exports.Cities = exports.Webhook = exports.NotificationLog = exports.Channel = exports.ApiKey = void 0;
// Models
var ApiKeys_1 = require("./ApiKeys");
Object.defineProperty(exports, "ApiKey", { enumerable: true, get: function () { return __importDefault(ApiKeys_1).default; } });
var Channels_1 = require("./Channels");
Object.defineProperty(exports, "Channel", { enumerable: true, get: function () { return __importDefault(Channels_1).default; } });
var NotificationLogs_1 = require("./NotificationLogs");
Object.defineProperty(exports, "NotificationLog", { enumerable: true, get: function () { return __importDefault(NotificationLogs_1).default; } });
var Webhooks_1 = require("./Webhooks");
Object.defineProperty(exports, "Webhook", { enumerable: true, get: function () { return __importDefault(Webhooks_1).default; } });
var Cities_1 = require("./Cities");
Object.defineProperty(exports, "Cities", { enumerable: true, get: function () { return __importDefault(Cities_1).default; } });
var Users_1 = require("./Users");
Object.defineProperty(exports, "Users", { enumerable: true, get: function () { return __importDefault(Users_1).default; } });
var ForgotPassword_1 = require("./ForgotPassword");
Object.defineProperty(exports, "ForgotPassword", { enumerable: true, get: function () { return __importDefault(ForgotPassword_1).default; } });
var UserAccess_1 = require("./UserAccess");
Object.defineProperty(exports, "UserAccess", { enumerable: true, get: function () { return __importDefault(UserAccess_1).default; } });
var WhatsAppAuthState_1 = require("./WhatsAppAuthState");
Object.defineProperty(exports, "WhatsAppAuthState", { enumerable: true, get: function () { return WhatsAppAuthState_1.WhatsAppAuthState; } });
Object.defineProperty(exports, "WhatsAppAuthKey", { enumerable: true, get: function () { return WhatsAppAuthState_1.WhatsAppAuthKey; } });
var WhatsAppEvents_1 = require("./WhatsAppEvents");
Object.defineProperty(exports, "WhatsAppEvents", { enumerable: true, get: function () { return __importDefault(WhatsAppEvents_1).default; } });
var SlackEvents_1 = require("./SlackEvents");
Object.defineProperty(exports, "SlackEvents", { enumerable: true, get: function () { return __importDefault(SlackEvents_1).default; } });
// Dynamic model loader function
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const modelsPath = `${__dirname}/`;
function loadModels() {
    return __awaiter(this, void 0, void 0, function* () {
        /*
         * Load models dynamically
         */
        // Read all files in the directory
        const files = fs_1.default.readdirSync(modelsPath);
        for (const file of files) {
            // Get the name of the file without its extension
            const modelFile = path_1.default.basename(file, path_1.default.extname(file));
            // Prevents loading of this file
            if (modelFile !== 'index') {
                // Dynamically import the model
                yield Promise.resolve(`${`./${modelFile}`}`).then(s => __importStar(require(s)));
            }
        }
    });
}
exports.default = loadModels;
//# sourceMappingURL=index.js.map