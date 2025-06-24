"use strict";
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
exports.decrypt = exports.encrypt = exports.checkPassword = void 0;
const crypto_1 = __importDefault(require("crypto"));
const utils_1 = require("../helpers/utils");
const secret = process.env.JWT_SECRET;
const algorithm = 'aes-192-cbc';
// Key length is dependent on the algorithm. In this case for aes192, it is
// 24 bytes (192 bits).
const key = crypto_1.default.scryptSync(secret, 'salt', 24);
const iv = Buffer.alloc(16, 0); // Initialization crypto vector
const checkPassword = (password, user) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        user.comparePassword(password, (err, isMatch) => {
            if (err) {
                reject((0, utils_1.buildErrObject)(422, err.message));
            }
            if (!isMatch) {
                resolve(false);
            }
            resolve(true);
        });
    });
});
exports.checkPassword = checkPassword;
const encrypt = (text) => {
    const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};
exports.encrypt = encrypt;
const decrypt = (text) => {
    const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
    try {
        let decrypted = decipher.update(text, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (err) {
        return err.message;
    }
};
exports.decrypt = decrypt;
//# sourceMappingURL=auth.js.map