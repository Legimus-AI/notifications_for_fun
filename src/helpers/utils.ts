import mongoose from 'mongoose';
import requestIp from 'request-ip';
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const convertToDate = (date: string | number | Date): Date => {
  const preFormated = new Date(date);
  const formatedDate = new Date(
    preFormated.getTime() - preFormated.getTimezoneOffset() * -60000,
  );
  return formatedDate;
};

const selectRandomId = (collection: Array<{ _id: string }>): string =>
  collection[Random(0, collection.length - 1)]._id;

const Random = (min: number, max: number): number => {
  const newMin = Math.ceil(min);
  const newMax = Math.floor(max);
  return Math.floor(Math.random() * (newMax - newMin + 1)) + min;
};

const removeExtensionFromFile = (file: string): string =>
  file.split('.').slice(0, -1).join('.');

const getIP = (req: Request): string => requestIp.getClientIp(req);

const getBrowserInfo = (req: Request): string =>
  req.headers['user-agent'] as string;

const getCountry = (req: Request): string =>
  req.headers['cf-ipcountry'] ? (req.headers['cf-ipcountry'] as string) : 'XX';

const handleError = (
  res: Response,
  err: { code?: number; message: string } | Error,
): void => {
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
      } else if (err.message.includes('not_authed') || err.message.includes('invalid_auth')) {
        statusCode = 401;
      } else if (err.message.includes('permission') || err.message.includes('forbidden')) {
        statusCode = 403;
      } else if (err.message.includes('rate_limit')) {
        statusCode = 429;
      }
    } else if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      // Handle custom error objects with code and message
      statusCode = err.code || 500;
      message = err.message;
    } else {
      // Handle unknown error types
      message = String(err);
    }

    res.status(statusCode).json({
      errors: {
        msg: message,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      errors: {
        msg: 'Internal server error',
      },
    });
  }
};

const buildErrObject = (
  code: number,
  message: string,
): { code: number; message: string } => ({
  code,
  message,
});

const validationResultMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void | Response<any> => {
  try {
    validationResult(req).throw();
    if (req.body.email) {
      req.body.email = req.body.email.toLowerCase();
    }
    return next();
  } catch (err) {
    return handleError(res, buildErrObject(422, err.array()));
  }
};

const buildSuccObject = (message: string): { msg: string } => ({
  msg: message,
});

const isIDGood = (id: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const goodID = mongoose.Types.ObjectId.isValid(id);
    return goodID ? resolve(id) : reject(buildErrObject(422, 'ID_MALFORMED'));
  });

const itemNotFound = (
  err: any,
  item: any,
  reject: (reason?: any) => void,
  message: string,
): void => {
  if (err) {
    reject(buildErrObject(422, err.message));
  }
  if (!item) {
    reject(buildErrObject(404, message));
  }
};

const itemAlreadyExists = (
  err: any,
  item: any,
  reject: (reason?: any) => void,
  message: string,
): void => {
  if (err) {
    reject(buildErrObject(422, err.message));
  }
  if (item) {
    reject(buildErrObject(422, message));
  }
};

const formatJid = (jid: string): string => {
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

const removeSuffixFromJid = (jid: string): string => {
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

export {
  convertToDate,
  selectRandomId,
  Random,
  removeExtensionFromFile,
  getIP,
  getBrowserInfo,
  getCountry,
  handleError,
  buildErrObject,
  validationResultMiddleware,
  buildSuccObject,
  isIDGood,
  itemNotFound,
  itemAlreadyExists,
  formatJid,
  removeSuffixFromJid,
};
