import nodemailer from 'nodemailer';
import mg from 'nodemailer-mailgun-transport';

const auth = {
  auth: {
    api_key: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN,
  },
};

const nodemailerMailgun = nodemailer.createTransport(mg(auth));

nodemailerMailgun.sendMail(
  {
    from: 'support@equites.com',
    to: 'viktor.developer96@gmail.com',
    subject: 'Hola que hace!',
    html: '<b>Wow Big powerful letters</b><br/>!',
  },
  (err: Error | null, info: nodemailer.SentMessageInfo) => {
    if (err) {
      console.log(`Error: ${err}`);
    } else {
      console.log(`Response: ${info}`);
    }
  },
);
