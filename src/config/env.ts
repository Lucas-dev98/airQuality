import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.join(process.cwd(), 'private/.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  OPENWEATHER_API_KEY: z.string().optional(),
  OPEN_WEATHER_API_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  CACHE_TTL_MS: z.coerce.number().default(10 * 60 * 1000),
  STATIC_CACHE_MAX_AGE_SECONDS: z.coerce.number().default(24 * 60 * 60),
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().email().optional(),
  REDIS_URL: z.string().optional(),
  REDIS_PREFIX: z.string().default('air-quality'),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  OPENWEATHER_API_KEY: parsed.OPENWEATHER_API_KEY || parsed.OPEN_WEATHER_API_KEY,
};
