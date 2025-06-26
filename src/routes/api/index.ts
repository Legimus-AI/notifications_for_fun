import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router: Router = express.Router();
const routesPath: string = `${__dirname}/`;

/*
 * Load routes statically and/or dynamically
 */

async function loadRoutes() {
  // Read all route files except for the current file (index.ts or index.js)
  const routeFiles = fs
    .readdirSync(routesPath)
    .filter((file) => file !== 'index.ts' && file !== 'index.js');

  // Dynamically import each route file and configure the route
  await Promise.all(
    routeFiles.map(async (file) => {
      const routeFile = path.basename(file, path.extname(file));
      try {
        const route = await import(`${routesPath}${routeFile}`);
        // Use a specific base path for certain routes if needed, or default to the file name
        const basePath = route.basePath || `/${routeFile}`;
        if (route && route.default) {
          router.use(basePath, route.default);
        }
      } catch (error) {
        console.error(`Failed to load route '${routeFile}':`, error);
      }
    }),
  );

  // Optional: Setup a generic index route or 404 handler
  // Index Route Example:
  router.get('/', (req: Request, res: Response) => {
    res.json({ ok: true, msg: 'API is working!' });
  });

  // 404 Error Handler
  router.use('*', (req: Request, res: Response) => {
    res.status(404).json({ errors: { msg: 'URL_NOT_FOUND' } });
  });

  return router;
}

export { loadRoutes };
