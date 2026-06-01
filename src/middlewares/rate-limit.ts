import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';

export const apiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  keyGenerator: (req) => {
    const clientId = req.header('x-client-id')?.trim() || 'anonymous';
    return `${ipKeyGenerator(req.ip || 'unknown')}:${clientId}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite de requisicoes atingido. Aguarde alguns minutos e tente novamente.',
  },
});
