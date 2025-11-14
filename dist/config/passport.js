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
const passport_1 = __importDefault(require("passport"));
const passport_jwt_1 = require("passport-jwt");
const Users_1 = __importDefault(require("../models/Users"));
const auth = __importStar(require("../helpers/auth"));
/**
 * Extracts token from: header, body or query
 * @param {Request} req - request object
 * @returns {string | null} token - decrypted token
 */
const jwtExtractor = (req) => {
    let token = null;
    if (req.headers.authorization) {
        token = req.headers.authorization.replace('Bearer ', '').trim();
    }
    else if (req.body.token) {
        token = req.body.token.trim();
    }
    else if (req.query.token) {
        token = req.query.token.trim();
    }
    if (token) {
        // Decrypts token
        token = auth.decrypt(token);
    }
    return token;
};
/**
 * Options object for jwt middleware
 */
const jwtOptions = {
    jwtFromRequest: jwtExtractor,
    secretOrKey: process.env.JWT_SECRET,
};
/**
 * Login with JWT middleware
 */
const jwtLogin = new passport_jwt_1.Strategy(jwtOptions, (payload, done) => {
    Users_1.default.findById(payload.data._id, (err, user) => {
        if (err) {
            return done(err, false);
        }
        return !user ? done(null, false) : done(null, user);
    });
});
passport_1.default.use(jwtLogin);
//# sourceMappingURL=passport.js.map