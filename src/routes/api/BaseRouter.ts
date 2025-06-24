import express, { Router, RequestHandler } from 'express';
import passport from 'passport';
import trimRequest from 'trim-request';
import * as AuthController from '../../controllers/auth.controller';

const requireAuth = passport.authenticate('jwt', {
  session: false,
});

class BaseRouter {
  router: Router;
  controller: any; // You might want to type this more strictly
  authMiddlewares: RequestHandler[];

  constructor(controller: any, authMiddlewares?: RequestHandler[]) {
    this.router = express.Router();
    this.controller = controller;

    this.authMiddlewares = authMiddlewares || [
      requireAuth,
      AuthController.roleAuthorization(['SUPERADMIN', 'ADMIN']),
    ];
  }

  setAuthMiddlewares(middlewares: RequestHandler[]) {
    this.authMiddlewares = middlewares;
  }

  getAuthMiddlewares(): RequestHandler[] {
    return this.authMiddlewares;
  }

  setupRoutes() {
    this.router.get(
      '/all',
      this.authMiddlewares,
      trimRequest.all,
      this.controller.listAll,
    );

    this.router.get(
      '/',
      this.authMiddlewares,
      trimRequest.all,
      this.controller.list,
    );

    this.router.post(
      '/',
      this.authMiddlewares,
      trimRequest.all,
      this.controller.validation.create,
      this.controller.create,
    );

    this.router.get(
      '/:id',
      this.authMiddlewares,
      trimRequest.all,
      this.controller.validation.listOne,
      this.controller.listOne,
    );

    this.router.put(
      '/:id',
      this.authMiddlewares,
      trimRequest.all,
      this.controller.validation.update,
      this.controller.update,
    );

    this.router.delete(
      '/:id',
      this.authMiddlewares,
      trimRequest.all,
      this.controller.validation.delete,
      this.controller.delete,
    );
  }

  getRouter(): Router {
    return this.router;
  }
}

export default BaseRouter;
