import fs from 'fs';
import path from 'path';

export type UserProfile = {
  id: string;
  locale: 'pt' | 'en';
  email?: string;
  alertPreferences?: {
    heatThreshold: number;
    rainThreshold: number;
    windThreshold: number;
    aqiThreshold: number;
    notificationsEnabled: boolean;
  };
  updatedAt: number;
};

const PROFILE_FILE = path.join(process.cwd(), 'private', 'user-preferences.json');
const EMAIL_DEDUPE_MS = 30 * 60 * 1000;
const recentEmailAlerts = new Map<string, number>();

function ensureFile() {
  const dir = path.dirname(PROFILE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(PROFILE_FILE)) {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function readAllProfiles(): Record<string, UserProfile> {
  ensureFile();
  try {
    const raw = fs.readFileSync(PROFILE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, UserProfile>;
    return parsed || {};
  } catch {
    return {};
  }
}

function writeAllProfiles(profiles: Record<string, UserProfile>) {
  ensureFile();
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
}

export function getProfile(profileId: string): UserProfile | null {
  const profiles = readAllProfiles();
  return profiles[profileId] || null;
}

export function upsertProfile(profile: UserProfile): UserProfile {
  const profiles = readAllProfiles();
  profiles[profile.id] = profile;
  writeAllProfiles(profiles);
  return profile;
}

export function shouldSendEmailAlert(profileId: string): boolean {
  const now = Date.now();
  const last = recentEmailAlerts.get(profileId);
  if (last && now - last < EMAIL_DEDUPE_MS) {
    return false;
  }

  recentEmailAlerts.set(profileId, now);
  return true;
}
