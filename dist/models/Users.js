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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const validator_1 = __importDefault(require("validator"));
const mongoose_paginate_v2_1 = __importDefault(require("mongoose-paginate-v2"));
const UserSchema = new mongoose_1.Schema({
    first_name: {
        type: String,
        required: true,
    },
    last_name: String,
    email: {
        type: String,
        validate: {
            validator: validator_1.default.isEmail,
            message: 'EMAIL_IS_NOT_VALID',
        },
        lowercase: true,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'SUPERADMIN'],
        default: 'user',
    },
    verification: {
        type: String,
    },
    verified: {
        type: Boolean,
        default: false,
    },
    phone: {
        type: String,
    },
    city: {
        type: String,
    },
    country: {
        type: String,
    },
    urlTwitter: {
        type: String,
        validate: {
            validator: function (v) {
                return v === '' ? true : validator_1.default.isURL(v);
            },
            message: 'NOT_A_VALID_URL',
        },
        lowercase: true,
    },
    urlGitHub: {
        type: String,
        validate: {
            validator: function (v) {
                return v === '' ? true : validator_1.default.isURL(v);
            },
            message: 'NOT_A_VALID_URL',
        },
        lowercase: true,
    },
    loginAttempts: {
        type: Number,
        default: 0,
        select: false,
    },
    blockExpires: {
        type: Date,
        default: Date.now,
        select: false,
    },
}, {
    versionKey: false,
    timestamps: true,
});
const hash = (user, salt, next) => {
    bcrypt_1.default.hash(user.password, salt, (error, newHash) => {
        if (error) {
            console.log('🚀 Aqui *** -> error:', error);
            return next();
        }
        user.password = newHash;
        return next();
    });
};
const genSalt = (user, SALT_FACTOR, next) => {
    bcrypt_1.default.genSalt(SALT_FACTOR, (err, salt) => {
        if (err) {
            console.log('🚀 Aqui *** -> err:', err);
            return next();
        }
        return hash(user, salt, next);
    });
};
UserSchema.pre('save', function (next) {
    const SALT_FACTOR = 5;
    if (!this.isModified('password')) {
        return next();
    }
    return genSalt(this, SALT_FACTOR, next);
});
UserSchema.methods.comparePassword = function (passwordAttempt, cb) {
    bcrypt_1.default.compare(passwordAttempt, this.password, (err, isMatch) => err ? cb(err) : cb(null, isMatch));
};
UserSchema.plugin(mongoose_paginate_v2_1.default);
exports.default = mongoose_1.default.model('Users', UserSchema);
//# sourceMappingURL=Users.js.map