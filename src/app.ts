import fs from 'fs';
import path from 'path';
import cors from 'cors';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { apiRateLimit } from './middlewares/rate-limit';
import { apiRoutes } from './routes/api-routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN }));
  app.use(compression());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.use('/image', express.static(path.join(process.cwd(), 'image'), {
    maxAge: env.STATIC_CACHE_MAX_AGE_SECONDS * 1000,
  }));
  app.use('/api', apiRateLimit, apiRoutes);

  const clientDistPath = path.join(process.cwd(), 'client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath, {
      maxAge: env.STATIC_CACHE_MAX_AGE_SECONDS * 1000,
    }));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }

      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
