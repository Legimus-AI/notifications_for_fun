import BaseRouter from './BaseRouter';
import controller from '../../controllers/cities.controller';

const authMiddlewares = [];
class ResourceRouter extends BaseRouter {
  constructor() {
    super(controller, authMiddlewares);
    // Add custom route
    super.getRouter().get('/custom-route', (req, res) => {
      res.status(200).json({ message: 'Custom route' });
    });
    // Initialize rest of CRUD routes
    this.setupRoutes();
  }
}

const router = new ResourceRouter();

export default router.getRouter();
