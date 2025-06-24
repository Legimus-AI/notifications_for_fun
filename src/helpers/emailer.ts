import nodemailer from 'nodemailer';
import mg from 'nodemailer-mailgun-transport';
import User from '../models/Users';
import { itemAlreadyExists } from './utils';

interface UserData {
  name: string;
  email: string;
  verification: string;
}

interface EmailData {
  user: UserData;
  subject: string;
  htmlMessage: string;
}

const sendEmail = async (
  data: EmailData,
  callback: (result: boolean) => void,
): Promise<void> => {
  const auth = {
    auth: {
      api_key: process.env.EMAIL_SMTP_API_MAILGUN as string,
      domain: process.env.EMAIL_SMTP_DOMAIN_MAILGUN as string,
    },
  };
  const transporter = nodemailer.createTransport(mg(auth));
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
};

const prepareToSendEmail = (
  user: UserData,
  subject: string,
  htmlMessage: string,
): void => {
  const data: EmailData = {
    user,
    subject,
    htmlMessage,
  };
  if (process.env.NODE_ENV === 'production') {
    sendEmail(data, (messageSent) => {
      if (messageSent) {
        console.log(`Email SENT to: ${user.email}`);
      } else {
        console.log(`Email FAILED to: ${user.email}`);
      }
    });
  } else if (process.env.NODE_ENV === 'development') {
    console.log(data);
  }
};

export const emailExists = async (email: string): Promise<boolean> => {
  try {
    const item = await User.findOne({ email });
    if (item) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }
    return false;
  } catch (error) {
    // The function itemAlreadyExists seems to handle the error.
    // If it throws an error, it will be propagated upwards.
    itemAlreadyExists(error, null, undefined, 'EMAIL_ALREADY_EXISTS');
  }
};

export const emailExistsExcludingMyself = async (
  id: string,
  email: string,
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    User.findOne(
      {
        email,
        _id: {
          $ne: id,
        },
      },
      (err, item) => {
        itemAlreadyExists(err, item, reject, 'EMAIL_ALREADY_EXISTS');
        resolve(false);
      },
    );
  });
};

export const sendRegistrationEmailMessage = async (
  user: UserData,
): Promise<void> => {
  const subject = 'Verificar tu Email en el Sistema';
  const htmlMessage = `<p>Hola ${user.name}.</p> <p>¡Bienvenido! Para verificar tu Email, por favor haz click en este enlace:</p> <p>${process.env.FRONTEND_URL}/verify/${user.verification}</p> <p>Gracias.</p>`;
  prepareToSendEmail(user, subject, htmlMessage);
};

export const sendResetPasswordEmailMessage = async (
  locale: string = 'es',
  user: UserData,
): Promise<void> => {
  console.log(locale);
  const subject = 'Olvidaste tu contraseña...';
  const htmlMessage = 'olvidaste la contraseña';
  prepareToSendEmail(user, subject, htmlMessage);
};
