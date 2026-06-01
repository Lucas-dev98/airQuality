import fs from 'fs';
import path from 'path';
import type { FeatureCollection, Geometry } from 'geojson';

type StoredGeofences = Record<string, FeatureCollection<Geometry>>;

const GEOFENCE_FILE = path.join(process.cwd(), 'private', 'geofences.json');

function ensureFile() {
  const dir = path.dirname(GEOFENCE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(GEOFENCE_FILE)) {
    fs.writeFileSync(GEOFENCE_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function readAll(): StoredGeofences {
  ensureFile();
  try {
    const raw = fs.readFileSync(GEOFENCE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoredGeofences;
    return parsed || {};
  } catch {
    return {};
  }
}

function writeAll(data: StoredGeofences) {
  ensureFile();
  fs.writeFileSync(GEOFENCE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getGeofences(profileId: string): FeatureCollection<Geometry> {
  const all = readAll();
  return all[profileId] || { type: 'FeatureCollection', features: [] };
}

export function upsertGeofences(profileId: string, geofences: FeatureCollection<Geometry>): FeatureCollection<Geometry> {
  const all = readAll();
  all[profileId] = geofences;
  writeAll(all);
  return geofences;
}
