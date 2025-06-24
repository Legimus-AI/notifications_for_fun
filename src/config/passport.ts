import passport from 'passport';
import { Strategy as JwtStrategy } from 'passport-jwt';
import User from '../models/Users';
import * as auth from '../helpers/auth';
import { Request } from 'express';

/**
 * Extracts token from: header, body or query
 * @param {Request} req - request object
 * @returns {string | null} token - decrypted token
 */
const jwtExtractor = (req: Request): string | null => {
  let token: string | null = null;
  if (req.headers.authorization) {
    token = req.headers.authorization.replace('Bearer ', '').trim();
  } else if (req.body.token) {
    token = req.body.token.trim();
  } else if (req.query.token) {
    token = (req.query.token as string).trim();
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
  secretOrKey: process.env.JWT_SECRET as string,
};

/**
 * Login with JWT middleware
 */
const jwtLogin = new JwtStrategy(jwtOptions, (payload, done) => {
  User.findById(payload.data._id, (err, user) => {
    if (err) {
      return done(err, false);
    }
    return !user ? done(null, false) : done(null, user);
  });
});

passport.use(jwtLogin);
