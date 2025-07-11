import BaseRouter from './BaseRouter';
import controller from '../../controllers/WhatsAppEvents.controller';

const authMiddlewares = [];
class ResourceRouter extends BaseRouter {
  constructor() {
    super(controller, authMiddlewares);
    // Initialize rest of CRUD routes
    this.setupRoutes();
  }
}

const router = new ResourceRouter();

export default router.getRouter();
