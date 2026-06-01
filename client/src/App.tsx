import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import styles from './App.module.css';
import { getJson } from './lib/http';

const LineChart = lazy(() => import('./components/LazyLineChart'));
const WeatherMap = lazy(() => import('./components/WeatherMap'));

type Units = 'metric' | 'imperial';
type Theme = 'light' | 'dark';
type Locale = 'pt' | 'en';

type GeoResult = {
  name: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
};

type WeatherData = {
  name: string;
  coord: { lat: number; lon: number };
  main: { temp: number; feels_like: number; humidity: number; temp_min?: number; temp_max?: number };
  wind: { speed: number; deg?: number };
  visibility?: number;
  weather: Array<{ main: string; description: string }>;
  sys?: { country?: string; sunrise?: number; sunset?: number };
  _cache?: boolean;
};

type ForecastEntry = {
  dt: number;
  dt_txt: string;
  pop?: number;
  main: { temp: number; humidity: number };
  wind?: { speed: number };
  weather: Array<{ main: string; description: string }>;
};

type ForecastData = { list: ForecastEntry[]; _cache?: boolean };

type AirQualityData = {
  list: Array<{
    main: { aqi: number };
    components: {
      pm2_5?: number;
      pm10?: number;
      no2?: number;
      o3?: number;
    };
  }>;
  _cache?: boolean;
};

type AirQualityForecastData = {
  list: Array<{
    dt: number;
    components: { pm2_5?: number; pm10?: number };
  }>;
  _cache?: boolean;
};

type UvIndexData = {
  current?: { uvi?: number };
  _cache?: boolean;
  unavailable?: boolean;
};

type HistoryData = {
  list: Array<{ current?: { temp?: number; dt?: number } }>;
  _cache?: boolean;
  unavailable?: boolean;
};

type AlertPreferences = {
  heatThreshold: number;
  rainThreshold: number;
  windThreshold: number;
  aqiThreshold: number;
  notificationsEnabled: boolean;
};

const FAVORITES_KEY = 'airQuality:favorites';
const HISTORY_KEY = 'airQuality:history';
const THEME_KEY = 'airQuality:theme';
const ALERT_PREFS_KEY = 'airQuality:alert-preferences';
const LOCALE_KEY = 'airQuality:locale';
const PROFILE_ID_KEY = 'airQuality:profile-id';
const MAX_FAVORITES = 8;
const MAX_HISTORY = 10;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const TEXT: Record<Locale, Record<string, string>> = {
  pt: {
    title: 'Condições Climáticas Atuais',
    location: 'Localizacao',
    search: 'Obter clima',
    useLocation: 'Usar minha localizacao',
    favorites: 'Favoritos',
    history: 'Historico',
    alerts: 'Alertas',
    language: 'Idioma',
    theme: 'Tema',
    dark: 'Escuro',
    light: 'Claro',
    compare: 'Comparador de cidades',
    mapTitle: 'Mapa climático (Mapbox)',
    weatherSearchFeedback: 'Buscando dados automaticamente...',
    suggestFeedback: 'Buscando sugestoes...',
    multiCity: 'Painel multi-cidades',
    addCity: 'Adicionar cidade',
    emailLabel: 'Email para alertas persistentes',
  },
  en: {
    title: 'Current Climate Conditions',
    location: 'Location',
    search: 'Get weather',
    useLocation: 'Use my location',
    favorites: 'Favorites',
    history: 'History',
    alerts: 'Alerts',
    language: 'Language',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    compare: 'City comparison',
    mapTitle: 'Climate map (Mapbox)',
    weatherSearchFeedback: 'Auto-searching weather data...',
    suggestFeedback: 'Loading suggestions...',
    multiCity: 'Multi-city dashboard',
    addCity: 'Add city',
    emailLabel: 'Email for persistent alerts',
  },
};

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function readStorageList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorageList(key: string, items: string[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

function getInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY);
  return stored === 'en' ? 'en' : 'pt';
}

function getOrCreateProfileId(): string {
  const existing = localStorage.getItem(PROFILE_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = `profile-${crypto.randomUUID()}`;
  localStorage.setItem(PROFILE_ID_KEY, next);
  return next;
}

function normalizeLocationQuery(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getDefaultAlertPreferences(units: Units): AlertPreferences {
  return {
    heatThreshold: units === 'imperial' ? 95 : 35,
    rainThreshold: 0.6,
    windThreshold: units === 'imperial' ? 18 : 8,
    aqiThreshold: 3,
    notificationsEnabled: false,
  };
}

function getInitialAlertPreferences(units: Units): AlertPreferences {
  const defaultPrefs = getDefaultAlertPreferences(units);

  try {
    const parsed = JSON.parse(localStorage.getItem(ALERT_PREFS_KEY) || '{}') as Partial<AlertPreferences>;
    return {
      ...defaultPrefs,
      ...parsed,
    };
  } catch {
    return defaultPrefs;
  }
}

function getAqiMeta(index?: number): { label: string; className: string } {
  const map: Record<number, { label: string; className: string }> = {
    1: { label: 'Bom', className: 'aqiGood' },
    2: { label: 'Razoavel', className: 'aqiFair' },
    3: { label: 'Moderado', className: 'aqiModerate' },
    4: { label: 'Ruim', className: 'aqiPoor' },
    5: { label: 'Muito ruim', className: 'aqiVeryPoor' },
  };

  return map[index || 0] || { label: 'N/D', className: 'aqiUnknown' };
}

function formatUnitSymbol(units: Units): string {
  return units === 'imperial' ? '°F' : '°C';
}

function buildShareUrl(location: string, units: Units): string {
  const url = new URL(window.location.href);
  url.searchParams.set('q', location);
  url.searchParams.set('units', units);
  return url.toString();
}

function App() {
  const [location, setLocation] = useState('');
  const [compareLocation, setCompareLocation] = useState('');
  const [multiCityInput, setMultiCityInput] = useState('');
  const [multiCities, setMultiCities] = useState<string[]>([]);
  const [multiCityData, setMultiCityData] = useState<WeatherData[]>([]);
  const [multiCityLoading, setMultiCityLoading] = useState(false);
  const [units, setUnits] = useState<Units>('metric');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [shareStatus, setShareStatus] = useState('');
  const [profileId] = useState(getOrCreateProfileId);
  const [profileEmail, setProfileEmail] = useState('');
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [autoSearchLoading, setAutoSearchLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isCachedResult, setIsCachedResult] = useState(false);
  const [mapAlerts, setMapAlerts] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => readStorageList(FAVORITES_KEY));
  const [history, setHistory] = useState<string[]>(() => readStorageList(HISTORY_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [resolvedLocation, setResolvedLocation] = useState('');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [airData, setAirData] = useState<AirQualityData | null>(null);
  const [airForecastData, setAirForecastData] = useState<AirQualityForecastData | null>(null);
  const [uvData, setUvData] = useState<UvIndexData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);

  const [compareData, setCompareData] = useState<WeatherData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');

  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences>(() => getInitialAlertPreferences('metric'));

  const searchDebounceRef = useRef<number | null>(null);
  const suggestionDebounceRef = useRef<number | null>(null);

  const t = (key: string): string => TEXT[locale][key] || key;

  const syncProfile = async (nextPrefs: AlertPreferences, nextLocale: Locale, email?: string) => {
    try {
      await getJson(apiUrl(`/api/user-preferences/${encodeURIComponent(profileId)}`), {
        method: 'PUT',
        clientId: profileId,
        body: {
          locale: nextLocale,
          email: email || profileEmail,
          alertPreferences: nextPrefs,
        },
      });
    } catch {
      // Keep local settings as fallback when profile sync fails.
    }
  };

  const saveHistory = (value: string) => {
    const next = [value, ...history.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, MAX_HISTORY);
    setHistory(next);
    writeStorageList(HISTORY_KEY, next);
  };

  const saveFavorite = (value: string) => {
    if (!value.trim()) return;
    if (favorites.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    const next = [value, ...favorites].slice(0, MAX_FAVORITES);
    setFavorites(next);
    writeStorageList(FAVORITES_KEY, next);
  };

  const shareCurrentSearch = async () => {
    if (!resolvedLocation) {
      return;
    }

    const url = buildShareUrl(resolvedLocation, units);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Link copiado para a area de transferencia.');
    } catch {
      setShareStatus(`Copie manualmente: ${url}`);
    }
  };

  const runCompareSearch = async () => {
    if (!compareLocation.trim()) {
      setCompareError('Informe uma cidade para comparar.');
      return;
    }

    setCompareLoading(true);
    setCompareError('');
    try {
      const normalized = normalizeLocationQuery(compareLocation);
      const data = await getJson<WeatherData>(
        apiUrl(`/api/weather?location=${encodeURIComponent(normalized)}&units=${units}&lang=${locale === 'pt' ? 'pt_br' : 'en'}`),
        { clientId: profileId },
      );
      setCompareData(data);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Falha ao comparar cidades.');
    } finally {
      setCompareLoading(false);
    }
  };

  const runSearch = async (opts?: { lat?: number; lon?: number; location?: string }) => {
    const queryLocation = normalizeLocationQuery(opts?.location ?? location);
    const hasCoords = Number.isFinite(opts?.lat) && Number.isFinite(opts?.lon);

    if (!queryLocation && !hasCoords) {
      setError('Informe uma localizacao valida.');
      return;
    }

    setLoading(true);
    setError('');
    setShareStatus('');

    try {
      const lang = locale === 'pt' ? 'pt_br' : 'en';
      const weatherUrl = hasCoords
        ? apiUrl(`/api/weather?lat=${opts?.lat}&lon=${opts?.lon}&units=${units}&lang=${lang}`)
        : apiUrl(`/api/weather?location=${encodeURIComponent(queryLocation)}&units=${units}&lang=${lang}`);
      const forecastUrl = hasCoords
        ? apiUrl(`/api/forecast?lat=${opts?.lat}&lon=${opts?.lon}&units=${units}&lang=${lang}`)
        : apiUrl(`/api/forecast?location=${encodeURIComponent(queryLocation)}&units=${units}&lang=${lang}`);

      const [current, forecast] = await Promise.all([
        getJson<WeatherData>(weatherUrl, { clientId: profileId }),
        getJson<ForecastData>(forecastUrl, { clientId: profileId }),
      ]);

      const [reverse, aqi, aqiForecast] = await Promise.all([
        getJson<{ results: GeoResult[] }>(apiUrl(`/api/reverse-geocode?lat=${current.coord.lat}&lon=${current.coord.lon}&limit=1`), { clientId: profileId }),
        getJson<AirQualityData>(apiUrl(`/api/air-quality?lat=${current.coord.lat}&lon=${current.coord.lon}`), { clientId: profileId }),
        getJson<AirQualityForecastData>(apiUrl(`/api/air-quality-forecast?lat=${current.coord.lat}&lon=${current.coord.lon}`), { clientId: profileId }),
      ]);

      const [uvResult, historyResult] = await Promise.allSettled([
        getJson<UvIndexData>(apiUrl(`/api/uv-index?lat=${current.coord.lat}&lon=${current.coord.lon}&units=${units}&lang=${lang}`), { clientId: profileId }),
        getJson<HistoryData>(apiUrl(`/api/weather-history?lat=${current.coord.lat}&lon=${current.coord.lon}&units=${units}&lang=${lang}&days=2`), { clientId: profileId }),
      ]);

      const uv = uvResult.status === 'fulfilled' ? uvResult.value : { current: {}, unavailable: true };
      const historyResponse = historyResult.status === 'fulfilled' ? historyResult.value : { list: [], unavailable: true };

      const first = reverse.results[0];
      const prettyLocation = first
        ? `${first.name}${first.state ? `, ${first.state}` : ''}${first.country ? `, ${first.country}` : ''}`
        : `${current.name}${current.sys?.country ? `, ${current.sys.country}` : ''}`;

      setResolvedLocation(prettyLocation);
      setLocation(prettyLocation);
      setWeatherData(current);
      setForecastData(forecast);
      setAirData(aqi);
      setAirForecastData(aqiForecast);
      setUvData(uv);
      setHistoryData(historyResponse);
      setIsCachedResult(Boolean(current._cache || forecast._cache || aqi._cache || aqiForecast._cache || uv._cache || historyResponse._cache));
      setLastUpdatedAt(Date.now());
      saveHistory(prettyLocation);

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('q', prettyLocation);
      nextUrl.searchParams.set('units', units);
      nextUrl.searchParams.set('ui', locale);
      window.history.replaceState({}, '', nextUrl.toString());
    } catch (err) {
      setError(err instanceof Error && err.name === 'AbortError'
        ? 'Tempo de resposta excedido. Tente novamente em instantes.'
        : err instanceof Error ? err.message : 'Erro inesperado durante a consulta.');
    } finally {
      setLoading(false);
      setAutoSearchLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const queryUnits = params.get('units');
    const queryUi = params.get('ui');

    if (queryUnits === 'metric' || queryUnits === 'imperial') {
      setUnits(queryUnits);
      setAlertPreferences(getInitialAlertPreferences(queryUnits));
    }

    if (queryUi === 'pt' || queryUi === 'en') {
      setLocale(queryUi);
    }

    if (query) {
      setLocation(query);
    }
  }, []);

  useEffect(() => {
    getJson<{ profile: { locale?: Locale; email?: string; alertPreferences?: AlertPreferences } | null }>(
      apiUrl(`/api/user-preferences/${encodeURIComponent(profileId)}`),
      { clientId: profileId },
    ).then((data) => {
      const profile = data.profile;
      if (!profile) {
        return;
      }

      if (profile.locale) {
        setLocale(profile.locale);
      }
      if (profile.email) {
        setProfileEmail(profile.email);
      }
      if (profile.alertPreferences) {
        setAlertPreferences((current) => ({ ...current, ...profile.alertPreferences }));
      }
    }).catch(() => {});
  }, [profileId]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    localStorage.setItem(ALERT_PREFS_KEY, JSON.stringify(alertPreferences));
    syncProfile(alertPreferences, locale).catch(() => {});
  }, [alertPreferences]);

  useEffect(() => {
    if (location.trim().length < 3) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    if (suggestionDebounceRef.current) {
      window.clearTimeout(suggestionDebounceRef.current);
    }

    suggestionDebounceRef.current = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const normalized = normalizeLocationQuery(location);
        const data = await getJson<{ results: GeoResult[] }>(apiUrl(`/api/geocode?location=${encodeURIComponent(normalized)}&limit=5`), { clientId: profileId });
        setSuggestions(data.results);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 350);

    return () => {
      if (suggestionDebounceRef.current) {
        window.clearTimeout(suggestionDebounceRef.current);
      }
    };
  }, [location]);

  useEffect(() => {
    if (location.trim().length < 3) {
      return;
    }

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(() => {
      setAutoSearchLoading(true);
      runSearch();
    }, 700);

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [location, units, locale]);

  const alerts = useMemo(() => {
    if (!weatherData || !forecastData || !airData) return [];
    const output = new Set<string>();
    const aqi = airData.list?.[0]?.main?.aqi;

    if (weatherData.main.temp >= alertPreferences.heatThreshold) {
      output.add(`Calor acima do limite pessoal (${alertPreferences.heatThreshold}${formatUnitSymbol(units)}).`);
    }

    const likelyRain = forecastData.list.some((item) => (item.pop || 0) >= alertPreferences.rainThreshold || item.weather.some((w) => w.main === 'Rain'));
    if (likelyRain) {
      output.add(`Probabilidade de chuva acima de ${(alertPreferences.rainThreshold * 100).toFixed(0)}%.`);
    }

    if (aqi && aqi >= alertPreferences.aqiThreshold) {
      output.add(`AQI acima do limite pessoal (${alertPreferences.aqiThreshold}).`);
    }

    if (weatherData.wind.speed >= alertPreferences.windThreshold) {
      output.add(`Vento acima do limite pessoal (${alertPreferences.windThreshold} ${units === 'imperial' ? 'mph' : 'm/s'}).`);
    }

    const hasThunderstorm = forecastData.list.some((item) =>
      item.weather.some((w) => w.main === 'Thunderstorm' || w.description.toLowerCase().includes('trovoada')),
    );
    if (hasThunderstorm) {
      output.add('Risco elevado: possibilidade de trovoadas nas proximas horas.');
    }

    const hasHeavyRain = forecastData.list.some((item) => {
      const description = item.weather?.[0]?.description?.toLowerCase() || '';
      return (item.pop || 0) >= 0.75 || description.includes('heavy rain') || description.includes('chuva forte');
    });
    if (hasHeavyRain) {
      output.add('Risco de chuva forte/alagamento. Evite deslocamentos em areas de risco.');
    }

    const hasStrongWind = forecastData.list.some((item) => (item.wind?.speed || 0) >= alertPreferences.windThreshold + 3);
    if (hasStrongWind) {
      output.add(`Risco de rajadas fortes de vento nas proximas horas (${units === 'imperial' ? 'mph' : 'm/s'}).`);
    }

    const hasHeatWave = forecastData.list.some((item) => item.main.temp >= alertPreferences.heatThreshold + 3);
    if (hasHeatWave) {
      output.add(`Risco de calor extremo acima de ${alertPreferences.heatThreshold + 3}${formatUnitSymbol(units)}.`);
    }

    return Array.from(output);
  }, [weatherData, forecastData, airData, alertPreferences, units]);

  const combinedAlerts = useMemo(() => {
    return Array.from(new Set([...alerts, ...mapAlerts]));
  }, [alerts, mapAlerts]);

  useEffect(() => {
    if (!alertPreferences.notificationsEnabled || combinedAlerts.length === 0) {
      return;
    }

    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification('Alerta climático', { body: combinedAlerts[0] });
      return;
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification('Alerta climático', { body: combinedAlerts[0] });
        }
      }).catch(() => {});
    }

    if (profileEmail && resolvedLocation) {
      getJson<{ delivered: boolean }>(apiUrl('/api/deliver-alert'), {
        method: 'POST',
        clientId: profileId,
        body: {
          profileId,
          location: resolvedLocation,
          alerts: combinedAlerts,
        },
      }).catch(() => {});
    }
  }, [combinedAlerts, alertPreferences.notificationsEnabled, profileEmail, resolvedLocation, profileId]);

  const groupedForecast = useMemo(() => {
    if (!forecastData) return [] as Array<{ date: string; entry: ForecastEntry }>;
    const grouped = forecastData.list.slice(0, 40).reduce<Record<string, ForecastEntry[]>>((acc, item) => {
      const date = item.dt_txt.split(' ')[0];
      acc[date] = acc[date] ? [...acc[date], item] : [item];
      return acc;
    }, {});

    return Object.entries(grouped).slice(0, 5).map(([date, items]) => ({
      date,
      entry: items.find((item) => item.dt_txt.includes('12:00:00')) || items[Math.floor(items.length / 2)],
    }));
  }, [forecastData]);

  const mapForecastPoints = useMemo(() => {
    return groupedForecast.map(({ date, entry }) => ({
      dt: entry.dt,
      label: new Date(`${date}T12:00:00`).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      description: entry.weather?.[0]?.description || 'Sem descricao',
      temperature: entry.main.temp,
      probability: entry.pop,
      windSpeed: entry.wind?.speed,
    }));
  }, [groupedForecast, locale]);

  const timelineMapPoints = useMemo(() => {
    const sample = forecastData?.list.slice(0, 12) || [];
    return sample.map((entry) => ({
      dt: entry.dt,
      label: new Date(entry.dt * 1000).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', hour: '2-digit' }),
      description: entry.weather?.[0]?.description || 'Sem descricao',
      temperature: entry.main.temp,
      probability: entry.pop,
      windSpeed: entry.wind?.speed,
    }));
  }, [forecastData, locale]);

  const mapMultiCityPoints = useMemo(() => {
    return multiCityData.map((item) => ({
      name: item.name,
      lat: item.coord.lat,
      lon: item.coord.lon,
      temperature: item.main.temp,
      description: item.weather?.[0]?.description || 'N/A',
    }));
  }, [multiCityData]);

  const aqiMeta = getAqiMeta(airData?.list?.[0]?.main?.aqi);
  const tempSymbol = formatUnitSymbol(units);

  const temperatureChartData = useMemo(() => {
    const sample = forecastData?.list.slice(0, 12) || [];
    return {
      labels: sample.map((item) => item.dt_txt.slice(5, 16)),
      datasets: [
        {
          label: `Temperatura (${tempSymbol})`,
          data: sample.map((item) => Number(item.main.temp.toFixed(1))),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.15)',
          fill: true,
          tension: 0.35,
        },
      ],
    };
  }, [forecastData, tempSymbol]);

  const pollutantChartData = useMemo(() => {
    const sample = airForecastData?.list.slice(0, 16) || [];
    return {
      labels: sample.map((item) => new Date(item.dt * 1000).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', hour: '2-digit' })),
      datasets: [
        {
          label: 'PM2.5',
          data: sample.map((item) => item.components.pm2_5 || 0),
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234, 88, 12, 0.15)',
          tension: 0.35,
        },
        {
          label: 'PM10',
          data: sample.map((item) => item.components.pm10 || 0),
          borderColor: '#0369a1',
          backgroundColor: 'rgba(3, 105, 161, 0.15)',
          tension: 0.35,
        },
      ],
    };
  }, [airForecastData, locale]);

  const historyChartData = useMemo(() => {
    const sample = historyData?.list || [];
    return {
      labels: sample.map((item, index) => {
        const dt = item.current?.dt;
        if (!dt) {
          return `D-${index + 1}`;
        }
        return new Date(dt * 1000).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit' });
      }),
      datasets: [
        {
          label: locale === 'pt' ? `Historico (${tempSymbol})` : `History (${tempSymbol})`,
          data: sample.map((item) => Number((item.current?.temp || 0).toFixed(1))),
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.15)',
          tension: 0.35,
        },
      ],
    };
  }, [historyData, locale, tempSymbol]);

  const pickLocationChip = (value: string) => {
    setLocation(value);
    runSearch({ location: value });
  };

  const addMultiCity = async () => {
    const normalized = normalizeLocationQuery(multiCityInput);
    if (!normalized || multiCities.some((item) => item.toLowerCase() === normalized.toLowerCase()) || multiCities.length >= 5) {
      return;
    }

    const next = [...multiCities, normalized];
    setMultiCities(next);
    setMultiCityInput('');
    setMultiCityLoading(true);

    try {
      const results = await Promise.all(next.map((city) =>
        getJson<WeatherData>(apiUrl(`/api/weather?location=${encodeURIComponent(city)}&units=${units}&lang=${locale === 'pt' ? 'pt_br' : 'en'}`), { clientId: profileId }),
      ));
      setMultiCityData(results);
    } catch {
      setMultiCityData([]);
    } finally {
      setMultiCityLoading(false);
    }
  };

  const removeMultiCity = (city: string) => {
    const next = multiCities.filter((item) => item !== city);
    setMultiCities(next);
    setMultiCityData((current) => current.filter((item) => item.name.toLowerCase() !== city.toLowerCase()));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocalizacao nao suportada neste navegador.');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        runSearch({ lat: Number(coords.latitude.toFixed(5)), lon: Number(coords.longitude.toFixed(5)) });
      },
      () => {
        setLoading(false);
        setError('Nao foi possivel acessar sua localizacao. Verifique as permissoes.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const comparisonSummary = useMemo(() => {
    if (!weatherData || !compareData) {
      return null;
    }

    const tempDiff = Number((weatherData.main.temp - compareData.main.temp).toFixed(1));
    const humidityDiff = weatherData.main.humidity - compareData.main.humidity;
    const windDiff = Number((weatherData.wind.speed - compareData.wind.speed).toFixed(1));

    return {
      tempDiff,
      humidityDiff,
      windDiff,
    };
  }, [weatherData, compareData]);

  return (
    <main className={styles.page}>
      <div className={styles.overlay} />
      <section className={styles.container}>
        <div className={styles.topBar}>
          <h1>{t('title')}</h1>
          <div className={styles.topBarActions}>
            <label htmlFor="localeSelect" className={styles.inlineLabel}>{t('language')}</label>
            <select
              id="localeSelect"
              aria-label={t('language')}
              value={locale}
              onChange={(event) => {
                const nextLocale = event.target.value as Locale;
                setLocale(nextLocale);
                syncProfile(alertPreferences, nextLocale).catch(() => {});
              }}
            >
              <option value="pt">PT-BR</option>
              <option value="en">EN</option>
            </select>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            aria-label={t('theme')}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {t('theme')}: {theme === 'dark' ? t('dark') : t('light')}
          </button>
        </div>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          <label htmlFor="location">{t('location')}</label>
          <input
            id="location"
            type="text"
            list="locationSuggestions"
            aria-label={t('location')}
            placeholder="Digite cidade ou endereco"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            required
          />
          <datalist id="locationSuggestions">
            {suggestions.map((item) => {
              const label = `${item.name}${item.state ? `, ${item.state}` : ''}${item.country ? `, ${item.country}` : ''}`;
              return <option key={`${item.lat}-${item.lon}-${label}`} value={label} />;
            })}
          </datalist>

          <label htmlFor="units">Unidade</label>
          <select id="units" value={units} onChange={(event) => setUnits(event.target.value as Units)}>
            <option value="metric">Metrico (°C, m/s)</option>
            <option value="imperial">Imperial (°F, mph)</option>
          </select>

          <div className={styles.formActions}>
            <button type="submit" aria-label={t('search')}>{t('search')}</button>
            <button type="button" aria-label={t('useLocation')} className={styles.secondaryButton} onClick={useMyLocation}>{t('useLocation')}</button>
          </div>
          {autoSearchLoading && <small aria-live="polite">{t('weatherSearchFeedback')}</small>}
          {suggestionsLoading && <small aria-live="polite">{t('suggestFeedback')}</small>}
        </form>

        <section className={styles.quickPanels}>
          <div className={styles.panel}>
            <h3>{t('favorites')}</h3>
            <div className={styles.chipList}>
              {favorites.length ? favorites.map((item) => (
                <button key={item} type="button" className={styles.chip} onClick={() => pickLocationChip(item)}>{item}</button>
              )) : <small>Nenhum favorito.</small>}
            </div>
          </div>

          <div className={styles.panel}>
            <h3>{t('history')}</h3>
            <div className={styles.chipList}>
              {history.length ? history.map((item) => (
                <button key={item} type="button" className={styles.chip} onClick={() => pickLocationChip(item)}>{item}</button>
              )) : <small>Nenhuma busca recente.</small>}
            </div>
          </div>
        </section>

        <section className={styles.quickPanels}>
          <div className={styles.panel}>
            <h3>{t('compare')}</h3>
            <div className={styles.compareRow}>
              <input
                type="text"
                placeholder="Cidade para comparar"
                value={compareLocation}
                onChange={(event) => setCompareLocation(event.target.value)}
              />
              <button type="button" className={styles.secondaryButton} onClick={runCompareSearch}>Comparar</button>
            </div>
            {compareLoading && <small>Comparando cidades...</small>}
            {compareError && <small className={styles.errorText}>{compareError}</small>}
            {weatherData && compareData && comparisonSummary && (
              <div className={styles.compareSummary}>
                <p><strong>{weatherData.name}</strong> vs <strong>{compareData.name}</strong></p>
                <p>Diferenca de temperatura: {comparisonSummary.tempDiff > 0 ? '+' : ''}{comparisonSummary.tempDiff}{tempSymbol}</p>
                <p>Diferenca de umidade: {comparisonSummary.humidityDiff > 0 ? '+' : ''}{comparisonSummary.humidityDiff}%</p>
                <p>Diferenca de vento: {comparisonSummary.windDiff > 0 ? '+' : ''}{comparisonSummary.windDiff} {units === 'imperial' ? 'mph' : 'm/s'}</p>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <h3>Alertas personalizados</h3>
            <div className={styles.preferencesGrid}>
              <label>
                Calor max ({tempSymbol})
                <input
                  type="number"
                  value={alertPreferences.heatThreshold}
                  onChange={(event) => setAlertPreferences((current) => ({ ...current, heatThreshold: Number(event.target.value) || current.heatThreshold }))}
                />
              </label>
              <label>
                Chuva min (0-1)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={alertPreferences.rainThreshold}
                  onChange={(event) => setAlertPreferences((current) => ({ ...current, rainThreshold: Math.min(1, Math.max(0, Number(event.target.value) || current.rainThreshold)) }))}
                />
              </label>
              <label>
                Vento max ({units === 'imperial' ? 'mph' : 'm/s'})
                <input
                  type="number"
                  value={alertPreferences.windThreshold}
                  onChange={(event) => setAlertPreferences((current) => ({ ...current, windThreshold: Number(event.target.value) || current.windThreshold }))}
                />
              </label>
              <label>
                AQI max (1-5)
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={alertPreferences.aqiThreshold}
                  onChange={(event) => setAlertPreferences((current) => ({ ...current, aqiThreshold: Math.min(5, Math.max(1, Number(event.target.value) || current.aqiThreshold)) }))}
                />
              </label>
              <label className={styles.notificationToggle}>
                <input
                  type="checkbox"
                  checked={alertPreferences.notificationsEnabled}
                  onChange={(event) => setAlertPreferences((current) => ({ ...current, notificationsEnabled: event.target.checked }))}
                />
                Ativar notificacoes do navegador
              </label>
              <label>
                {t('emailLabel')}
                <input
                  type="email"
                  placeholder="voce@email.com"
                  value={profileEmail}
                  onBlur={() => syncProfile(alertPreferences, locale, profileEmail).catch(() => {})}
                  onChange={(event) => setProfileEmail(event.target.value)}
                />
              </label>
            </div>
          </div>
        </section>

        <section className={styles.quickPanels} aria-label={t('multiCity')}>
          <div className={styles.panel}>
            <h3>{t('multiCity')}</h3>
            <div className={styles.compareRow}>
              <input
                type="text"
                aria-label={t('multiCity')}
                placeholder="Ex.: Sao Paulo"
                value={multiCityInput}
                onChange={(event) => setMultiCityInput(event.target.value)}
              />
              <button type="button" className={styles.secondaryButton} onClick={addMultiCity}>{t('addCity')}</button>
            </div>
            {multiCityLoading && <small>Carregando painel multi-cidades...</small>}
            <div className={styles.multiCityGrid}>
              {multiCityData.map((item) => (
                <article key={item.name} className={styles.forecastCard}>
                  <h4>{item.name}</h4>
                  <p>{item.weather?.[0]?.description}</p>
                  <p>{Math.round(item.main.temp)}{tempSymbol}</p>
                  <small>Umidade: {item.main.humidity}%</small>
                  <button type="button" className={styles.chip} onClick={() => removeMultiCity(item.name)}>Remover</button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.result} role="region" aria-live="polite" aria-label="Resultados">
          {loading && (
            <section className={styles.block}>
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
              <div className={styles.skeletonLarge} />
            </section>
          )}
          {!loading && error && <p className={styles.errorText}>Erro: {error}</p>}

          {!loading && !error && weatherData && forecastData && airData && airForecastData && (
            <>
              <section className={styles.block}>
                <div className={styles.blockHeader}>
                  <h2>{weatherData.weather?.[0]?.description || 'Sem descricao'}</h2>
                  <div className={styles.headerActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => saveFavorite(resolvedLocation)}>Salvar favorito</button>
                    <button type="button" className={styles.secondaryButton} onClick={shareCurrentSearch}>Compartilhar</button>
                  </div>
                </div>
                {lastUpdatedAt && (
                  <small className={styles.cacheHint}>
                    {isCachedResult ? 'Dados vindos do cache.' : 'Dados atualizados em tempo real.'} Atualizado em {new Date(lastUpdatedAt).toLocaleTimeString(locale === 'pt' ? 'pt-BR' : 'en-US')}.
                  </small>
                )}
                <p><strong>Local:</strong> {resolvedLocation}</p>
                <p><strong>Temperatura:</strong> {Math.round(weatherData.main.temp)}{tempSymbol}</p>
                <p><strong>Sensacao termica:</strong> {Math.round(weatherData.main.feels_like)}{tempSymbol}</p>
                <p><strong>Umidade:</strong> {weatherData.main.humidity}%</p>
                <p><strong>Vento:</strong> {weatherData.wind.speed} {units === 'imperial' ? 'mph' : 'm/s'} ({typeof weatherData.wind.deg === 'number' ? `${weatherData.wind.deg}°` : 'N/D'})</p>
                <p><strong>UV:</strong> {uvData?.current?.uvi?.toFixed(1) ?? 'N/D'}</p>
                <p><strong>Nascer do sol:</strong> {weatherData.sys?.sunrise ? new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString(locale === 'pt' ? 'pt-BR' : 'en-US') : 'N/D'}</p>
                <p><strong>Por do sol:</strong> {weatherData.sys?.sunset ? new Date(weatherData.sys.sunset * 1000).toLocaleTimeString(locale === 'pt' ? 'pt-BR' : 'en-US') : 'N/D'}</p>
                {shareStatus && <small>{shareStatus}</small>}
              </section>

              <section className={styles.block}>
                <h3>{t('mapTitle')}</h3>
                {MAPBOX_TOKEN ? (
                  <>
                    <div className={styles.mapWrap}>
                      <Suspense fallback={<div className={styles.skeletonLarge} />}>
                        <WeatherMap
                          token={MAPBOX_TOKEN}
                          theme={theme}
                          locale={locale}
                          apiBaseUrl={API_BASE_URL}
                          clientId={profileId}
                          center={weatherData.coord}
                          currentDescription={weatherData.weather?.[0]?.description || 'Sem descricao'}
                          currentTemperature={weatherData.main.temp}
                          currentWindSpeed={weatherData.wind.speed}
                          currentAqi={airData.list?.[0]?.main?.aqi}
                          currentUv={uvData?.current?.uvi}
                          units={units}
                          timelinePoints={timelineMapPoints.length ? timelineMapPoints : mapForecastPoints}
                          multiCityPoints={mapMultiCityPoints}
                          onGeofenceAlert={(message) => {
                            setMapAlerts((current) => {
                              const next = [message, ...current].slice(0, 5);
                              return Array.from(new Set(next));
                            });
                          }}
                        />
                      </Suspense>
                    </div>
                    <small className={styles.mapHint}>
                      Marcadores mostram condicao atual e previsoes diarias para os proximos dias.
                    </small>
                  </>
                ) : (
                  <p>Defina VITE_MAPBOX_TOKEN para habilitar o mapa.</p>
                )}
              </section>

              <section className={styles.block}>
                <h3>{t('alerts')}</h3>
                {combinedAlerts.length ? (
                  <ul>
                    {combinedAlerts.map((alert) => <li key={alert}>{alert}</li>)}
                  </ul>
                ) : (
                  <p>Nenhum alerta relevante no momento.</p>
                )}
              </section>

              <section className={styles.block}>
                <h3>Qualidade do ar</h3>
                <span className={`${styles.aqiBadge} ${styles[aqiMeta.className]}`}>AQI: {aqiMeta.label}</span>
                <p>PM2.5: {airData.list[0]?.components.pm2_5 ?? 'N/D'} | PM10: {airData.list[0]?.components.pm10 ?? 'N/D'}</p>
                <p>NO2: {airData.list[0]?.components.no2 ?? 'N/D'} | O3: {airData.list[0]?.components.o3 ?? 'N/D'}</p>
              </section>

              <section className={styles.block}>
                <h3>Previsao para 5 dias</h3>
                <div className={styles.forecastGrid}>
                  {groupedForecast.map(({ date, entry }) => (
                    <article key={date} className={styles.forecastCard}>
                      <h4>{date}</h4>
                      <p>{entry.weather?.[0]?.description || 'Sem descricao'}</p>
                      <p>{Math.round(entry.main.temp)}{tempSymbol}</p>
                      <small>Umidade: {entry.main.humidity}%</small>
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.block}>
                <h3>Tendencia de temperatura (3h)</h3>
                <div className={styles.chartWrap}>
                  <Suspense fallback={<div className={styles.skeletonLarge} />}>
                    <LineChart data={temperatureChartData} />
                  </Suspense>
                </div>
              </section>

              <section className={styles.block}>
                <h3>Tendencia de poluentes (3h)</h3>
                <div className={styles.chartWrap}>
                  <Suspense fallback={<div className={styles.skeletonLarge} />}>
                    <LineChart data={pollutantChartData} />
                  </Suspense>
                </div>
              </section>

              <section className={styles.block}>
                <h3>Historico climático recente</h3>
                <div className={styles.chartWrap}>
                  <Suspense fallback={<div className={styles.skeletonLarge} />}>
                    <LineChart data={historyChartData} />
                  </Suspense>
                </div>
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
