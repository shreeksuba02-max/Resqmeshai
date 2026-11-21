import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArchitectureExplorer } from './components/architecture/ArchitectureExplorer';
import { RescueDashboard } from './components/dashboard/RescueDashboard';
import { FieldDeviceWorkspace } from './components/mobile/FieldDeviceWorkspace';
import { MeshSimulator } from './components/simulator/MeshSimulator';
import { api } from './services/api';
import {
  createEncryptedPayloadPreview,
  getOfflineMode,
  loadAuthSession,
  loadLocalEmergencies,
  loadLocalMessages,
  loadShakeSettings,
  markEmergenciesSynced,
  markMessagesSynced,
  saveAuthSession,
  saveLocalEmergency,
  saveLocalMessage,
  saveShakeSettings,
  setOfflineMode,
  type ShakeSettings,
} from './services/offlineStore';
import type {
  AnalyticsResponse,
  AppWorkspace,
  DispatchItem,
  EmergencyCategory,
  EmergencyItem,
  MeshMessageItem,
  MeshMessageType,
  RelayHistoryItem,
  RescueTeamItem,
  UserProfile,
  UserRole,
} from './types/rescue';

export default function App() {
  const [workspace, setWorkspace] = useState<AppWorkspace>('dashboard');
  const [auth, setAuth] = useState<{ token: string | null; user: UserProfile | null }>(() =>
    loadAuthSession()
  );
  const [offlineMode, setOfflineState] = useState<boolean>(() => getOfflineMode());
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  const [emergencies, setEmergencies] = useState<EmergencyItem[]>([]);
  const [teams, setTeams] = useState<RescueTeamItem[]>([]);
  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [relayHistory, setRelayHistory] = useState<RelayHistoryItem[]>([]);
  const [serverMessages, setServerMessages] = useState<MeshMessageItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  const [localEmergencies, setLocalEmergencies] = useState<EmergencyItem[]>(() =>
    loadLocalEmergencies()
  );
  const [localMessages, setLocalMessages] = useState<MeshMessageItem[]>(() =>
    loadLocalMessages()
  );
  const [shakeSettings, setShakeSettings] = useState<ShakeSettings>(() =>
    loadShakeSettings()
  );

  const socketRef = useRef<Socket | null>(null);

  const refreshBackendData = useCallback(async () => {
    if (getOfflineMode()) return;
    try {
      const [emRes, teamRes, dispRes, relRes, msgRes, anaRes] = await Promise.all([
        api.getEmergencies(),
        api.getRescueTeams(),
        api.getDispatches(),
        api.getRelayHistory(),
        api.getMessages(),
        api.getAnalytics(),
      ]);
      setEmergencies(emRes.emergencies);
      setTeams(teamRes.teams);
      setDispatches(dispRes.dispatches);
      setRelayHistory(relRes.relayHistory);
      setServerMessages(msgRes.messages);
      setAnalytics(anaRes);
    } catch {
      // Backend unreachable; keep current state intact
    }
  }, []);

  // Initial load + Socket.IO lifecycle
  useEffect(() => {
    void refreshBackendData();
  }, [refreshBackendData]);

  useEffect(() => {
    if (offlineMode) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      return;
    }

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      void refreshBackendData();
    });
    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Idempotent real-time handlers
    socket.on('emergency:created', (record: EmergencyItem) => {
      setEmergencies((prev) => {
        if (prev.some((e) => e.messageId === record.messageId)) return prev;
        return [record, ...prev].sort(
          (a, b) => a.priority - b.priority || b.severityScore - a.severityScore
        );
      });
      void api.getAnalytics().then(setAnalytics).catch(() => {});
    });

    socket.on('emergency:updated', (record: EmergencyItem) => {
      setEmergencies((prev) =>
        prev.map((e) => (e.messageId === record.messageId ? record : e))
      );
      void api.getRescueTeams().then((r) => setTeams(r.teams)).catch(() => {});
      void api.getAnalytics().then(setAnalytics).catch(() => {});
    });

    socket.on('dispatch:created', () => {
      void api.getDispatches().then((r) => setDispatches(r.dispatches)).catch(() => {});
    });

    socket.on('message:created', (msg: MeshMessageItem) => {
      setServerMessages((prev) => {
        if (prev.some((m) => m.messageId === msg.messageId)) return prev;
        return [msg, ...prev].sort((a, b) => a.priorityRank - b.priorityRank);
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [offlineMode, refreshBackendData]);

  const syncOfflineQueue = useCallback(async (): Promise<{
    synced: number;
    duplicates: number;
  }> => {
    const unsyncedEm = loadLocalEmergencies().filter((e) => !e.syncedAt);
    const unsyncedMsg = loadLocalMessages().filter((m) => !m.synced);
    if (unsyncedEm.length === 0 && unsyncedMsg.length === 0) {
      return { synced: 0, duplicates: 0 };
    }
    const res = await api.syncOfflineBatch(unsyncedEm, unsyncedMsg);
    if (res.acknowledged) {
      setLocalEmergencies(markEmergenciesSynced(res.acknowledgements));
      setLocalMessages(markMessagesSynced(res.syncedMessageIds));
      await refreshBackendData();
    }
    return { synced: res.syncedCount, duplicates: res.duplicateCount };
  }, [refreshBackendData]);

  async function handleToggleOffline(nextOffline: boolean) {
    setOfflineMode(nextOffline);
    setOfflineState(nextOffline);
    if (!nextOffline) {
      // Internet recovered: trigger automatic Store-Carry-Forward synchronization
      try {
        await syncOfflineQueue();
        await refreshBackendData();
      } catch {
        // Retry available manually
      }
    }
  }

  async function handleLogin(email: string, password: string) {
    const res = await api.login(email, password);
    saveAuthSession(res.token, res.user);
    setAuth({ token: res.token, user: res.user });
  }

  async function handleRegister(payload: {
    name: string;
    email: string;
    password: string;
    phone: string;
    role: UserRole;
    bloodGroup: string;
    medicalNotes: string;
  }) {
    const res = await api.register(payload);
    saveAuthSession(res.token, res.user);
    setAuth({ token: res.token, user: res.user });
  }

  function handleLogout() {
    saveAuthSession(null, null);
    setAuth({ token: null, user: null });
  }

  async function handleCreateSos(draft: {
    emergencyType: string;
    emergencyCategory: EmergencyCategory;
    latitude: number;
    longitude: number;
    locationLabel: string;
    injuryStatus: boolean;
    victimCount: number;
    firePresent: boolean;
    floodSeverity: number;
    medicalUrgency: number;
    trappedPersonStatus: boolean;
    reportedDangerLevel: number;
    description: string;
  }): Promise<EmergencyItem> {
    const messageId = `SOS-${new Date().getFullYear()}-${Math.random()
      .toString(16)
      .slice(2, 6)
      .toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const encryptedPayload = await createEncryptedPayloadPreview({
      messageId,
      timestamp,
      ...draft,
    });

    // Local rule-based triage score if offline
    let severity: EmergencyItem['severity'] = 'HIGH';
    let severityScore = 70;
    if (draft.trappedPersonStatus || draft.firePresent || draft.medicalUrgency >= 3) {
      severity = 'CRITICAL';
      severityScore = 90;
    }

    const localRecord: EmergencyItem = {
      messageId,
      userId: auth.user?.id ?? 'usr-field-guest',
      reporterName: auth.user?.name ?? 'Field Survivor',
      emergencyType: draft.emergencyType,
      emergencyCategory: draft.emergencyCategory,
      latitude: draft.latitude,
      longitude: draft.longitude,
      locationLabel: draft.locationLabel,
      timestamp,
      severity,
      severityScore,
      priority: severity === 'CRITICAL' ? 1 : 2,
      ttl: 10,
      hopCount: 0,
      status: 'STORED_LOCALLY',
      injuryStatus: draft.injuryStatus,
      victimCount: draft.victimCount,
      firePresent: draft.firePresent,
      floodSeverity: draft.floodSeverity,
      medicalUrgency: draft.medicalUrgency,
      trappedPersonStatus: draft.trappedPersonStatus,
      reportedDangerLevel: draft.reportedDangerLevel,
      description: draft.description,
      recommendedResponse: 'Awaiting Rescue Team Triage',
      aiConfidence: null,
      modelSource: 'local_offline_fallback',
      encryptedPayload,
      routingProtocol: 'EPIDEMIC',
      syncedAt: null,
    };

    // Always store locally first (Store-Carry-Forward invariant)
    setLocalEmergencies(saveLocalEmergency(localRecord));

    if (!offlineMode) {
      try {
        const res = await api.createEmergency(localRecord);
        const confirmed = res.emergency;
        setLocalEmergencies(saveLocalEmergency(confirmed));
        await refreshBackendData();
        return confirmed;
      } catch {
        return localRecord;
      }
    }

    return localRecord;
  }

  async function handleSendMeshMessage(type: MeshMessageType, payload: string) {
    const priorityRank =
      type === 'SOS' ? 1 : type === 'MEDICAL' ? 2 : type === 'LOCATION' ? 3 : 4;
    const protocol = type === 'SOS' || type === 'MEDICAL' ? 'EPIDEMIC' : 'PROPHET';
    const messageId = `MSG-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 6 * 3600000).toISOString();
    const encryptedDigest = await createEncryptedPayloadPreview({ messageId, payload });

    const localMsg: MeshMessageItem = {
      messageId,
      senderId: auth.user?.id ?? 'usr-field',
      senderName: auth.user?.name ?? 'Field Handset',
      messageType: type,
      priorityRank,
      routingProtocol: protocol,
      payload,
      encryptedDigest,
      ttl: type === 'SOS' ? 10 : 6,
      hopCount: 0,
      createdAt,
      expiresAt,
      synced: false,
    };

    setLocalMessages(saveLocalMessage(localMsg));

    if (!offlineMode) {
      try {
        const res = await api.sendMessage({
          senderId: localMsg.senderId,
          senderName: localMsg.senderName,
          messageType: type,
          payload,
          ttl: localMsg.ttl,
        });
        setLocalMessages(markMessagesSynced([localMsg.messageId]));
        setServerMessages((prev) => [res.message, ...prev]);
      } catch {
        // Remains in local offline queue
      }
    }
  }

  async function handleCommitSimulatedSos(item: EmergencyItem) {
    await api.syncOfflineBatch([item], []);
    await refreshBackendData();
  }

  return (
    <div className="min-h-screen bg-[#07111F] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-8 border-b border-slate-800 bg-[#07111F]/95 px-4 py-3.5 backdrop-blur-md sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setWorkspace('dashboard')}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          RescueMesh AI
        </button>

        {/* Zone 2: 4 Clean Single-Line Navigation Links */}
        <nav className="flex items-center gap-5 overflow-x-auto text-sm font-medium text-slate-400">
          {(
            [
              { id: 'dashboard', label: 'Rescue Dashboard' },
              { id: 'field-app', label: 'Field Device' },
              { id: 'mesh-sim', label: 'Mesh Simulator' },
              { id: 'architecture', label: 'Architecture' },
            ] as Array<{ id: AppWorkspace; label: string }>
          ).map((nav) => (
            <button
              key={nav.id}
              type="button"
              onClick={() => setWorkspace(nav.id)}
              className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors ${
                workspace === nav.id
                  ? 'border-cyan-400 text-white'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              {nav.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="shrink-0">
          {workspace !== 'field-app' ? (
            <button
              type="button"
              onClick={() => setWorkspace('field-app')}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-red-500 transition-colors"
            >
              Open Field SOS
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setWorkspace('dashboard')}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 whitespace-nowrap shrink-0 hover:bg-cyan-400 transition-colors"
            >
              Command Center
            </button>
          )}
        </div>
      </header>

      {/* Active Workspace */}
      {workspace === 'dashboard' && (
        <RescueDashboard
          emergencies={emergencies}
          teams={teams}
          dispatches={dispatches}
          relayHistory={relayHistory}
          analytics={analytics}
          user={auth.user}
          token={auth.token}
          socketConnected={socketConnected}
          onRefresh={refreshBackendData}
          onCommanderLogin={handleLogin}
        />
      )}

      {workspace === 'field-app' && (
        <FieldDeviceWorkspace
          user={auth.user}
          offlineMode={offlineMode}
          onToggleOffline={handleToggleOffline}
          localEmergencies={localEmergencies}
          serverEmergencies={emergencies}
          localMessages={localMessages}
          serverMessages={serverMessages}
          shakeSettings={shakeSettings}
          onUpdateShakeSettings={(s) => {
            saveShakeSettings(s);
            setShakeSettings(s);
          }}
          onCreateSos={handleCreateSos}
          onSendMeshMessage={handleSendMeshMessage}
          onSyncNow={syncOfflineQueue}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onLogout={handleLogout}
        />
      )}

      {workspace === 'mesh-sim' && (
        <MeshSimulator onCommitSimulatedSosToBackend={handleCommitSimulatedSos} />
      )}

      {workspace === 'architecture' && <ArchitectureExplorer />}
    </div>
  );
}
