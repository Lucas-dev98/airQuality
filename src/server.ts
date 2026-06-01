import { env } from './config/env';
import { logger } from './lib/logger';
import { createApp } from './app';

const app = createApp();

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    logger.info(`Server running at http://localhost:${env.PORT}`);
  });
}

export { app };
