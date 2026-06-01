import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { Map as MapboxMap, Marker, Popup } from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { LngLatLike } from 'mapbox-gl';
import { getJson } from '../lib/http';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

type WeatherMapPoint = {
  dt: number;
  label: string;
  description: string;
  temperature: number;
  probability?: number;
  windSpeed?: number;
};

type MultiCityPoint = {
  name: string;
  lat: number;
  lon: number;
  temperature: number;
  description: string;
};

type OpsMode = 'agro' | 'mobility' | 'health';

type WeatherMapProps = {
  token: string;
  theme: 'light' | 'dark';
  locale: 'pt' | 'en';
  center: { lat: number; lon: number };
  apiBaseUrl: string;
  clientId: string;
  currentDescription: string;
  currentTemperature: number;
  currentWindSpeed?: number;
  currentAqi?: number;
  currentUv?: number;
  units: 'metric' | 'imperial';
  timelinePoints: WeatherMapPoint[];
  multiCityPoints: MultiCityPoint[];
  onGeofenceAlert?: (message: string) => void;
};

type RouteEvaluation = {
  id: string;
  distanceMeters: number;
  durationSeconds: number;
  riskScore: number;
  geometry: GeoJSON.LineString;
};

type PersistedGeofenceResponse = {
  geofences: FeatureCollection;
};

const OVERLAY_KEYS = ['temp_new', 'precipitation_new', 'clouds_new', 'pressure_new', 'wind_new'] as const;
type OverlayKey = (typeof OVERLAY_KEYS)[number];

function styleId(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';
}

function createMarkerColor(description: string): string {
  const lowered = description.toLowerCase();
  if (lowered.includes('storm') || lowered.includes('trovoada')) {
    return '#c62828';
  }
  if (lowered.includes('chuva') || lowered.includes('rain')) {
    return '#1565c0';
  }
  if (lowered.includes('nuv')) {
    return '#607d8b';
  }
  return '#0f766e';
}

function pointInPolygon(point: [number, number], polygonCoords: number[][]): boolean {
  let inside = false;
  const x = point[0];
  const y = point[1];

  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i][0];
    const yi = polygonCoords[i][1];
    const xj = polygonCoords[j][0];
    const yj = polygonCoords[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreRisk(params: {
  temp: number;
  rainProbability: number;
  windSpeed: number;
  aqi: number;
  uv: number;
  mode: OpsMode;
}): number {
  const { temp, rainProbability, windSpeed, aqi, uv, mode } = params;

  const base = {
    rain: rainProbability * 100,
    wind: windSpeed * 5,
    heat: Math.max(0, temp - 30) * 4,
    aqi: Math.max(0, aqi - 2) * 12,
    uv: uv * 4,
  };

  const modeWeights: Record<OpsMode, { rain: number; wind: number; heat: number; aqi: number; uv: number }> = {
    agro: { rain: 1.3, wind: 1.1, heat: 1.2, aqi: 0.6, uv: 0.7 },
    mobility: { rain: 1.4, wind: 1.4, heat: 0.7, aqi: 0.8, uv: 0.5 },
    health: { rain: 0.7, wind: 0.8, heat: 1.2, aqi: 1.5, uv: 1.4 },
  };

  const w = modeWeights[mode];
  const score = base.rain * w.rain + base.wind * w.wind + base.heat * w.heat + base.aqi * w.aqi + base.uv * w.uv;
  return clamp(score, 0, 100);
}

export default function WeatherMap({
  token,
  theme,
  locale,
  center,
  apiBaseUrl,
  clientId,
  currentDescription,
  currentTemperature,
  currentWindSpeed = 0,
  currentAqi = 2,
  currentUv = 0,
  units,
  timelinePoints,
  multiCityPoints,
  onGeofenceAlert,
}: WeatherMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const lastAlertRef = useRef<string>('');
  const geofenceSaveDebounceRef = useRef<number | null>(null);
  const lastGeofenceSnapshotRef = useRef('');

  const [timelineIndex, setTimelineIndex] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(0.65);
  const [overlayLayers, setOverlayLayers] = useState<Record<OverlayKey, boolean>>({
    temp_new: false,
    precipitation_new: true,
    clouds_new: false,
    pressure_new: false,
    wind_new: false,
  });
  const [mode, setMode] = useState<OpsMode>('mobility');
  const [routeOrigin, setRouteOrigin] = useState('');
  const [routeDestination, setRouteDestination] = useState('');
  const [routeSummary, setRouteSummary] = useState('');
  const [geofenceSyncStatus, setGeofenceSyncStatus] = useState('');

  const activeTimeline = timelinePoints[timelineIndex] || timelinePoints[0];

  const riskScore = useMemo(() => {
    if (!activeTimeline) {
      return 0;
    }

    return scoreRisk({
      temp: activeTimeline.temperature,
      rainProbability: activeTimeline.probability || 0,
      windSpeed: activeTimeline.windSpeed || currentWindSpeed,
      aqi: currentAqi,
      uv: currentUv,
      mode,
    });
  }, [activeTimeline, currentAqi, currentUv, currentWindSpeed, mode]);

  const timestampForOverlay = activeTimeline?.dt;

  const overlayLegend: Record<OverlayKey, string> = {
    temp_new: 'linear-gradient(90deg, #3b82f6, #22c55e, #f59e0b, #ef4444)',
    precipitation_new: 'linear-gradient(90deg, #dbeafe, #60a5fa, #1d4ed8)',
    clouds_new: 'linear-gradient(90deg, #f8fafc, #94a3b8, #334155)',
    pressure_new: 'linear-gradient(90deg, #a7f3d0, #38bdf8, #8b5cf6)',
    wind_new: 'linear-gradient(90deg, #e0f2fe, #06b6d4, #0f766e)',
  };

  async function getApiJson<T>(path: string, options?: { method?: 'GET' | 'PUT'; body?: unknown }): Promise<T> {
    return getJson<T>(`${apiBaseUrl || ''}${path}`, {
      method: options?.method || 'GET',
      body: options?.body,
      clientId,
      retries: 2,
      cacheTtlMs: 20_000,
    });
  }

  function geofenceSnapshot(collection: FeatureCollection): string {
    return JSON.stringify(collection.features || []);
  }

  async function loadPersistedGeofences() {
    const draw = drawRef.current;
    if (!draw || !clientId) {
      return;
    }

    try {
      const data = await getApiJson<PersistedGeofenceResponse>(`/api/geofences/${encodeURIComponent(clientId)}`);
      const geofences = data?.geofences;
      if (!geofences || geofences.type !== 'FeatureCollection') {
        return;
      }

      draw.deleteAll();
      geofences.features.forEach((feature) => {
        draw.add(feature as never);
      });
      lastGeofenceSnapshotRef.current = geofenceSnapshot(geofences);
      setGeofenceSyncStatus(locale === 'pt' ? 'Zonas carregadas.' : 'Zones loaded.');
    } catch {
      setGeofenceSyncStatus(locale === 'pt' ? 'Falha ao carregar zonas.' : 'Failed to load zones.');
    }
  }

  async function savePersistedGeofences() {
    const draw = drawRef.current;
    if (!draw || !clientId) {
      return;
    }

    try {
      const geofences = draw.getAll();
      const snapshot = geofenceSnapshot(geofences);
      if (snapshot === lastGeofenceSnapshotRef.current) {
        return;
      }

      await getApiJson(`/api/geofences/${encodeURIComponent(clientId)}`, {
        method: 'PUT',
        body: geofences,
      });
      lastGeofenceSnapshotRef.current = snapshot;
      setGeofenceSyncStatus(locale === 'pt' ? 'Zonas salvas.' : 'Zones saved.');
    } catch {
      setGeofenceSyncStatus(locale === 'pt' ? 'Falha ao salvar zonas.' : 'Failed to save zones.');
    }
  }

  function schedulePersistedGeofenceSave() {
    if (geofenceSaveDebounceRef.current) {
      window.clearTimeout(geofenceSaveDebounceRef.current);
    }

    geofenceSaveDebounceRef.current = window.setTimeout(() => {
      savePersistedGeofences().catch(() => {});
      geofenceSaveDebounceRef.current = null;
    }, 1200);
  }

  function exportGeoJsonBundle() {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !map) {
      return;
    }

    const zoneData = draw.getAll();
    const routeSource = map.getSource('route-source') as mapboxgl.GeoJSONSource | undefined;
    const routeData = routeSource && '_data' in routeSource
      ? (routeSource as unknown as { _data?: FeatureCollection })._data
      : undefined;

    const merged: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(zoneData.features || []).map((feature) => ({
          ...feature,
          properties: {
            ...(feature.properties || {}),
            exportType: 'geofence',
          },
        })),
        ...((routeData?.features || []).map((feature) => ({
          ...feature,
          properties: {
            ...(feature.properties || {}),
            exportType: 'route',
          },
        }))),
      ],
    };

    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `weather-map-export-${stamp}.geojson`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function weatherTileTemplate(layer: OverlayKey): string {
    const base = apiBaseUrl ? apiBaseUrl : '';
    const timeParam = timestampForOverlay ? `?ts=${timestampForOverlay}` : '';
    return `${base}/api/weather-tile/${layer}/{z}/{x}/{y}.png${timeParam}`;
  }

  function ensureOverlayLayers(map: MapboxMap) {
    OVERLAY_KEYS.forEach((layer) => {
      const sourceId = `owm-${layer}`;
      const layerId = `owm-${layer}-raster`;
      const visible = overlayLayers[layer] ? 'visible' : 'none';

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'raster',
          tiles: [weatherTileTemplate(layer)],
          tileSize: 256,
        });
      }

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': overlayOpacity,
          },
          layout: {
            visibility: visible,
          },
        });
      } else {
        map.setLayoutProperty(layerId, 'visibility', visible);
        map.setPaintProperty(layerId, 'raster-opacity', overlayOpacity);
      }
    });
  }

  function ensureClusterLayer(map: MapboxMap) {
    const sourceId = 'multi-city-source';
    const features: Feature[] = multiCityPoints.map((point) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lon, point.lat],
      },
      properties: {
        name: point.name,
        temperature: point.temperature,
        description: point.description,
      },
    }));
    const data: FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data,
        cluster: true,
        clusterRadius: 40,
      });
    } else {
      const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
      src.setData(data);
    }

    if (!map.getLayer('multi-city-clusters')) {
      map.addLayer({
        id: 'multi-city-clusters',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0ea5e9',
          'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 10, 24],
        },
      });
      map.addLayer({
        id: 'multi-city-count',
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
        },
      });
      map.addLayer({
        id: 'multi-city-points',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#f97316',
          'circle-radius': 6,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      });
    }
  }

  function ensureRiskLayers(map: MapboxMap) {
    const sourceId = 'risk-heat-source';
    const points: Feature[] = [];
    const span = 0.6;
    const step = span / 6;
    for (let yi = -3; yi <= 3; yi += 1) {
      for (let xi = -3; xi <= 3; xi += 1) {
        const lon = center.lon + xi * step;
        const lat = center.lat + yi * step;
        const distFactor = Math.max(0.6, 1 - Math.hypot(xi, yi) / 6);
        const value = clamp(riskScore * distFactor, 0, 100);
        points.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { risk: value },
        });
      }
    }

    const data: FeatureCollection = { type: 'FeatureCollection', features: points };

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data });
    } else {
      (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(data);
    }

    if (!map.getLayer('risk-heatmap')) {
      map.addLayer({
        id: 'risk-heatmap',
        type: 'heatmap',
        source: sourceId,
        maxzoom: 12,
        paint: {
          'heatmap-weight': ['/', ['get', 'risk'], 100],
          'heatmap-intensity': 1,
          'heatmap-radius': 24,
          'heatmap-opacity': 0.45,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(16,185,129,0)',
            0.35,
            '#22c55e',
            0.6,
            '#facc15',
            0.8,
            '#f97316',
            1,
            '#ef4444',
          ],
        },
      });
    }
  }

  function checkGeofenceAlert(map: MapboxMap) {
    const draw = drawRef.current;
    if (!draw) {
      return;
    }

    const all = draw.getAll();
    const polygons = all.features.filter((item) => item.geometry.type === 'Polygon') as Array<Feature<Polygon>>;
    if (!polygons.length) {
      return;
    }

    const point: [number, number] = [center.lon, center.lat];
    const insideAny = polygons.some((poly) => pointInPolygon(point, poly.geometry.coordinates[0] as number[][]));

    if (insideAny && riskScore >= 65) {
      const msg = locale === 'pt'
        ? `Zona monitorada em risco alto (${Math.round(riskScore)}).`
        : `Monitored zone has high risk (${Math.round(riskScore)}).`;
      if (lastAlertRef.current !== msg) {
        lastAlertRef.current = msg;
        onGeofenceAlert?.(msg);
      }
    }

    if (!insideAny) {
      lastAlertRef.current = '';
    }

    if (map.getSource('draw-zone-source')) {
      (map.getSource('draw-zone-source') as mapboxgl.GeoJSONSource).setData(all as FeatureCollection);
      return;
    }

    map.addSource('draw-zone-source', {
      type: 'geojson',
      data: all as FeatureCollection,
    });
    map.addLayer({
      id: 'draw-zone-fill',
      type: 'fill',
      source: 'draw-zone-source',
      paint: {
        'fill-color': riskScore >= 65 ? '#ef4444' : '#22c55e',
        'fill-opacity': 0.15,
      },
    });
    map.addLayer({
      id: 'draw-zone-line',
      type: 'line',
      source: 'draw-zone-source',
      paint: {
        'line-color': '#0ea5e9',
        'line-width': 2,
      },
    });
  }

  async function evaluateRoutes(map: MapboxMap) {
    if (!routeOrigin.trim() || !routeDestination.trim()) {
      setRouteSummary(locale === 'pt' ? 'Informe origem e destino para calcular rota.' : 'Set origin and destination to evaluate route.');
      return;
    }

    const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(routeOrigin)}.json?limit=1&access_token=${token}`;
    const geocodeDestUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(routeDestination)}.json?limit=1&access_token=${token}`;
    const [originData, destData] = await Promise.all([
      fetch(geocodeUrl).then((r) => r.json()),
      fetch(geocodeDestUrl).then((r) => r.json()),
    ]);

    const originCenter = originData?.features?.[0]?.center;
    const destCenter = destData?.features?.[0]?.center;
    if (!originCenter || !destCenter) {
      setRouteSummary(locale === 'pt' ? 'Nao foi possivel geocodificar origem/destino.' : 'Could not geocode origin/destination.');
      return;
    }

    const directions = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${originCenter[0]},${originCenter[1]};${destCenter[0]},${destCenter[1]}?alternatives=true&geometries=geojson&overview=full&access_token=${token}`,
    ).then((r) => r.json());

    const routes: RouteEvaluation[] = [];
    for (const route of directions.routes || []) {
      const geometry = route.geometry as GeoJSON.LineString;
      const coords = geometry.coordinates || [];
      const sampleIndexes = [0, Math.floor(coords.length * 0.25), Math.floor(coords.length * 0.5), Math.floor(coords.length * 0.75), coords.length - 1]
        .filter((idx, pos, arr) => idx >= 0 && idx < coords.length && arr.indexOf(idx) === pos);

      let sampledRisk = 0;
      for (const idx of sampleIndexes) {
        const coord = coords[idx];
        const api = `${apiBaseUrl || ''}/api/weather?lat=${coord[1]}&lon=${coord[0]}&units=${units}&lang=${locale === 'pt' ? 'pt_br' : 'en'}`;
        const weather = await fetch(api, {
          headers: { 'x-client-id': clientId },
        }).then((r) => r.json());
        const weatherMain = weather?.weather?.[0]?.main || '';
        const rainRisk = weatherMain === 'Rain' || weatherMain === 'Thunderstorm' ? 0.85 : 0.25;
        sampledRisk += scoreRisk({
          temp: weather?.main?.temp || currentTemperature,
          rainProbability: rainRisk,
          windSpeed: weather?.wind?.speed || currentWindSpeed,
          aqi: currentAqi,
          uv: currentUv,
          mode,
        });
      }

      routes.push({
        id: `route-${routes.length}`,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        riskScore: sampledRisk / Math.max(1, sampleIndexes.length),
        geometry,
      });
    }

    if (!routes.length) {
      setRouteSummary(locale === 'pt' ? 'Nenhuma rota disponivel.' : 'No routes available.');
      return;
    }

    const sorted = [...routes].sort((a, b) => a.riskScore - b.riskScore);
    const best = sorted[0];

    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: routes.map((route) => ({
        type: 'Feature',
        geometry: route.geometry,
        properties: {
          routeId: route.id,
          risk: route.riskScore,
          best: route.id === best.id ? 1 : 0,
        },
      })),
    };

    if (!map.getSource('route-source')) {
      map.addSource('route-source', { type: 'geojson', data: geojson });
    } else {
      (map.getSource('route-source') as mapboxgl.GeoJSONSource).setData(geojson);
    }

    if (!map.getLayer('route-layer')) {
      map.addLayer({
        id: 'route-layer',
        type: 'line',
        source: 'route-source',
        paint: {
          'line-width': ['case', ['==', ['get', 'best'], 1], 6, 4],
          'line-color': [
            'case',
            ['==', ['get', 'best'], 1],
            '#22c55e',
            ['interpolate', ['linear'], ['get', 'risk'], 0, '#3b82f6', 100, '#ef4444'],
          ],
          'line-opacity': 0.9,
        },
      });
    }

    const km = (best.distanceMeters / 1000).toFixed(1);
    const min = Math.round(best.durationSeconds / 60);
    setRouteSummary(
      locale === 'pt'
        ? `Rota sugerida: ${km} km, ${min} min, risco ${Math.round(best.riskScore)}.`
        : `Suggested route: ${km} km, ${min} min, risk ${Math.round(best.riskScore)}.`,
    );

    map.fitBounds([
      originCenter as [number, number],
      destCenter as [number, number],
    ], {
      padding: 40,
      duration: 900,
    });
  }

  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: styleId(theme),
      center: [center.lon, center.lat],
      zoom: 7,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'simple_select',
    });
    map.addControl(draw, 'top-left');

    mapRef.current = map;
    drawRef.current = draw;

    map.on('load', () => {
      ensureOverlayLayers(map);
      ensureClusterLayer(map);
      ensureRiskLayers(map);
      checkGeofenceAlert(map);
      loadPersistedGeofences().catch(() => {});
    });

    map.on('draw.create', () => {
      checkGeofenceAlert(map);
      schedulePersistedGeofenceSave();
    });
    map.on('draw.update', () => {
      checkGeofenceAlert(map);
      schedulePersistedGeofenceSave();
    });
    map.on('draw.delete', () => {
      checkGeofenceAlert(map);
      schedulePersistedGeofenceSave();
    });

    return () => {
      if (geofenceSaveDebounceRef.current) {
        window.clearTimeout(geofenceSaveDebounceRef.current);
      }
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [token, theme]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    mapRef.current.setStyle(styleId(theme));
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (map.isStyleLoaded()) {
      ensureOverlayLayers(map);
      ensureClusterLayer(map);
      ensureRiskLayers(map);
      checkGeofenceAlert(map);
    }
  }, [overlayLayers, overlayOpacity, timestampForOverlay, multiCityPoints, riskScore, center.lat, center.lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    map.flyTo({ center: [center.lon, center.lat] as LngLatLike, duration: 1000 });

    const currentPopup = new Popup({ offset: 20 }).setHTML(
      `<strong>${locale === 'pt' ? 'Agora' : 'Now'}</strong><br/>${currentDescription}<br/>${Math.round(currentTemperature)}${units === 'imperial' ? '°F' : '°C'}`,
    );

    const currentMarker = new Marker({ color: '#0f766e' })
      .setLngLat([center.lon, center.lat])
      .setPopup(currentPopup)
      .addTo(map);

    markersRef.current.push(currentMarker);

    const radius = 0.18;
    timelinePoints.slice(0, 5).forEach((point, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, timelinePoints.length);
      const latOffset = radius * Math.sin(angle);
      const lonOffset = radius * Math.cos(angle);

      const popup = new Popup({ offset: 20 }).setHTML(
        `<strong>${point.label}</strong><br/>${point.description}<br/>${Math.round(point.temperature)}${units === 'imperial' ? '°F' : '°C'}${
          typeof point.probability === 'number' ? `<br/>${locale === 'pt' ? 'Chuva' : 'Rain'}: ${(point.probability * 100).toFixed(0)}%` : ''
        }${typeof point.windSpeed === 'number' ? `<br/>${locale === 'pt' ? 'Vento' : 'Wind'}: ${point.windSpeed.toFixed(1)} ${units === 'imperial' ? 'mph' : 'm/s'}` : ''}`,
      );

      const marker = new Marker({ color: createMarkerColor(point.description) })
        .setLngLat([center.lon + lonOffset, center.lat + latOffset])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [center.lat, center.lon, currentDescription, currentTemperature, timelinePoints, locale, units]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '460px', borderRadius: 10, overflow: 'hidden' }} />

      <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 2, background: 'rgba(255,255,255,0.92)', borderRadius: 10, padding: 10, width: 300 }}>
        <strong>{locale === 'pt' ? 'Cockpit Climático' : 'Weather Cockpit'}</strong>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {OVERLAY_KEYS.map((layer) => (
            <label key={layer} style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={overlayLayers[layer]}
                onChange={(event) => setOverlayLayers((current) => ({ ...current, [layer]: event.target.checked }))}
              />{' '}
              {layer.replace('_new', '')}
            </label>
          ))}
        </div>

        <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          {locale === 'pt' ? 'Opacidade camadas' : 'Layer opacity'}: {overlayOpacity.toFixed(2)}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={overlayOpacity}
            onChange={(event) => setOverlayOpacity(Number(event.target.value))}
            style={{ width: '100%' }}
          />
        </label>

        <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          {locale === 'pt' ? 'Timeline (3h)' : 'Timeline (3h)'}
          <input
            type="range"
            min="0"
            max={Math.max(0, timelinePoints.length - 1)}
            step="1"
            value={timelineIndex}
            onChange={(event) => setTimelineIndex(Number(event.target.value))}
            style={{ width: '100%' }}
          />
          <small>{activeTimeline?.label || '-'}</small>
        </label>

        <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          {locale === 'pt' ? 'Modo operacional' : 'Operational mode'}
          <select value={mode} onChange={(event) => setMode(event.target.value as OpsMode)} style={{ width: '100%' }}>
            <option value="agro">{locale === 'pt' ? 'Agricultura' : 'Agriculture'}</option>
            <option value="mobility">{locale === 'pt' ? 'Mobilidade' : 'Mobility'}</option>
            <option value="health">{locale === 'pt' ? 'Saude' : 'Health'}</option>
          </select>
        </label>

        <div style={{ marginTop: 8, fontSize: 12 }}>
          {locale === 'pt' ? 'Risco estimado' : 'Estimated risk'}: <strong>{Math.round(riskScore)}</strong>/100
        </div>

        <div style={{ marginTop: 8 }}>
          <strong style={{ fontSize: 12 }}>{locale === 'pt' ? 'Legenda camadas' : 'Layer legend'}</strong>
          {OVERLAY_KEYS.map((layer) => (
            <div key={`legend-${layer}`} style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span>{layer.replace('_new', '')}</span>
                <span>low-high</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: overlayLegend[layer] }} />
            </div>
          ))}
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span>{locale === 'pt' ? 'Risco' : 'Risk'}</span>
              <span>green-red</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'linear-gradient(90deg, #22c55e, #facc15, #f97316, #ef4444)' }} />
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 2, background: 'rgba(255,255,255,0.92)', borderRadius: 10, padding: 10, width: 320 }}>
        <strong>{locale === 'pt' ? 'Rota weather-aware' : 'Weather-aware route'}</strong>
        <input
          type="text"
          placeholder={locale === 'pt' ? 'Origem' : 'Origin'}
          value={routeOrigin}
          onChange={(event) => setRouteOrigin(event.target.value)}
          style={{ marginTop: 6, width: '100%' }}
        />
        <input
          type="text"
          placeholder={locale === 'pt' ? 'Destino' : 'Destination'}
          value={routeDestination}
          onChange={(event) => setRouteDestination(event.target.value)}
          style={{ marginTop: 6, width: '100%' }}
        />
        <button
          type="button"
          onClick={() => {
            const map = mapRef.current;
            if (!map) {
              return;
            }
            evaluateRoutes(map).catch(() => {
              setRouteSummary(locale === 'pt' ? 'Falha ao calcular rota.' : 'Failed to calculate route.');
            });
          }}
          style={{ marginTop: 6, width: '100%' }}
        >
          {locale === 'pt' ? 'Calcular rota segura' : 'Calculate safer route'}
        </button>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button type="button" onClick={() => loadPersistedGeofences().catch(() => {})}>
            {locale === 'pt' ? 'Carregar zonas' : 'Load zones'}
          </button>
          <button type="button" onClick={() => savePersistedGeofences().catch(() => {})}>
            {locale === 'pt' ? 'Salvar zonas' : 'Save zones'}
          </button>
        </div>
        <button type="button" onClick={exportGeoJsonBundle} style={{ marginTop: 6, width: '100%' }}>
          {locale === 'pt' ? 'Exportar GeoJSON (zonas + rotas)' : 'Export GeoJSON (zones + routes)'}
        </button>
        <small style={{ display: 'block', marginTop: 6 }}>{routeSummary}</small>
        {geofenceSyncStatus && <small style={{ display: 'block', marginTop: 6 }}>{geofenceSyncStatus}</small>}
        <small style={{ display: 'block', marginTop: 6 }}>
          {locale === 'pt'
            ? 'Use o botao de poligono no mapa para criar zonas monitoradas (geofence).'
            : 'Use polygon tool on map to create monitored geofences.'}
        </small>
      </div>
    </div>
  );
}
