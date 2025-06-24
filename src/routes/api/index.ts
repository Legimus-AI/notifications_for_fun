import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router: Router = express.Router();
const routesPath: string = `${__dirname}/`;

/*
 * Load routes statically and/or dynamically
 */

async function loadRoutes() {
  // Load Auth route
  await import('./auth').then((authRoute) => {
    router.use('/', authRoute.default);
  });

  // Read all files in the directory
  const files = fs.readdirSync(routesPath);
  for (const file of files) {
    // Get the name of the file without its extension
    const routeFile = path.basename(file, path.extname(file));

    // Prevents loading of this file
    if (routeFile !== 'index') {
      // Dynamically import the route and use it
      const route = await import(`./${routeFile}`);
      router.use(`/${routeFile}`, route.default);
    }
  }
  /*
   * Setup routes for index
   */
  router.get('/', (req: Request, res: Response) => {
    res.json({ ok: true, msg: 'API is working!' });
  });

  /*
   * Handle 404 error
   */
  router.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      errors: {
        msg: 'URL_NOT_FOUND',
      },
    });
  });
  return router;
}

export { loadRoutes };
