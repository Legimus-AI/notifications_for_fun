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
  err: { code: number; message: string },
): void => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(err);
  }
  res.status(err.code).json({
    errors: {
      msg: err.message,
    },
  });
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
};
