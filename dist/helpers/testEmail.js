"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nodemailer_1 = __importDefault(require("nodemailer"));
const nodemailer_mailgun_transport_1 = __importDefault(require("nodemailer-mailgun-transport"));
const auth = {
    auth: {
        api_key: process.env.MAILGUN_API_KEY,
        domain: process.env.MAILGUN_DOMAIN,
    },
};
const nodemailerMailgun = nodemailer_1.default.createTransport((0, nodemailer_mailgun_transport_1.default)(auth));
nodemailerMailgun.sendMail({
    from: 'support@equites.com',
    to: 'viktor.developer96@gmail.com',
    subject: 'Hola que hace!',
    html: '<b>Wow Big powerful letters</b><br/>!',
}, (err, info) => {
    if (err) {
        console.log(`Error: ${err}`);
    }
    else {
        console.log(`Response: ${info}`);
    }
});
//# sourceMappingURL=testEmail.js.map