import express, { Router } from 'express';
import passport from 'passport';
import trimRequest from 'trim-request';
import * as controller from '../../controllers/auth.controller';
import * as validate from '../../controllers/auth.validate';

const router: Router = express.Router();
import '../../config/passport';

const requireAuth = passport.authenticate('jwt', {
  session: false,
});

/*
 * Auth routes
 */

/*
 * Register route
 */
router.post(
  '/register',
  trimRequest.all,
  validate.register,
  controller.register,
);

/*
 * Verify route
 */
router.post('/verify', trimRequest.all, validate.verify, controller.verify);

/*
 * Forgot password route
 */
router.post(
  '/forgot',
  trimRequest.all,
  validate.forgotPassword,
  controller.forgotPassword,
);

/*
 * Reset password route
 */
router.post(
  '/reset',
  trimRequest.all,
  validate.resetPassword,
  controller.resetPassword,
);

/*
 * Get new refresh token
 */
router.get(
  '/token',
  requireAuth,
  controller.roleAuthorization(['USER', 'ADMIN', 'SUPERADMIN']),
  trimRequest.all,
  controller.getRefreshToken,
);

/*
 * Login route
 */
router.post('/login', trimRequest.all, validate.login, controller.login);

export default router;
