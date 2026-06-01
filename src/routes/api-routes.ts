import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { getCacheStore } from '../lib/cache-factory';
import { getGeofences, upsertGeofences } from '../lib/geofence-store';
import { getProfile, shouldSendEmailAlert, upsertProfile } from '../lib/profile-store';
import { HttpError } from '../errors/http-error';
import { ensureApiKey, fetchOpenWeather, parseLang, parseUnits } from '../services/openweather-service';

const cache = getCacheStore();
const router = Router();

const weatherQuerySchema = z.object({
  location: z.string().trim().optional(),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  units: z.enum(['metric', 'imperial']).optional(),
  lang: z.string().optional(),
});

const geocodeQuerySchema = z.object({
  location: z.string().trim().min(1),
  limit: z.coerce.number().min(1).max(5).optional(),
});

const reverseQuerySchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  limit: z.coerce.number().min(1).max(5).optional(),
});

const historyQuerySchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  units: z.enum(['metric', 'imperial']).optional(),
  lang: z.string().optional(),
  days: z.coerce.number().min(1).max(3).optional(),
});

const profileSchema = z.object({
  locale: z.enum(['pt', 'en']),
  email: z.string().email().optional().or(z.literal('')),
  alertPreferences: z.object({
    heatThreshold: z.coerce.number(),
    rainThreshold: z.coerce.number().min(0).max(1),
    windThreshold: z.coerce.number(),
    aqiThreshold: z.coerce.number().min(1).max(5),
    notificationsEnabled: z.boolean(),
  }).optional(),
});

const weatherTileSchema = z.object({
  layer: z.enum(['temp_new', 'precipitation_new', 'clouds_new', 'pressure_new', 'wind_new']),
  z: z.coerce.number().min(0).max(18),
  x: z.coerce.number().min(0),
  y: z.coerce.number().min(0),
  ts: z.coerce.number().optional(),
});

const deliverAlertSchema = z.object({
  profileId: z.string().trim().min(1),
  location: z.string().trim().min(1),
  alerts: z.array(z.string().trim().min(1)).min(1),
});

const geofenceBodySchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: z.object({
      type: z.string(),
      coordinates: z.unknown(),
    }),
    properties: z.record(z.string(), z.unknown()).optional().default({}),
  })),
});

type LocationResolution = {
  lat: number;
  lon: number;
  label?: string;
};

type GeoResult = {
  name: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
};

function hasCoordinates(lat?: number, lon?: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function normalizeLocation(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toGeoResults(data: Array<Record<string, unknown>>): GeoResult[] {
  return data
    .map((item) => {
      const nominatimAddress = item.address as Record<string, unknown> | undefined;
      const name = String(item.name || item.display_name || nominatimAddress?.city || nominatimAddress?.town || nominatimAddress?.village || nominatimAddress?.hamlet || '');
      const state = String(item.state || nominatimAddress?.state || '').trim() || undefined;
      const country = String(item.country || nominatimAddress?.country || '').trim() || undefined;
      const lat = Number(item.lat ?? item.latitude);
      const lon = Number(item.lon ?? item.lng ?? item.longitude);

      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return { name, state, country, lat, lon };
    })
    .filter((item): item is GeoResult => Boolean(item));
}

async function resolveLocationToCoordinates(location: string, apiKey: string): Promise<LocationResolution | null> {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return null;
  }

  const cacheKey = cache.buildKey('location-resolve', normalized.toLowerCase());
  const cached = await cache.get<LocationResolution>(cacheKey);
  if (cached) {
    return cached;
  }

  const providers = [
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(normalized)}`,
    `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(normalized)}&limit=1&appid=${apiKey}`,
  ];

  for (const url of providers) {
    try {
      const data = await fetchOpenWeather<Array<Record<string, unknown>>>(url);
      const first = data[0];
      if (!first) {
        continue;
      }

      const lat = Number(first.lat ?? first.latitude);
      const lon = Number(first.lon ?? first.lng ?? first.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      const label = [first.name, first.state, first.country].filter(Boolean).join(', ') || normalized;
      const resolved = { lat, lon, label };
      await cache.set(cacheKey, resolved);
      return resolved;
    } catch {
      continue;
    }
  }

  return null;
}

async function maybeSendEmailAlert(opts: { to: string; subject: string; body: string }) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM) {
    return;
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.ALERT_EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: `<p>${opts.body}</p>`,
    }),
  });
}

router.get('/keys', (_req, res) => {
  res.json({ hasOpenWeatherApiKey: Boolean(env.OPENWEATHER_API_KEY) });
});

router.get('/weather', async (req, res, next) => {
  try {
    const query = weatherQuerySchema.parse(req.query);
    const location = normalizeLocation(query.location || '');
    const lat = query.lat;
    const lon = query.lon;
    const units = parseUnits(query.units);
    const lang = parseLang(query.lang);
    const apiKey = ensureApiKey();

    if (!location && !hasCoordinates(lat, lon)) {
      throw new HttpError(400, 'Informe uma localizacao valida ou latitude/longitude.');
    }

    const resolvedLocation = !hasCoordinates(lat, lon) ? await resolveLocationToCoordinates(location, apiKey) : null;
    const effectiveLat = hasCoordinates(lat, lon) ? lat : resolvedLocation?.lat;
    const effectiveLon = hasCoordinates(lat, lon) ? lon : resolvedLocation?.lon;

    if (!location && !hasCoordinates(effectiveLat, effectiveLon)) {
      throw new HttpError(400, 'Informe uma localizacao valida ou latitude/longitude.');
    }

    const queryKey = hasCoordinates(effectiveLat, effectiveLon)
      ? `${effectiveLat}|${effectiveLon}|${units}|${lang}`
      : `${location}|${units}|${lang}`;
    const cacheKey = cache.buildKey('weather', queryKey);
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached, _cache: true });
      return;
    }

    if (!hasCoordinates(effectiveLat, effectiveLon)) {
      throw new HttpError(404, 'Localizacao nao encontrada. Tente cidade, bairro, endereco ou ponto de referencia.');
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${effectiveLat}&lon=${effectiveLon}&appid=${apiKey}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`;
    const data = await fetchOpenWeather<Record<string, unknown>>(url);
    await cache.set(cacheKey, data);
    res.json({ ...data, _cache: false });
  } catch (error) {
    next(error);
  }
});

router.get('/forecast', async (req, res, next) => {
  try {
    const query = weatherQuerySchema.parse(req.query);
    const location = normalizeLocation(query.location || '');
    const lat = query.lat;
    const lon = query.lon;
    const units = parseUnits(query.units);
    const lang = parseLang(query.lang);
    const apiKey = ensureApiKey();

    if (!location && !hasCoordinates(lat, lon)) {
      throw new HttpError(400, 'Informe uma localizacao valida ou latitude/longitude.');
    }

    const resolvedLocation = !hasCoordinates(lat, lon) ? await resolveLocationToCoordinates(location, apiKey) : null;
    const effectiveLat = hasCoordinates(lat, lon) ? lat : resolvedLocation?.lat;
    const effectiveLon = hasCoordinates(lat, lon) ? lon : resolvedLocation?.lon;

    if (!location && !hasCoordinates(effectiveLat, effectiveLon)) {
      throw new HttpError(400, 'Informe uma localizacao valida ou latitude/longitude.');
    }

    const queryKey = hasCoordinates(effectiveLat, effectiveLon)
      ? `${effectiveLat}|${effectiveLon}|${units}|${lang}`
      : `${location}|${units}|${lang}`;
    const cacheKey = cache.buildKey('forecast', queryKey);
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached, _cache: true });
      return;
    }

    if (!hasCoordinates(effectiveLat, effectiveLon)) {
      throw new HttpError(404, 'Localizacao nao encontrada. Tente cidade, bairro, endereco ou ponto de referencia.');
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${effectiveLat}&lon=${effectiveLon}&appid=${apiKey}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`;
    const data = await fetchOpenWeather<Record<string, unknown>>(url);
    await cache.set(cacheKey, data);
    res.json({ ...data, _cache: false });
  } catch (error) {
    next(error);
  }
});

router.get('/geocode', async (req, res, next) => {
  try {
    const query = geocodeQuerySchema.parse(req.query);
    const limit = query.limit || 1;
    const apiKey = ensureApiKey();
    const location = normalizeLocation(query.location);

    const cacheKey = cache.buildKey('geocode', `${location}|${limit}`);
    const cached = await cache.get<unknown[]>(cacheKey);
    if (cached) {
      res.json({ results: cached, _cache: true });
      return;
    }

    const nominatim = await fetchOpenWeather<Array<Record<string, unknown>>>(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(location)}`)
      .catch(() => [] as Array<Record<string, unknown>>);
    const owm = await fetchOpenWeather<Array<Record<string, unknown>>>(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=${limit}&appid=${apiKey}`)
      .catch(() => [] as Array<Record<string, unknown>>);

    const results = [...toGeoResults(nominatim), ...toGeoResults(owm)].slice(0, limit);
    await cache.set(cacheKey, results);
    res.json({ results, _cache: false });
  } catch (error) {
    next(error);
  }
});

router.get('/uv-index', async (req, res, next) => {
  try {
    const query = historyQuerySchema.pick({ lat: true, lon: true, units: true, lang: true }).parse(req.query);
    const apiKey = ensureApiKey();
    const units = parseUnits(query.units);
    const lang = parseLang(query.lang);

    const cacheKey = cache.buildKey('uv-index', `${query.lat}|${query.lon}|${units}|${lang}`);
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached, _cache: true });
      return;
    }

    try {
      const data = await fetchOpenWeather<Record<string, unknown>>(
        `https://api.openweathermap.org/data/3.0/onecall?lat=${query.lat}&lon=${query.lon}&exclude=minutely,daily,alerts&appid=${apiKey}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`,
      );
      await cache.set(cacheKey, data);
      res.json({ ...data, _cache: false, unavailable: false });
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 401) {
        res.json({ current: {}, _cache: false, unavailable: true });
        return;
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.get('/weather-history', async (req, res, next) => {
  try {
    const query = historyQuerySchema.parse(req.query);
    const apiKey = ensureApiKey();
    const units = parseUnits(query.units);
    const lang = parseLang(query.lang);
    const days = query.days || 2;

    const cacheKey = cache.buildKey('weather-history', `${query.lat}|${query.lon}|${units}|${lang}|${days}`);
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached, _cache: true });
      return;
    }

    const requests = Array.from({ length: days }).map((_, index) => {
      const dayOffset = index + 1;
      const dt = Math.floor((Date.now() - dayOffset * 24 * 60 * 60 * 1000) / 1000);
      return fetchOpenWeather<Record<string, unknown>>(
        `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${query.lat}&lon=${query.lon}&dt=${dt}&appid=${apiKey}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`,
      );
    });

    try {
      const list = await Promise.all(requests);
      const payload = { list };
      await cache.set(cacheKey, payload);
      res.json({ ...payload, _cache: false, unavailable: false });
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 401) {
        res.json({ list: [], _cache: false, unavailable: true });
        return;
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.get('/reverse-geocode', async (req, res, next) => {
  try {
    const query = reverseQuerySchema.parse(req.query);
    const limit = query.limit || 1;
    const apiKey = ensureApiKey();

    const cacheKey = cache.buildKey('reverse-geocode', `${query.lat}|${query.lon}|${limit}`);
    const cached = await cache.get<unknown[]>(cacheKey);
    if (cached) {
      res.json({ results: cached, _cache: true });
      return;
    }

    const data = await fetchOpenWeather<unknown[]>(`https://api.openweathermap.org/geo/1.0/reverse?lat=${query.lat}&lon=${query.lon}&limit=${limit}&appid=${apiKey}`);
    await cache.set(cacheKey, data);
    res.json({ results: data, _cache: false });
  } catch (error) {
    next(error);
  }
});

router.get('/air-quality', async (req, res, next) => {
  try {
    const query = reverseQuerySchema.pick({ lat: true, lon: true }).parse(req.query);
    const apiKey = ensureApiKey();

    const cacheKey = cache.buildKey('air-quality', `${query.lat}|${query.lon}`);
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached, _cache: true });
      return;
    }

    const data = await fetchOpenWeather<Record<string, unknown>>(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${query.lat}&lon=${query.lon}&appid=${apiKey}`);
    await cache.set(cacheKey, data);
    res.json({ ...data, _cache: false });
  } catch (error) {
    next(error);
  }
});

router.get('/air-quality-forecast', async (req, res, next) => {
  try {
    const query = reverseQuerySchema.pick({ lat: true, lon: true }).parse(req.query);
    const apiKey = ensureApiKey();

    const cacheKey = cache.buildKey('air-quality-forecast', `${query.lat}|${query.lon}`);
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached, _cache: true });
      return;
    }

    const data = await fetchOpenWeather<Record<string, unknown>>(`https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${query.lat}&lon=${query.lon}&appid=${apiKey}`);
    await cache.set(cacheKey, data);
    res.json({ ...data, _cache: false });
  } catch (error) {
    next(error);
  }
});

router.get('/user-preferences/:profileId', (req, res, next) => {
  try {
    const profileId = req.params.profileId?.trim();
    if (!profileId) {
      throw new HttpError(400, 'profileId invalido.');
    }

    const profile = getProfile(profileId);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.put('/user-preferences/:profileId', (req, res, next) => {
  try {
    const profileId = req.params.profileId?.trim();
    if (!profileId) {
      throw new HttpError(400, 'profileId invalido.');
    }

    const parsed = profileSchema.parse(req.body || {});
    const profile = upsertProfile({
      id: profileId,
      locale: parsed.locale,
      email: parsed.email || undefined,
      alertPreferences: parsed.alertPreferences,
      updatedAt: Date.now(),
    });

    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.post('/deliver-alert', async (req, res, next) => {
  try {
    const parsed = deliverAlertSchema.parse(req.body || {});
    const profile = getProfile(parsed.profileId);
    if (!profile || !profile.email) {
      res.json({ delivered: false, reason: 'missing-email' });
      return;
    }

    if (!shouldSendEmailAlert(parsed.profileId)) {
      res.json({ delivered: false, reason: 'deduped' });
      return;
    }

    const body = `Local: ${parsed.location}<br/>Alertas:<br/>- ${parsed.alerts.join('<br/>- ')}`;
    await maybeSendEmailAlert({
      to: profile.email,
      subject: 'Alerta climatico persistente',
      body,
    });

    res.json({ delivered: Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL_FROM) });
  } catch (error) {
    next(error);
  }
});

router.get('/geofences/:profileId', (req, res, next) => {
  try {
    const profileId = req.params.profileId?.trim();
    if (!profileId) {
      throw new HttpError(400, 'profileId invalido.');
    }

    const geofences = getGeofences(profileId);
    res.json({ geofences });
  } catch (error) {
    next(error);
  }
});

router.put('/geofences/:profileId', (req, res, next) => {
  try {
    const profileId = req.params.profileId?.trim();
    if (!profileId) {
      throw new HttpError(400, 'profileId invalido.');
    }

    const parsed = geofenceBodySchema.parse(req.body || {});
    const geofences = upsertGeofences(profileId, parsed);
    res.json({ geofences });
  } catch (error) {
    next(error);
  }
});

router.get('/weather-tile/:layer/:z/:x/:y.png', async (req, res, next) => {
  try {
    const query = weatherTileSchema.parse({
      layer: req.params.layer,
      z: req.params.z,
      x: req.params.x,
      y: req.params.y,
      ts: req.query.ts,
    });
    const apiKey = ensureApiKey();
    const tsQuery = query.ts ? `&date=${query.ts}` : '';
    const url = `https://tile.openweathermap.org/map/${query.layer}/${query.z}/${query.x}/${query.y}.png?appid=${apiKey}${tsQuery}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new HttpError(response.status, 'Falha ao obter tile climatico.');
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const cacheControl = response.headers.get('cache-control') || 'public, max-age=300';
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export { router as apiRoutes };
