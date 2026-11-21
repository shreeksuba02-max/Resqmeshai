import type { EmergencyItem, MeshMessageItem, UserProfile } from '../types/rescue';

const KEYS = {
  AUTH_TOKEN: 'rescuemesh_auth_token_v1',
  USER_PROFILE: 'rescuemesh_user_v1',
  LOCAL_EMERGENCIES: 'rescuemesh_local_emergencies_v1',
  LOCAL_MESSAGES: 'rescuemesh_local_messages_v1',
  SEEN_IDS: 'rescuemesh_seen_ids_v1',
  OFFLINE_MODE: 'rescuemesh_offline_mode_v1',
  SHAKE_SETTINGS: 'rescuemesh_shake_settings_v1',
};

export interface ShakeSettings {
  enabled: boolean;
  sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  requiredShakes: number;
  timeWindowMs: number;
}

export const DEFAULT_SHAKE_SETTINGS: ShakeSettings = {
  enabled: true,
  sensitivity: 'MEDIUM',
  requiredShakes: 3,
  timeWindowMs: 2500,
};

export function loadAuthSession(): { token: string | null; user: UserProfile | null } {
  try {
    const token = localStorage.getItem(KEYS.AUTH_TOKEN);
    const rawUser = localStorage.getItem(KEYS.USER_PROFILE);
    return {
      token,
      user: rawUser ? (JSON.parse(rawUser) as UserProfile) : null,
    };
  } catch {
    return { token: null, user: null };
  }
}

export function saveAuthSession(token: string | null, user: UserProfile | null): void {
  if (token) localStorage.setItem(KEYS.AUTH_TOKEN, token);
  else localStorage.removeItem(KEYS.AUTH_TOKEN);

  if (user) localStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(user));
  else localStorage.removeItem(KEYS.USER_PROFILE);
}

export function getOfflineMode(): boolean {
  return localStorage.getItem(KEYS.OFFLINE_MODE) === 'true';
}

export function setOfflineMode(offline: boolean): void {
  localStorage.setItem(KEYS.OFFLINE_MODE, offline ? 'true' : 'false');
}

export function loadShakeSettings(): ShakeSettings {
  try {
    const raw = localStorage.getItem(KEYS.SHAKE_SETTINGS);
    return raw ? { ...DEFAULT_SHAKE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SHAKE_SETTINGS;
  } catch {
    return DEFAULT_SHAKE_SETTINGS;
  }
}

export function saveShakeSettings(settings: ShakeSettings): void {
  localStorage.setItem(KEYS.SHAKE_SETTINGS, JSON.stringify(settings));
}

export function loadLocalEmergencies(): EmergencyItem[] {
  try {
    const raw = localStorage.getItem(KEYS.LOCAL_EMERGENCIES);
    return raw ? (JSON.parse(raw) as EmergencyItem[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalEmergency(item: EmergencyItem): EmergencyItem[] {
  const list = loadLocalEmergencies();
  const seen = loadSeenMessageIds();
  seen.add(item.messageId);
  saveSeenMessageIds(seen);

  const idx = list.findIndex((e) => e.messageId === item.messageId);
  if (idx >= 0) {
    list[idx] = item;
  } else {
    list.unshift(item);
  }
  localStorage.setItem(KEYS.LOCAL_EMERGENCIES, JSON.stringify(list));
  return list;
}

export function markEmergenciesSynced(acks: Array<{ messageId: string; serverTimestamp: string }>): EmergencyItem[] {
  const ackMap = new Map(acks.map((a) => [a.messageId, a.serverTimestamp]));
  const updated = loadLocalEmergencies().map((e) => {
    const ts = ackMap.get(e.messageId);
    if (!ts) return e;
    return {
      ...e,
      syncedAt: ts,
      status:
        e.status === 'SOS_CREATED' ||
        e.status === 'STORED_LOCALLY' ||
        e.status === 'NEARBY_DEVICE_RECEIVED' ||
        e.status === 'FORWARDED'
          ? ('RESCUE_TEAM_RECEIVED' as const)
          : e.status,
    };
  });
  localStorage.setItem(KEYS.LOCAL_EMERGENCIES, JSON.stringify(updated));
  return updated;
}

export function loadLocalMessages(): MeshMessageItem[] {
  try {
    const raw = localStorage.getItem(KEYS.LOCAL_MESSAGES);
    return raw ? (JSON.parse(raw) as MeshMessageItem[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalMessage(msg: MeshMessageItem): MeshMessageItem[] {
  const list = loadLocalMessages();
  const idx = list.findIndex((m) => m.messageId === msg.messageId);
  if (idx >= 0) list[idx] = msg;
  else list.unshift(msg);
  // Keep priority queue sorted: 1. SOS, 2. MEDICAL, 3. LOCATION, 4. CHAT
  list.sort((a, b) => a.priorityRank - b.priorityRank || b.createdAt.localeCompare(a.createdAt));
  localStorage.setItem(KEYS.LOCAL_MESSAGES, JSON.stringify(list));
  return list;
}

export function markMessagesSynced(ids: string[]): MeshMessageItem[] {
  const set = new Set(ids);
  const updated = loadLocalMessages().map((m) => (set.has(m.messageId) ? { ...m, synced: true } : m));
  localStorage.setItem(KEYS.LOCAL_MESSAGES, JSON.stringify(updated));
  return updated;
}

export function loadSeenMessageIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS.SEEN_IDS);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveSeenMessageIds(set: Set<string>): void {
  localStorage.setItem(KEYS.SEEN_IDS, JSON.stringify(Array.from(set).slice(-500)));
}

export async function createEncryptedPayloadPreview(payload: object): Promise<string> {
  const json = JSON.stringify(payload);
  try {
    if (window.crypto?.subtle) {
      const encoded = new TextEncoder().encode(json);
      const hashBuf = await window.crypto.subtle.digest('SHA-256', encoded);
      const hex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32)
        .toUpperCase();
      return `AES256-GCM:${hex}`;
    }
  } catch {
    // Fallback below
  }
  return `AES256-GCM:${Math.abs(json.length * 2654435761).toString(16).toUpperCase()}`;
}
