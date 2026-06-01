import { z } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../errors/http-error';

const unitsSchema = z.enum(['metric', 'imperial']).default('metric');
const langSchema = z.string().default('pt_br');

export type Units = z.infer<typeof unitsSchema>;

export function parseUnits(value: unknown): Units {
  return unitsSchema.parse(value);
}

export function parseLang(value: unknown): string {
  return langSchema.parse(value);
}

export function ensureApiKey(): string {
  if (!env.OPENWEATHER_API_KEY) {
    throw new HttpError(500, 'Chave da OpenWeather nao configurada no servidor.');
  }

  return env.OPENWEATHER_API_KEY;
}

function mapOpenWeatherError(status: number, message?: string): string {
  if (status === 401) {
    return 'Chave da OpenWeather invalida ou nao autorizada.';
  }

  if (status === 404) {
    return 'Localizacao nao encontrada. Tente cidade, estado ou pais.';
  }

  if (status === 429) {
    return 'Limite de requisicoes atingido. Aguarde alguns minutos e tente novamente.';
  }

  return message || 'Nao foi possivel obter os dados climaticos no momento.';
}

export async function fetchOpenWeather<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new HttpError(response.status, mapOpenWeatherError(response.status, data?.message));
  }

  return data as T;
}
