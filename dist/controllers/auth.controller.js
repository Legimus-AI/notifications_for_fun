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
exports.roleAuthorization = exports.getRefreshToken = exports.resetPassword = exports.forgotPassword = exports.verify = exports.register = exports.login = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const date_fns_1 = require("date-fns");
const express_validator_1 = require("express-validator");
const Users_1 = __importDefault(require("../models/Users"));
const UserAccess_1 = __importDefault(require("../models/UserAccess"));
const ForgotPassword_1 = __importDefault(require("../models/ForgotPassword"));
const utils = __importStar(require("../helpers/utils"));
const auth = __importStar(require("../helpers/auth"));
const emailer = __importStar(require("../helpers/emailer"));
const HOURS_TO_BLOCK = 2;
const LOGIN_ATTEMPTS = 5;
/** *******************
 * Private functions *
 ******************** */
/**
 * Generates a token
 * @param {Object} user - user object
 */
const generateToken = (user) => {
    // Gets expiration time
    const expiration = Math.floor(Date.now() / 1000) +
        60 * parseInt(process.env.JWT_EXPIRATION_IN_MINUTES);
    //   returns signed and encrypted token
    return auth.encrypt(jsonwebtoken_1.default.sign({
        data: {
            _id: user,
        },
        exp: expiration,
    }, process.env.JWT_SECRET));
};
/**
 * Creates an object with user info
 * @param {Object} req - request object
 */
const setUserInfo = (req) => {
    let user = {
        _id: req._id,
        name: req.name,
        email: req.email,
        role: req.role,
        verified: req.verified,
    };
    // Adds verification for testing purposes
    if (process.env.NODE_ENV !== 'production') {
        user = Object.assign(Object.assign({}, user), { verification: req.verification });
    }
    return user;
};
/**
 * Saves a new user access and then returns token
 * @param {Object} req - request object
 * @param {Object} user - user object
 */
const saveUserAccessAndReturnToken = (req, user) => new Promise((resolve, reject) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userAccess = new UserAccess_1.default({
            email: user.email,
            ip: utils.getIP(req),
            browser: utils.getBrowserInfo(req),
            country: utils.getCountry(req),
        });
        yield userAccess.save();
        const userInfo = setUserInfo(user);
        resolve({
            token: generateToken(user._id),
            user: userInfo,
        });
    }
    catch (err) {
        reject(utils.buildErrObject(422, err.message));
    }
}));
/**
 * Blocks a user by setting blockExpires to the specified date based on constant HOURS_TO_BLOCK
 * @param {Object} user - user object
 */
const blockUser = (user) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        user.blockExpires = (0, date_fns_1.addHours)(new Date(), HOURS_TO_BLOCK);
        user.save((err, result) => {
            if (err) {
                reject(utils.buildErrObject(422, err.message));
            }
            if (result) {
                resolve(utils.buildErrObject(409, 'BLOCKED_USER'));
            }
        });
    });
});
/**
 * Saves login attempts to dabatabse
 * @param {Object} user - user object
 */
const saveLoginAttemptsToDB = (user) => new Promise((resolve, reject) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield user.save();
        resolve(true);
    }
    catch (err) {
        reject(utils.buildErrObject(422, err.message));
    }
}));
/**
 * Checks that login attempts are greate in constant and also that blockexpires is less than now
 * @param {Object} user - user object
 */
const blockIsExpired = (user) => user.loginAttempts > LOGIN_ATTEMPTS && user.blockExpires <= new Date();
/**
 *
 * @param {Object} user - user object.
 */
const checkLoginAttemptsAndBlockExpires = (user) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        // Let user try to login again after blockexpires, resets user loginAttempts
        if (blockIsExpired(user)) {
            user.loginAttempts = 0;
            user.save((err, result) => {
                if (err) {
                    reject(utils.buildErrObject(422, err.message));
                }
                if (result) {
                    resolve(true);
                }
            });
        }
        else {
            // User is not blocked, check password (normal behaviour)
            resolve(true);
        }
    });
});
/**
 * Checks if blockExpires from user is greater than now
 * @param {Object} user - user object
 */
const userIsBlocked = (user) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        if (user.blockExpires > new Date()) {
            reject(utils.buildErrObject(409, 'BLOCKED_USER'));
        }
        resolve(true);
    });
});
/**
 * Finds user by email
 * @param {string} email - user´s email
 */
const findUser = (email) => {
    return new Promise((resolve, reject) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const item = yield Users_1.default.findOne({ email }, 'password loginAttempts blockExpires name email role verified verification').exec();
            if (!item) {
                utils.itemNotFound(null, item, reject, 'La cuenta no existe');
                return; // ensures the code stops executing in this branch
            }
            resolve(item);
        }
        catch (err) {
            utils.itemNotFound(err, null, reject, 'La cuenta no existe');
        }
    }));
};
/**
 * Finds user by ID
 * @param {string} id - user´s id
 */
const findUserById = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        Users_1.default.findById(userId, (err, item) => {
            utils.itemNotFound(err, item, reject, 'La cuenta no existe');
            resolve(item);
        });
    });
});
/**
 * Adds one attempt to loginAttempts, then compares
 * loginAttempts with the constant LOGIN_ATTEMPTS, tion
 * @param {Object} user - user object
 */
const passwordsDoNotMatch = (user) => __awaiter(void 0, void 0, void 0, function* () {
    user.loginAttempts += 1;
    yield saveLoginAttemptsToDB(user);
    return new Promise((resolve, reject) => {
        if (user.loginAttempts <= LOGIN_ATTEMPTS) {
            resolve(utils.buildErrObject(409, 'La contraseña es incorrecta'));
        }
        else {
            resolve(blockUser(user));
        }
        reject(utils.buildErrObject(422, 'ERROR'));
    });
});
/**
 * Registers a new user in database
 * @param {Object} req - request object
 */
const registerUser = (body) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        body.verification = (0, uuid_1.v4)();
        const user = new Users_1.default(body);
        const item = yield user.save();
        return item;
    }
    catch (err) {
        throw utils.buildErrObject(422, err.message);
    }
});
/**
 * Builds the registration token
 * @param {Object} item - user object that contains created id
 * @param {Object} userInfo - user object
 */
const returnRegisterToken = (item, userInfo) => {
    if (process.env.NODE_ENV !== 'production') {
        userInfo.verification = item.verification;
    }
    const data = {
        token: generateToken(item._id),
        user: userInfo,
    };
    return data;
};
/**
 * Checks if verification id exists for user
 * @param {string} id - verification id
 */
const verificationExists = (id) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        Users_1.default.findOne({
            verification: id,
            verified: false,
        }, (err, user) => {
            utils.itemNotFound(err, user, reject, 'NOT_FOUND_OR_ALREADY_VERIFIED');
            resolve(user);
        });
    });
});
/**
 * Verifies an user
 * @param {Object} user - user object
 */
const verifyUser = (user) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        user.verified = true;
        user.save((err, item) => {
            if (err) {
                reject(utils.buildErrObject(422, err.message));
            }
            resolve({
                email: item.email,
                verified: item.verified,
            });
        });
    });
});
/**
 * Marks a request to reset password as used
 * @param {Object} req - request object
 * @param {Object} forgot - forgot object
 */
const markResetPasswordAsUsed = (req, forgot) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        forgot.used = true;
        forgot.ipChanged = utils.getIP(req);
        forgot.browserChanged = utils.getBrowserInfo(req);
        forgot.countryChanged = utils.getCountry(req);
        forgot.save((err, item) => {
            utils.itemNotFound(err, item, reject, 'NOT_FOUND');
            resolve(utils.buildSuccObject('PASSWORD_CHANGED'));
        });
    });
});
/**
 * Updates a user password in database
 * @param {string} password - new password
 * @param {Object} user - user object
 */
const updatePassword = (password, user) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        user.password = password;
        user.save((err, item) => {
            utils.itemNotFound(err, item, reject, 'NOT_FOUND');
            resolve(item);
        });
    });
});
/**
 * Finds user by email to reset password
 * @param {string} email - user email
 */
const findUserToResetPassword = (email) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        Users_1.default.findOne({
            email,
        }, (err, user) => {
            utils.itemNotFound(err, user, reject, 'NOT_FOUND');
            resolve(user);
        });
    });
});
/**
 * Checks if a forgot password verification exists
 * @param {string} id - verification id
 */
const findForgotPassword = (id) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        ForgotPassword_1.default.findOne({
            verification: id,
            used: false,
        }, (err, item) => {
            utils.itemNotFound(err, item, reject, 'NOT_FOUND_OR_ALREADY_USED');
            resolve(item);
        });
    });
});
/**
 * Creates a new password forgot
 * @param {Object} req - request object
 */
const saveForgotPassword = (req) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        const forgot = new ForgotPassword_1.default({
            email: req.body.email,
            verification: (0, uuid_1.v4)(),
            ipRequest: utils.getIP(req),
            browserRequest: utils.getBrowserInfo(req),
            countryRequest: utils.getCountry(req),
        });
        forgot.save((err, item) => {
            if (err) {
                reject(utils.buildErrObject(422, err.message));
            }
            resolve(item);
        });
    });
});
/**
 * Builds an object with created forgot password o
 * bject, if env is development or testing exposes the verification
 * @param {Object} item - created forgot password object
 */
const forgotPasswordResponse = (item) => {
    let data = {
        msg: 'RESET_EMAIL_SENT',
        email: item.email,
    };
    if (process.env.NODE_ENV !== 'production') {
        data = Object.assign(Object.assign({}, data), { verification: item.verification });
    }
    return data;
};
/**
 * Checks against user if has quested role
 * @param {Object} data - data object
 * @param {*} next - next callback
 */
const checkPermissions = (data, next) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        Users_1.default.findById(data.id, (err, result) => {
            utils.itemNotFound(err, result, reject, 'NOT_FOUND');
            if (data.roles.indexOf(result.role) > -1) {
                return resolve(next());
            }
            return reject(utils.buildErrObject(401, 'UNAUTHORIZED'));
        });
    });
});
/**
 * Gets user id from token
 * @param {string} token - Encrypted and encoded token
 */
const getUserIdFromToken = (token) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        // Decrypts, verifies and decode token
        jsonwebtoken_1.default.verify(auth.decrypt(token), process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                reject(utils.buildErrObject(409, 'BAD_TOKEN'));
            }
            resolve(decoded.data._id);
        });
    });
});
/** ******************
 * Public functions *
 ******************* */
/**
 * Login function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { body } = req;
        const user = yield findUser(body.email);
        yield userIsBlocked(user);
        yield checkLoginAttemptsAndBlockExpires(user);
        const isPasswordMatch = yield auth.checkPassword(body.password, user);
        if (!isPasswordMatch) {
            utils.handleError(res, (yield passwordsDoNotMatch(user)));
        }
        else {
            // all ok, register access and return token
            user.loginAttempts = 0;
            yield saveLoginAttemptsToDB(user);
            res.status(200).json(yield saveUserAccessAndReturnToken(req, user));
        }
    }
    catch (error) {
        utils.handleError(res, error);
    }
});
exports.login = login;
/**
 * Register function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('se entro a registrar..');
    try {
        const { body } = req;
        const doesEmailExists = yield emailer.emailExists(body.email);
        if (!doesEmailExists) {
            const item = yield registerUser(body);
            const userInfo = setUserInfo(item);
            const response = returnRegisterToken(item, userInfo);
            emailer.sendRegistrationEmailMessage(item);
            res.status(201).json(Object.assign({ ok: true }, response));
        }
    }
    catch (error) {
        utils.handleError(res, error);
    }
});
exports.register = register;
/**
 * Verify function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
const verify = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        req = (0, express_validator_1.matchedData)(req);
        const user = yield verificationExists(req.id);
        res.status(200).json(yield verifyUser(user));
    }
    catch (error) {
        utils.handleError(res, error);
    }
});
exports.verify = verify;
/**
 * Forgot password function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
const forgotPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Gets locale from header 'Accept-Language'
        const locale = req.getLocale();
        const data = (0, express_validator_1.matchedData)(req);
        yield findUser(data.email);
        const item = yield saveForgotPassword(req);
        emailer.sendResetPasswordEmailMessage(locale, item);
        res.status(200).json(forgotPasswordResponse(item));
    }
    catch (error) {
        utils.handleError(res, error);
    }
});
exports.forgotPassword = forgotPassword;
/**
 * Reset password function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = (0, express_validator_1.matchedData)(req);
        const hasForgotPassword = yield findForgotPassword(data.id);
        const user = yield findUserToResetPassword(hasForgotPassword.email);
        yield updatePassword(data.password, user);
        const result = yield markResetPasswordAsUsed(req, hasForgotPassword);
        res.status(200).json(result);
    }
    catch (error) {
        utils.handleError(res, error);
    }
});
exports.resetPassword = resetPassword;
/**
 * Refresh token function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
const getRefreshToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenEncrypted = req.headers.authorization
            .replace('Bearer ', '')
            .trim();
        let userId = yield getUserIdFromToken(tokenEncrypted);
        userId = yield utils.isIDGood(userId);
        const user = yield findUserById(userId);
        const token = yield saveUserAccessAndReturnToken(req, user);
        // Removes user info from response
        delete token.user;
        res.status(200).json(token);
    }
    catch (error) {
        utils.handleError(res, error);
    }
});
exports.getRefreshToken = getRefreshToken;
/**
 * Roles authorization function called by route
 * @param {Array} roles - roles specified on the route
 */
const roleAuthorization = (roles) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = {
            id: req.user._id,
            roles,
        };
        yield checkPermissions(data, next);
    }
    catch (error) {
        utils.handleError(res, error);
    }
});
exports.roleAuthorization = roleAuthorization;
//# sourceMappingURL=auth.controller.js.map