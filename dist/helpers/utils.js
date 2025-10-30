"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeSuffixFromJid = exports.formatJid = exports.itemAlreadyExists = exports.itemNotFound = exports.isIDGood = exports.buildSuccObject = exports.validationResultMiddleware = exports.buildErrObject = exports.handleError = exports.getCountry = exports.getBrowserInfo = exports.getIP = exports.removeExtensionFromFile = exports.Random = exports.selectRandomId = exports.convertToDate = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const request_ip_1 = __importDefault(require("request-ip"));
const express_validator_1 = require("express-validator");
const convertToDate = (date) => {
    const preFormated = new Date(date);
    const formatedDate = new Date(preFormated.getTime() - preFormated.getTimezoneOffset() * -60000);
    return formatedDate;
};
exports.convertToDate = convertToDate;
const selectRandomId = (collection) => collection[Random(0, collection.length - 1)]._id;
exports.selectRandomId = selectRandomId;
const Random = (min, max) => {
    const newMin = Math.ceil(min);
    const newMax = Math.floor(max);
    return Math.floor(Math.random() * (newMax - newMin + 1)) + min;
};
exports.Random = Random;
const removeExtensionFromFile = (file) => file.split('.').slice(0, -1).join('.');
exports.removeExtensionFromFile = removeExtensionFromFile;
const getIP = (req) => request_ip_1.default.getClientIp(req);
exports.getIP = getIP;
const getBrowserInfo = (req) => req.headers['user-agent'];
exports.getBrowserInfo = getBrowserInfo;
const getCountry = (req) => req.headers['cf-ipcountry'] ? req.headers['cf-ipcountry'] : 'XX';
exports.getCountry = getCountry;
const handleError = (res, err) => {
    try {
        if (process.env.NODE_ENV !== 'production') {
            console.log(err);
        }
        // Handle different error types
        let statusCode = 500;
        let message = 'Internal server error';
        if (err instanceof Error) {
            // Handle plain Error objects
            message = err.message;
            // Set appropriate status codes based on common error messages
            if (err.message.includes('channel_not_found')) {
                statusCode = 404;
            }
            else if (err.message.includes('not_authed') || err.message.includes('invalid_auth')) {
                statusCode = 401;
            }
            else if (err.message.includes('permission') || err.message.includes('forbidden')) {
                statusCode = 403;
            }
            else if (err.message.includes('rate_limit')) {
                statusCode = 429;
            }
        }
        else if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
            // Handle custom error objects with code and message
            statusCode = err.code || 500;
            message = err.message;
        }
        else {
            // Handle unknown error types
            message = String(err);
        }
        res.status(statusCode).json({
            errors: {
                msg: message,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            errors: {
                msg: 'Internal server error',
            },
        });
    }
};
exports.handleError = handleError;
const buildErrObject = (code, message) => ({
    code,
    message,
});
exports.buildErrObject = buildErrObject;
const validationResultMiddleware = (req, res, next) => {
    try {
        (0, express_validator_1.validationResult)(req).throw();
        if (req.body.email) {
            req.body.email = req.body.email.toLowerCase();
        }
        return next();
    }
    catch (err) {
        return handleError(res, buildErrObject(422, err.array()));
    }
};
exports.validationResultMiddleware = validationResultMiddleware;
const buildSuccObject = (message) => ({
    msg: message,
});
exports.buildSuccObject = buildSuccObject;
const isIDGood = (id) => new Promise((resolve, reject) => {
    const goodID = mongoose_1.default.Types.ObjectId.isValid(id);
    return goodID ? resolve(id) : reject(buildErrObject(422, 'ID_MALFORMED'));
});
exports.isIDGood = isIDGood;
const itemNotFound = (err, item, reject, message) => {
    if (err) {
        reject(buildErrObject(422, err.message));
    }
    if (!item) {
        reject(buildErrObject(404, message));
    }
};
exports.itemNotFound = itemNotFound;
const itemAlreadyExists = (err, item, reject, message) => {
    if (err) {
        reject(buildErrObject(422, err.message));
    }
    if (item) {
        reject(buildErrObject(422, message));
    }
};
exports.itemAlreadyExists = itemAlreadyExists;
const formatJid = (jid) => {
    // List of valid WhatsApp JID suffixes
    const suffixes = [
        '@s.whatsapp.net',
        '@lid',
        '@g.us',
        '@broadcast',
        '@newsletter',
    ];
    // Check if jid already has a valid suffix
    for (const suffix of suffixes) {
        if (jid.includes(suffix)) {
            return jid;
        }
    }
    // Default to @s.whatsapp.net if no suffix present
    return jid + '@s.whatsapp.net';
};
exports.formatJid = formatJid;
const removeSuffixFromJid = (jid) => {
    // Remove all WhatsApp JID suffixes including @lid, @s.whatsapp.net, @g.us, @broadcast, etc.
    const suffixes = [
        '@s.whatsapp.net',
        '@lid',
        '@g.us',
        '@broadcast',
        '@newsletter',
    ];
    for (const suffix of suffixes) {
        if (jid.includes(suffix)) {
            return jid.replace(suffix, '');
        }
    }
    return jid;
};
exports.removeSuffixFromJid = removeSuffixFromJid;
//# sourceMappingURL=utils.js.map