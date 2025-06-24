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
exports.sendResetPasswordEmailMessage = exports.sendRegistrationEmailMessage = exports.emailExistsExcludingMyself = exports.emailExists = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const nodemailer_mailgun_transport_1 = __importDefault(require("nodemailer-mailgun-transport"));
const Users_1 = __importDefault(require("../models/Users"));
const utils_1 = require("./utils");
const sendEmail = (data, callback) => __awaiter(void 0, void 0, void 0, function* () {
    const auth = {
        auth: {
            api_key: process.env.EMAIL_SMTP_API_MAILGUN,
            domain: process.env.EMAIL_SMTP_DOMAIN_MAILGUN,
        },
    };
    const transporter = nodemailer_1.default.createTransport((0, nodemailer_mailgun_transport_1.default)(auth));
    const mailOptions = {
        from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: `${data.user.name} <${data.user.email}>`,
        subject: data.subject,
        html: data.htmlMessage,
    };
    if (process.env.EMAIL_SMTP_API_MAILGUN) {
        transporter.sendMail(mailOptions, (err) => {
            if (err) {
                return callback(false);
            }
            return callback(true);
        });
    }
});
const prepareToSendEmail = (user, subject, htmlMessage) => {
    const data = {
        user,
        subject,
        htmlMessage,
    };
    if (process.env.NODE_ENV === 'production') {
        sendEmail(data, (messageSent) => {
            if (messageSent) {
                console.log(`Email SENT to: ${user.email}`);
            }
            else {
                console.log(`Email FAILED to: ${user.email}`);
            }
        });
    }
    else if (process.env.NODE_ENV === 'development') {
        console.log(data);
    }
};
const emailExists = (email) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const item = yield Users_1.default.findOne({ email });
        if (item) {
            throw new Error('EMAIL_ALREADY_EXISTS');
        }
        return false;
    }
    catch (error) {
        // The function itemAlreadyExists seems to handle the error.
        // If it throws an error, it will be propagated upwards.
        (0, utils_1.itemAlreadyExists)(error, null, undefined, 'EMAIL_ALREADY_EXISTS');
    }
});
exports.emailExists = emailExists;
const emailExistsExcludingMyself = (id, email) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        Users_1.default.findOne({
            email,
            _id: {
                $ne: id,
            },
        }, (err, item) => {
            (0, utils_1.itemAlreadyExists)(err, item, reject, 'EMAIL_ALREADY_EXISTS');
            resolve(false);
        });
    });
});
exports.emailExistsExcludingMyself = emailExistsExcludingMyself;
const sendRegistrationEmailMessage = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const subject = 'Verificar tu Email en el Sistema';
    const htmlMessage = `<p>Hola ${user.name}.</p> <p>¡Bienvenido! Para verificar tu Email, por favor haz click en este enlace:</p> <p>${process.env.FRONTEND_URL}/verify/${user.verification}</p> <p>Gracias.</p>`;
    prepareToSendEmail(user, subject, htmlMessage);
});
exports.sendRegistrationEmailMessage = sendRegistrationEmailMessage;
const sendResetPasswordEmailMessage = (locale = 'es', user) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(locale);
    const subject = 'Olvidaste tu contraseña...';
    const htmlMessage = 'olvidaste la contraseña';
    prepareToSendEmail(user, subject, htmlMessage);
});
exports.sendResetPasswordEmailMessage = sendResetPasswordEmailMessage;
//# sourceMappingURL=emailer.js.map