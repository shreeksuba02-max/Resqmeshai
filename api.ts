import type {
  AnalyticsResponse,
  DeliveryStatus,
  DispatchItem,
  EmergencyItem,
  MeshMessageItem,
  RelayHistoryItem,
  RescueTeamItem,
  UserProfile,
  UserRole,
} from '../types/rescue';

async function request<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  register(payload: {
    name: string;
    email: string;
    password: string;
    phone: string;
    role: UserRole;
    bloodGroup?: string;
    medicalNotes?: string;
  }) {
    return request<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(email: string, password: string) {
    return request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getEmergencies(params?: { severity?: string; status?: string; search?: string }) {
    const q = new URLSearchParams();
    if (params?.severity && params.severity !== 'ALL') q.set('severity', params.severity);
    if (params?.status && params.status !== 'ALL') q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return request<{ emergencies: EmergencyItem[] }>(`/api/emergency${qs ? `?${qs}` : ''}`);
  },

  getEmergencyById(id: string) {
    return request<{
      emergency: EmergencyItem;
      dispatches: DispatchItem[];
      relayHistory: RelayHistoryItem[];
    }>(`/api/emergency/${encodeURIComponent(id)}`);
  },

  createEmergency(payload: Partial<EmergencyItem>) {
    return request<{ acknowledged: boolean; duplicate: boolean; emergency: EmergencyItem }>(
      '/api/emergency/create',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  syncOfflineBatch(emergencies: EmergencyItem[], messages: MeshMessageItem[]) {
    return request<{
      acknowledged: boolean;
      syncedCount: number;
      duplicateCount: number;
      acknowledgements: Array<{ messageId: string; status: 'SYNCED' | 'DUPLICATE'; serverTimestamp: string }>;
      syncedMessageIds: string[];
    }>('/api/emergency/sync', {
      method: 'POST',
      body: JSON.stringify({ emergencies, messages }),
    });
  },

  updateEmergencyStatus(id: string, status: DeliveryStatus, dispatchNotes: string | undefined, token: string) {
    return request<{ emergency: EmergencyItem }>(`/api/emergency/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, dispatchNotes }),
    }, token);
  },

  assignDispatch(emergencyId: string, teamId: string, notes: string, token: string) {
    return request<{ dispatch: DispatchItem; emergency: EmergencyItem }>(
      '/api/dispatch/assign',
      {
        method: 'POST',
        body: JSON.stringify({ emergencyId, teamId, notes }),
      },
      token
    );
  },

  getRescueTeams() {
    return request<{ teams: RescueTeamItem[] }>('/api/rescue-teams');
  },

  getDispatches() {
    return request<{ dispatches: DispatchItem[] }>('/api/dispatches');
  },

  getMessages() {
    return request<{ messages: MeshMessageItem[] }>('/api/messages');
  },

  sendMessage(payload: {
    senderId: string;
    senderName: string;
    messageType: string;
    payload: string;
    ttl?: number;
  }) {
    return request<{ message: MeshMessageItem }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getRelayHistory() {
    return request<{ relayHistory: RelayHistoryItem[] }>('/api/relay-history');
  },

  predictSeverity(payload: {
    emergencyCategory: string;
    injuryStatus: boolean;
    victimCount: number;
    firePresent: boolean;
    floodSeverity: number;
    medicalUrgency: number;
    trappedPersonStatus: boolean;
    reportedDangerLevel: number;
    useFallbackOnly?: boolean;
  }) {
    return request<{
      severityScore: number;
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      recommendedResponseCategory: string;
      confidence: number | null;
      classProbabilities?: Record<string, number>;
      modelSource: string;
      advisoryNote: string;
    }>('/api/ai/predict', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAnalytics() {
    return request<AnalyticsResponse>('/api/analytics');
  },
};
