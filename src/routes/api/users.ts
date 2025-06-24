import BaseRouter from './BaseRouter';
import controller from '../../controllers/users.controller';

class ResourceRouter extends BaseRouter {
  constructor() {
    super(controller, []);
    this.setupRoutes();
  }
}

const router = new ResourceRouter();

export default router.getRouter();
