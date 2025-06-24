"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const validator_1 = __importDefault(require("validator"));
const UserAccessSchema = new mongoose_1.default.Schema({
    email: {
        type: String,
        validate: {
            validator: validator_1.default.isEmail,
            message: 'EMAIL_IS_NOT_VALID',
        },
        lowercase: true,
        required: true,
    },
    ip: {
        type: String,
        required: true,
    },
    browser: {
        type: String,
        required: true,
    },
    country: {
        type: String,
        required: true,
    },
}, {
    versionKey: false,
    timestamps: true,
});
exports.default = mongoose_1.default.model('UserAccess', UserAccessSchema);
//# sourceMappingURL=UserAccess.js.map