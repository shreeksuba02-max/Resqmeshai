import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  BatteryCharging,
  Bluetooth,
  CheckCircle2,
  Compass,
  Flame,
  HeartPulse,
  HelpCircle,
  History,
  Info,
  Lock,
  MapPin,
  MessageSquare,
  Navigation,
  PhoneCall,
  Radio,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Smartphone,
  User,
  Vibrate,
  Waves,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import {
  createEncryptedPayloadPreview,
  type ShakeSettings,
} from '../../services/offlineStore';
import type {
  DeliveryStatus,
  EmergencyCategory,
  EmergencyItem,
  MeshMessageItem,
  MeshMessageType,
  MobileScreenId,
  UserProfile,
  UserRole,
} from '../../types/rescue';
import {
  formatCategoryLabel,
  formatDeliveryStatus,
  SeverityText,
} from '../common/SeverityBadge';

interface FieldDeviceWorkspaceProps {
  user: UserProfile | null;
  offlineMode: boolean;
  onToggleOffline: (offline: boolean) => void;
  localEmergencies: EmergencyItem[];
  serverEmergencies: EmergencyItem[];
  localMessages: MeshMessageItem[];
  serverMessages: MeshMessageItem[];
  shakeSettings: ShakeSettings;
  onUpdateShakeSettings: (s: ShakeSettings) => void;
  onCreateSos: (draft: {
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
  }) => Promise<EmergencyItem>;
  onSendMeshMessage: (type: MeshMessageType, text: string) => Promise<void>;
  onSyncNow: () => Promise<{ synced: number; duplicates: number }>;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (payload: {
    name: string;
    email: string;
    password: string;
    phone: string;
    role: UserRole;
    bloodGroup: string;
    medicalNotes: string;
  }) => Promise<void>;
  onLogout: () => void;
}

const SCREEN_LIST: Array<{ id: MobileScreenId; label: string; group: string }> = [
  { id: 'splash', label: '01. Splash Screen', group: 'Onboarding & Auth' },
  { id: 'onboarding', label: '02. Onboarding', group: 'Onboarding & Auth' },
  { id: 'login', label: '03. Login', group: 'Onboarding & Auth' },
  { id: 'register', label: '04. Registration', group: 'Onboarding & Auth' },
  { id: 'role-select', label: '05. Role Selection', group: 'Onboarding & Auth' },
  { id: 'home', label: '06. Home Dashboard', group: 'Core Field Ops' },
  { id: 'sos-create', label: '07. SOS Emergency', group: 'Core Field Ops' },
  { id: 'category-select', label: '08. Category Selection', group: 'Core Field Ops' },
  { id: 'location', label: '09. GPS Location', group: 'Core Field Ops' },
  { id: 'emergency-status', label: '10. Emergency Status', group: 'Core Field Ops' },
  { id: 'emergency-history', label: '11. Emergency History', group: 'Core Field Ops' },
  { id: 'mesh-network', label: '12. Mesh Network', group: 'Mesh & Sensors' },
  { id: 'nearby-devices', label: '13. Nearby Devices', group: 'Mesh & Sensors' },
  { id: 'shake-settings', label: '14. Shake-to-SOS', group: 'Mesh & Sensors' },
  { id: 'messages', label: '15. Priority Messages', group: 'Mesh & Sensors' },
  { id: 'offline-mode', label: '16. Offline Mode & Sync', group: 'System' },
  { id: 'profile', label: '17. User Profile', group: 'System' },
  { id: 'settings', label: '18. Settings', group: 'System' },
  { id: 'help-about', label: '19. Help & About', group: 'System' },
];

const SIMULATED_PEERS = [
  { id: 'RM-REL-882C', name: 'Relay B (Volunteer Moto)', transport: 'BLE 5.2', rssi: -58, distance: '18m', role: 'RELAY_NODE' },
  { id: 'RM-REL-510F', name: 'Relay C (Roof Solar Node)', transport: 'Wi-Fi Direct', rssi: -49, distance: '42m', role: 'RELAY_NODE' },
  { id: 'RM-DEV-711B', name: 'Survivor Handset #711', transport: 'BLE 5.0', rssi: -74, distance: '31m', role: 'SURVIVOR' },
];

const CATEGORIES: Array<{ id: EmergencyCategory; label: string; desc: string }> = [
  { id: 'COLLAPSE_TRAPPED', label: 'Building Collapse / Trapped', desc: 'Structural failure or debris entrapment' },
  { id: 'MEDICAL_CARDIAC_TRAUMA', label: 'Medical / Trauma Emergency', desc: 'Severe bleeding, cardiac, or unconsciousness' },
  { id: 'FLOOD_SUBMERSION', label: 'Flood / Rising Water', desc: 'Submerged roads or stranded on rooftop' },
  { id: 'FIRE_HAZMAT', label: 'Fire / Gas / Hazmat', desc: 'Active fire, smoke inhalation, or chemical leak' },
  { id: 'LANDSLIDE', label: 'Landslide / Mudslide', desc: 'Slope failure blocking exit routes' },
  { id: 'SHELTER_SUPPLY', label: 'Shelter / Food & Water', desc: 'Evacuees needing potable water or medicine' },
  { id: 'GENERAL_SOS', label: 'General Emergency SOS', desc: 'Immediate distress requiring field triage' },
];

export function FieldDeviceWorkspace({
  user,
  offlineMode,
  onToggleOffline,
  localEmergencies,
  serverEmergencies,
  localMessages,
  serverMessages,
  shakeSettings,
  onUpdateShakeSettings,
  onCreateSos,
  onSendMeshMessage,
  onSyncNow,
  onLogin,
  onRegister,
  onLogout,
}: FieldDeviceWorkspaceProps) {
  const [screen, setScreen] = useState<MobileScreenId>('home');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState<UserRole>(user?.role ?? 'SURVIVOR');

  // Auth form state
  const [loginEmail, setLoginEmail] = useState('survivor@rescuemesh.org');
  const [loginPass, setLoginPass] = useState('Rescue@2026');
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '+91-',
    role: 'SURVIVOR' as UserRole,
    bloodGroup: 'O+',
    medicalNotes: '',
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Device telemetry state
  const [coords, setCoords] = useState({ lat: 13.0067, lng: 80.2206, label: 'Guindy Sector 4, Chennai' });
  const [gpsStatus, setGpsStatus] = useState<'IDLE' | 'LOCKED' | 'FETCHING'>('LOCKED');
  const [batteryLevel, setBatteryLevel] = useState<number>(78);
  const [meshConnected, setMeshConnected] = useState<boolean>(true);

  // SOS Builder state
  const [sosCategory, setSosCategory] = useState<EmergencyCategory>('FLOOD_SUBMERSION');
  const [sosForm, setSosForm] = useState({
    emergencyType: 'SOS',
    injuryStatus: true,
    victimCount: 3,
    firePresent: false,
    floodSeverity: 2,
    medicalUrgency: 2,
    trappedPersonStatus: false,
    reportedDangerLevel: 4,
    description: 'Water rising into ground floor; 3 adults stranded without power.',
  });
  const [activeSosId, setActiveSosId] = useState<string | null>(
    localEmergencies[0]?.messageId ?? serverEmergencies[0]?.messageId ?? null
  );
  const [sosBusy, setSosBusy] = useState(false);

  // Shake-to-SOS 3-second countdown modal state
  const [shakeCountdown, setShakeCountdown] = useState<number | null>(null);
  const shakeTimestampsRef = useRef<number[]>([]);

  // Messages state
  const [msgType, setMsgType] = useState<MeshMessageType>('MEDICAL');
  const [msgText, setMsgText] = useState('');
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [cryptoPreview, setCryptoPreview] = useState<string>('AES256-GCM:PENDING');

  // Battery API listener (real browser capability if supported)
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; addEventListener: (e: string, cb: () => void) => void }>;
    };
    if (nav.getBattery) {
      nav
        .getBattery()
        .then((b) => {
          setBatteryLevel(Math.round(b.level * 100));
          b.addEventListener('levelchange', () => setBatteryLevel(Math.round(b.level * 100)));
        })
        .catch(() => {});
    }
  }, []);

  // DeviceMotion shake detection (for mobile browsers supporting accelerometer)
  useEffect(() => {
    if (!shakeSettings.enabled) return;
    const threshold =
      shakeSettings.sensitivity === 'HIGH' ? 14 : shakeSettings.sensitivity === 'MEDIUM' ? 20 : 27;

    function handleMotion(e: DeviceMotionEvent) {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      if (mag > threshold) {
        const now = Date.now();
        const recent = shakeTimestampsRef.current.filter(
          (t) => now - t <= shakeSettings.timeWindowMs
        );
        recent.push(now);
        shakeTimestampsRef.current = recent;
        if (recent.length >= shakeSettings.requiredShakes && shakeCountdown === null) {
          shakeTimestampsRef.current = [];
          setShakeCountdown(3);
        }
      }
    }

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [shakeSettings, shakeCountdown]);

  // 3-second Shake-to-SOS countdown timer
  useEffect(() => {
    if (shakeCountdown === null) return;
    if (shakeCountdown <= 0) {
      setShakeCountdown(null);
      void handleQuickSosTrigger();
      return;
    }
    const timer = window.setTimeout(() => {
      setShakeCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeCountdown]);

  // Update crypto preview whenever SOS draft changes
  useEffect(() => {
    void createEncryptedPayloadPreview({
      category: sosCategory,
      coords,
      ...sosForm,
    }).then(setCryptoPreview);
  }, [sosCategory, coords, sosForm]);

  const combinedEmergencies = [
    ...localEmergencies,
    ...serverEmergencies.filter(
      (se) => !localEmergencies.some((le) => le.messageId === se.messageId)
    ),
  ];

  const activeSosRecord =
    combinedEmergencies.find((e) => e.messageId === activeSosId) ?? combinedEmergencies[0] ?? null;

  const combinedMessages = [
    ...localMessages.filter((m) => !m.synced),
    ...serverMessages.filter((sm) => !localMessages.some((lm) => lm.messageId === sm.messageId)),
  ].sort((a, b) => a.priorityRank - b.priorityRank || b.createdAt.localeCompare(a.createdAt));

  const unsyncedEmergencyCount = localEmergencies.filter((e) => !e.syncedAt).length;
  const unsyncedMessageCount = localMessages.filter((m) => !m.synced).length;

  const connectionLabel = !offlineMode
    ? 'ONLINE'
    : meshConnected
    ? 'MESH CONNECTED (OFFLINE)'
    : 'OFFLINE';

  function captureRealGps() {
    if (!navigator.geolocation) {
      setGpsStatus('LOCKED');
      return;
    }
    setGpsStatus('FETCHING');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          label: `GPS Fix (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
        });
        setGpsStatus('LOCKED');
      },
      () => {
        setGpsStatus('LOCKED');
      },
      { timeout: 5000 }
    );
  }

  async function handleQuickSosTrigger() {
    setSosBusy(true);
    try {
      const created = await onCreateSos({
        emergencyType: sosForm.emergencyType,
        emergencyCategory: sosCategory,
        latitude: coords.lat,
        longitude: coords.lng,
        locationLabel: coords.label,
        injuryStatus: sosForm.injuryStatus,
        victimCount: sosForm.victimCount,
        firePresent: sosForm.firePresent,
        floodSeverity: sosForm.floodSeverity,
        medicalUrgency: sosForm.medicalUrgency,
        trappedPersonStatus: sosForm.trappedPersonStatus,
        reportedDangerLevel: sosForm.reportedDangerLevel,
        description: sosForm.description,
      });
      setActiveSosId(created.messageId);
      setScreen('emergency-status');
    } finally {
      setSosBusy(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      await onLogin(loginEmail, loginPass);
      setScreen('home');
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      await onRegister(regForm);
      setScreen('home');
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSendMsg(e: React.FormEvent) {
    e.preventDefault();
    if (!msgText.trim()) return;
    await onSendMeshMessage(msgType, msgText.trim());
    setMsgText('');
  }

  async function handleManualSync() {
    if (offlineMode) {
      setSyncResult('Cannot sync while Offline Mode is enabled. Restore internet first.');
      return;
    }
    const res = await onSyncNow();
    setSyncResult(`Synchronized ${res.synced} SOS packet(s) (${res.duplicates} duplicate skipped).`);
  }

  const webBluetoothSupported =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-12">
      {/* LEFT COLUMN: Mobile Field Device Frame */}
      <div className="lg:col-span-5 xl:col-span-4">
        <div className="relative mx-auto flex min-h-[740px] max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#0A1628] shadow-2xl">
          {/* Device Status Bar */}
          <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#07111F] px-4 py-2.5 text-[11px]">
            <div className="flex items-center gap-2">
              {offlineMode ? (
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              )}
              <span
                className={`font-mono font-semibold ${
                  !offlineMode
                    ? 'text-emerald-400'
                    : meshConnected
                    ? 'text-cyan-400'
                    : 'text-amber-400'
                }`}
              >
                {connectionLabel}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Bluetooth className="h-3 w-3 text-cyan-400" />
                {SIMULATED_PEERS.length}
              </span>
              <span className="inline-flex items-center gap-1">
                <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" />
                {batteryLevel}%
              </span>
            </div>
          </div>

          {/* Mobile App Top Bar (when not splash/onboarding) */}
          {screen !== 'splash' && screen !== 'onboarding' && (
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#0D1B2E] px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {screen !== 'home' && (
                  <button
                    type="button"
                    onClick={() => setScreen('home')}
                    aria-label="Back to Home"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#15253E] text-slate-200 hover:bg-slate-700"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <img
                  src="/src/assets/images/rescuemesh_emblem_1795278052472.jpg"
                  alt="RescueMesh emblem"
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-lg object-cover border border-slate-700"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold text-white">
                    RescueMesh AI
                  </p>
                  <p className="truncate font-mono text-[10px] text-cyan-400">
                    {user ? `${user.role} · ${user.deviceId}` : 'GUEST NODE'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScreen('offline-mode')}
                className={`rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-semibold whitespace-nowrap ${
                  offlineMode
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {offlineMode ? 'OFFLINE' : 'ONLINE'}
              </button>
            </div>
          )}

          {/* Screen Body */}
          <div className="flex-1 overflow-y-auto p-4 pb-20">
            {/* 1. SPLASH SCREEN */}
            {screen === 'splash' && (
              <div className="flex h-full min-h-[580px] flex-col items-center justify-center text-center">
                <img
                  src="/src/assets/images/rescuemesh_emblem_1795278052472.jpg"
                  alt="RescueMesh AI Logo"
                  referrerPolicy="no-referrer"
                  className="h-28 w-28 rounded-2xl border border-cyan-500/30 object-cover shadow-lg"
                />
                <h2 className="mt-6 font-display text-2xl font-bold text-white">
                  RescueMesh AI
                </h2>
                <p className="mt-1 font-mono text-xs tracking-widest text-cyan-400">
                  OFFLINE. CONNECTED. ALIVE.
                </p>
                <p className="mt-4 max-w-xs text-xs leading-relaxed text-slate-400">
                  Store → Carry → Forward emergency communication when cellular towers fail.
                </p>
                <button
                  type="button"
                  onClick={() => setScreen('onboarding')}
                  className="mt-8 w-full max-w-[240px] rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-500"
                >
                  Continue
                </button>
              </div>
            )}

            {/* 2. ONBOARDING */}
            {screen === 'onboarding' && (
              <div className="flex min-h-[560px] flex-col justify-between">
                <div>
                  <img
                    src="/src/assets/images/disaster_mesh_terrain_1795278054122.jpg"
                    alt="Disaster mesh relay terrain"
                    referrerPolicy="no-referrer"
                    className="h-44 w-full rounded-xl border border-slate-800 object-cover"
                  />
                  <div className="mt-5">
                    <p className="font-mono text-xs text-cyan-400">
                      Step {onboardingStep + 1} of 3
                    </p>
                    <h3 className="mt-1 font-display text-xl font-bold text-white">
                      {onboardingStep === 0 && 'No Tower. Still Communication.'}
                      {onboardingStep === 1 && 'Store → Carry → Forward Mesh'}
                      {onboardingStep === 2 && 'AI-Assisted Rescue Triage'}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
                      {onboardingStep === 0 &&
                        'Create encrypted SOS packets with GPS coordinates even in complete cellular blackouts.'}
                      {onboardingStep === 1 &&
                        'Nearby Android devices carry your emergency packet over BLE & Wi-Fi Direct until a Rescue Team or internet gateway is reached.'}
                      {onboardingStep === 2 &&
                        'Random Forest severity scoring helps dispatchers prioritize trapped or critically injured survivors first.'}
                    </p>
                  </div>
                </div>
                <div className="space-y-2.5 pt-6">
                  {onboardingStep < 2 ? (
                    <button
                      type="button"
                      onClick={() => setOnboardingStep((s) => s + 1)}
                      className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-slate-950"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setScreen('role-select')}
                      className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white"
                    >
                      Choose Role & Enter
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScreen('home')}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Skip to Home Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* 3. LOGIN */}
            {screen === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Sign In</h3>
                  <p className="text-xs text-slate-400">
                    Authenticate with your RescueMesh account.
                  </p>
                </div>
                <div className="space-y-2.5">
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full rounded-xl border border-slate-700 bg-[#07111F] px-3.5 py-2.5 text-xs text-white"
                  />
                  <input
                    type="password"
                    required
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-xl border border-slate-700 bg-[#07111F] px-3.5 py-2.5 text-xs text-white"
                  />
                </div>
                {authError && <p className="text-xs text-red-400">{authError}</p>}
                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full rounded-xl bg-cyan-500 py-3 text-xs font-semibold text-slate-950 disabled:opacity-50"
                >
                  {authBusy ? 'Authenticating...' : 'Sign In'}
                </button>
                <div className="border-t border-slate-800 pt-3">
                  <p className="mb-2 text-[11px] text-slate-400">Quick role test accounts (password: Rescue@2026):</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Survivor', email: 'survivor@rescuemesh.org' },
                      { label: 'Relay Node', email: 'relay@rescuemesh.org' },
                      { label: 'Rescue Team', email: 'commander@rescuemesh.org' },
                    ].map((preset) => (
                      <button
                        key={preset.email}
                        type="button"
                        onClick={() => {
                          setLoginEmail(preset.email);
                          setLoginPass('Rescue@2026');
                        }}
                        className="rounded-lg border border-slate-700 bg-[#15253E] py-1.5 text-[11px] text-cyan-300"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScreen('register')}
                  className="w-full text-center text-xs text-cyan-400 hover:underline"
                >
                  New user? Register device
                </button>
              </form>
            )}

            {/* 4. REGISTRATION */}
            {screen === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <h3 className="font-display text-lg font-bold text-white">Create Account</h3>
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={regForm.name}
                  onChange={(e) => setRegForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white"
                />
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={regForm.email}
                  onChange={(e) => setRegForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Password (min 6 chars)"
                  value={regForm.password}
                  onChange={(e) => setRegForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Phone"
                    value={regForm.phone}
                    onChange={(e) => setRegForm((p) => ({ ...p, phone: e.target.value }))}
                    className="rounded-xl border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white"
                  />
                  <select
                    value={regForm.role}
                    onChange={(e) => setRegForm((p) => ({ ...p, role: e.target.value as UserRole }))}
                    className="rounded-xl border border-slate-700 bg-[#07111F] px-2.5 py-2 text-xs text-white"
                  >
                    <option value="SURVIVOR">Survivor</option>
                    <option value="RELAY_NODE">Relay Node</option>
                    <option value="RESCUE_TEAM">Rescue Team</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Blood Group & Medical Notes (optional)"
                  value={regForm.medicalNotes}
                  onChange={(e) => setRegForm((p) => ({ ...p, medicalNotes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white"
                />
                {authError && <p className="text-xs text-red-400">{authError}</p>}
                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full rounded-xl bg-cyan-500 py-2.5 text-xs font-semibold text-slate-950"
                >
                  {authBusy ? 'Registering...' : 'Register & Provision Device Key'}
                </button>
              </form>
            )}

            {/* 5. ROLE SELECTION */}
            {screen === 'role-select' && (
              <div className="space-y-3">
                <h3 className="font-display text-lg font-bold text-white">Select Operating Role</h3>
                <p className="text-xs text-slate-400">
                  Choose how this handset participates in the RescueMesh network.
                </p>
                {[
                  {
                    role: 'SURVIVOR' as UserRole,
                    title: 'Survivor',
                    desc: 'Trigger SOS, share GPS, use Shake-to-SOS, and view rescue status.',
                  },
                  {
                    role: 'RELAY_NODE' as UserRole,
                    title: 'Relay Node',
                    desc: 'Discover nearby devices, store SOS packets offline, and forward along mesh.',
                  },
                  {
                    role: 'RESCUE_TEAM' as UserRole,
                    title: 'Rescue Team',
                    desc: 'Receive prioritized SOS packets, assign units, and update rescue status.',
                  },
                ].map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(item.role);
                      if (item.role === 'SURVIVOR') setLoginEmail('survivor@rescuemesh.org');
                      if (item.role === 'RELAY_NODE') setLoginEmail('relay@rescuemesh.org');
                      if (item.role === 'RESCUE_TEAM') setLoginEmail('commander@rescuemesh.org');
                      setScreen('login');
                    }}
                    className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                      selectedRole === item.role
                        ? 'border-cyan-500 bg-[#15253E]'
                        : 'border-slate-800 bg-[#0D1B2E]'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* 6. HOME DASHBOARD */}
            {screen === 'home' && (
              <div className="space-y-4">
                {/* GPS & Nearby Device Card */}
                <div className="rounded-2xl border border-slate-800 bg-[#0D1B2E] p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                      Current GPS Fix
                    </span>
                    <button
                      type="button"
                      onClick={captureRealGps}
                      className="font-mono text-[11px] text-cyan-400 hover:underline"
                    >
                      {gpsStatus === 'FETCHING' ? 'Acquiring...' : 'Refresh GPS'}
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-xs font-semibold text-white tabular-nums">
                    {coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{coords.label}</p>
                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-800 pt-2 text-[11px] text-slate-300">
                    <span>Nearby Mesh Peers: {SIMULATED_PEERS.length}</span>
                    <span>Unsynced Queue: {unsyncedEmergencyCount}</span>
                  </div>
                </div>

                {/* Primary Circular Emergency Red SOS Button */}
                <div className="flex flex-col items-center py-3">
                  <button
                    type="button"
                    onClick={() => setScreen('sos-create')}
                    className="group relative flex h-44 w-44 flex-col items-center justify-center rounded-full border-4 border-red-400/50 bg-red-600 text-white shadow-[0_0_45px_rgba(239,68,68,0.45)] transition-transform active:scale-95 hover:bg-red-500"
                  >
                    <ShieldAlert className="h-11 w-11" />
                    <span className="mt-1 font-display text-2xl font-extrabold tracking-wide">
                      SOS
                    </span>
                    <span className="text-[11px] font-medium text-red-100">
                      TAP FOR EMERGENCY
                    </span>
                  </button>
                  <p className="mt-2.5 text-center text-[11px] text-slate-400">
                    Works online or offline via Store-Carry-Forward mesh
                  </p>
                </div>

                {/* Quick Action Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSosCategory('MEDICAL_CARDIAC_TRAUMA');
                      setSosForm((p) => ({ ...p, emergencyType: 'MEDICAL', medicalUrgency: 3, injuryStatus: true }));
                      setScreen('sos-create');
                    }}
                    className="flex min-h-[68px] flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3 text-left hover:border-red-500/50"
                  >
                    <HeartPulse className="h-5 w-5 text-red-400" />
                    <span className="text-xs font-semibold text-white">Medical Emergency</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScreen('location')}
                    className="flex min-h-[68px] flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3 text-left hover:border-cyan-500/50"
                  >
                    <Navigation className="h-5 w-5 text-cyan-400" />
                    <span className="text-xs font-semibold text-white">Share Location</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScreen('emergency-history')}
                    className="flex min-h-[68px] flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3 text-left hover:border-cyan-500/50"
                  >
                    <History className="h-5 w-5 text-amber-400" />
                    <span className="text-xs font-semibold text-white">Emergency History</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScreen('settings')}
                    className="flex min-h-[68px] flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3 text-left hover:border-cyan-500/50"
                  >
                    <Settings className="h-5 w-5 text-slate-300" />
                    <span className="text-xs font-semibold text-white">Settings & Shake</span>
                  </button>
                </div>

                {/* Shake-to-SOS Quick Trigger */}
                <button
                  type="button"
                  onClick={() => setShakeCountdown(3)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] px-3.5 py-3 text-xs text-slate-200 hover:border-cyan-500/50"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Vibrate className="h-4 w-4 text-cyan-400" />
                    Test Shake-to-SOS (3-Sec Countdown)
                  </span>
                  <span className="font-mono text-[11px] text-cyan-400">Trigger</span>
                </button>
              </div>
            )}

            {/* 7. SOS EMERGENCY SCREEN */}
            {screen === 'sos-create' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-white">Create SOS Alert</h3>
                  <button
                    type="button"
                    onClick={() => setScreen('category-select')}
                    className="text-xs font-medium text-cyan-400 hover:underline"
                  >
                    Change Category
                  </button>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3 text-xs">
                  <p className="text-slate-400">Selected Category</p>
                  <p className="mt-0.5 font-semibold text-white">
                    {formatCategoryLabel(sosCategory)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-cyan-400">
                    GPS: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0D1B2E] p-2.5 text-slate-200">
                    <input
                      type="checkbox"
                      checked={sosForm.injuryStatus}
                      onChange={(e) => setSosForm((p) => ({ ...p, injuryStatus: e.target.checked }))}
                    />
                    Injured Victim(s)
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0D1B2E] p-2.5 text-slate-200">
                    <input
                      type="checkbox"
                      checked={sosForm.trappedPersonStatus}
                      onChange={(e) =>
                        setSosForm((p) => ({ ...p, trappedPersonStatus: e.target.checked }))
                      }
                    />
                    Person Trapped
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0D1B2E] p-2.5 text-slate-200">
                    <input
                      type="checkbox"
                      checked={sosForm.firePresent}
                      onChange={(e) => setSosForm((p) => ({ ...p, firePresent: e.target.checked }))}
                    />
                    Fire / Smoke
                  </label>
                  <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-2">
                    <span className="text-[10px] text-slate-400">Victims Count</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={sosForm.victimCount}
                      onChange={(e) =>
                        setSosForm((p) => ({ ...p, victimCount: Number(e.target.value) || 1 }))
                      }
                      className="w-full bg-transparent font-mono text-sm font-bold text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-2.5">
                    <span className="text-[11px] text-slate-400">Flood Level (0-3)</span>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      value={sosForm.floodSeverity}
                      onChange={(e) =>
                        setSosForm((p) => ({ ...p, floodSeverity: Number(e.target.value) }))
                      }
                      className="mt-1 w-full accent-cyan-400"
                    />
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-2.5">
                    <span className="text-[11px] text-slate-400">Danger Level (1-5)</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={sosForm.reportedDangerLevel}
                      onChange={(e) =>
                        setSosForm((p) => ({ ...p, reportedDangerLevel: Number(e.target.value) }))
                      }
                      className="mt-1 w-full accent-red-500"
                    />
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={sosForm.description}
                  onChange={(e) => setSosForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe situation, floor level, landmarks..."
                  className="w-full rounded-xl border border-slate-700 bg-[#07111F] p-3 text-xs text-white"
                />

                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#07111F] px-3 py-2 font-mono text-[10px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3 text-emerald-400" />
                    Encrypted Packet
                  </span>
                  <span className="truncate max-w-[160px] text-cyan-300">{cryptoPreview}</span>
                </div>

                <button
                  type="button"
                  disabled={sosBusy}
                  onClick={handleQuickSosTrigger}
                  className="w-full rounded-xl bg-red-600 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-red-500 disabled:opacity-50"
                >
                  {sosBusy
                    ? 'Saving & Broadcasting...'
                    : offlineMode
                    ? 'Store Locally & Broadcast via Mesh'
                    : 'Transmit SOS to Rescue Mesh'}
                </button>
              </div>
            )}

            {/* 8. EMERGENCY CATEGORY SELECTION */}
            {screen === 'category-select' && (
              <div className="space-y-2.5">
                <h3 className="font-display text-lg font-bold text-white">
                  Emergency Category
                </h3>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSosCategory(cat.id);
                      setScreen('sos-create');
                    }}
                    className={`w-full rounded-xl border p-3 text-left ${
                      sosCategory === cat.id
                        ? 'border-cyan-500 bg-[#15253E]'
                        : 'border-slate-800 bg-[#0D1B2E]'
                    }`}
                  >
                    <p className="text-xs font-semibold text-white">{cat.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{cat.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* 9. LOCATION SCREEN */}
            {screen === 'location' && (
              <div className="space-y-3.5">
                <h3 className="font-display text-lg font-bold text-white">GPS & Location Sharing</h3>
                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 text-xs space-y-2">
                  <p className="text-slate-400">Active Coordinates</p>
                  <p className="font-mono text-base font-bold text-cyan-300 tabular-nums">
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </p>
                  <p className="text-slate-300">{coords.label}</p>
                  <button
                    type="button"
                    onClick={captureRealGps}
                    className="mt-2 w-full rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950"
                  >
                    Acquire Live Browser GPS
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-400">Quick Disaster Sector Pins (Demo)</p>
                  {[
                    { lat: 12.9784, lng: 80.2195, label: 'Velachery Waterlogged Sector' },
                    { lat: 13.0382, lng: 80.2337, label: 'T. Nagar Collapse Zone' },
                    { lat: 13.0762, lng: 80.2611, label: 'Royapuram Coastal Depot' },
                  ].map((pin) => (
                    <button
                      key={pin.label}
                      type="button"
                      onClick={() => setCoords(pin)}
                      className="w-full rounded-xl border border-slate-800 bg-[#0D1B2E] px-3 py-2.5 text-left text-xs text-slate-200 hover:border-cyan-500"
                    >
                      {pin.label} ({pin.lat}, {pin.lng})
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await onSendMeshMessage(
                      'LOCATION',
                      `Location beacon: ${coords.label} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
                    );
                    setScreen('messages');
                  }}
                  className="w-full rounded-xl border border-cyan-500/40 bg-cyan-500/15 py-2.5 text-xs font-semibold text-cyan-300"
                >
                  Broadcast Location Beacon (Priority 3 · PRoPHET)
                </button>
              </div>
            )}

            {/* 10. EMERGENCY STATUS (HONEST 6-STAGE TRACKER) */}
            {screen === 'emergency-status' && (
              <div className="space-y-4">
                <h3 className="font-display text-lg font-bold text-white">
                  Emergency Delivery Status
                </h3>
                {activeSosRecord ? (
                  <>
                    <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-cyan-400">
                          {activeSosRecord.messageId}
                        </span>
                        <SeverityText severity={activeSosRecord.severity} />
                      </div>
                      <p className="mt-1.5 text-slate-200">{activeSosRecord.description}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">
                        {activeSosRecord.syncedAt
                          ? `Server ACK: ${new Date(activeSosRecord.syncedAt).toLocaleTimeString()}`
                          : 'Waiting for Rescue Team ACK (Stored Locally)'}
                      </p>
                    </div>

                    {/* Honest 6-state pipeline */}
                    <div className="space-y-2">
                      {(
                        [
                          'SOS_CREATED',
                          'STORED_LOCALLY',
                          'NEARBY_DEVICE_RECEIVED',
                          'FORWARDED',
                          'RESCUE_TEAM_RECEIVED',
                          'HELP_ASSIGNED',
                        ] as DeliveryStatus[]
                      ).map((step, idx) => {
                        const order: DeliveryStatus[] = [
                          'SOS_CREATED',
                          'STORED_LOCALLY',
                          'NEARBY_DEVICE_RECEIVED',
                          'FORWARDED',
                          'RESCUE_TEAM_RECEIVED',
                          'HELP_ASSIGNED',
                          'IN_PROGRESS',
                          'RESOLVED',
                        ];
                        const currentIdx = order.indexOf(activeSosRecord.status);
                        const reached = currentIdx >= idx;
                        return (
                          <div
                            key={step}
                            className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs ${
                              reached
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                : 'border-slate-800 bg-[#0D1B2E] text-slate-500'
                            }`}
                          >
                            <span className="flex items-center gap-2 font-medium">
                              <CheckCircle2
                                className={`h-4 w-4 ${
                                  reached ? 'text-emerald-400' : 'text-slate-600'
                                }`}
                              />
                              {formatDeliveryStatus(step)}
                            </span>
                            <span className="font-mono text-[10px]">
                              {reached ? 'CONFIRMED' : 'PENDING'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">No SOS created yet.</p>
                )}
              </div>
            )}

            {/* 11. EMERGENCY HISTORY */}
            {screen === 'emergency-history' && (
              <div className="space-y-3">
                <h3 className="font-display text-lg font-bold text-white">
                  Local & Synced History ({combinedEmergencies.length})
                </h3>
                {combinedEmergencies.map((em) => (
                  <button
                    key={em.messageId}
                    type="button"
                    onClick={() => {
                      setActiveSosId(em.messageId);
                      setScreen('emergency-status');
                    }}
                    className="w-full rounded-xl border border-slate-800 bg-[#0D1B2E] p-3 text-left text-xs hover:border-cyan-500/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-cyan-400">
                        {em.messageId}
                      </span>
                      <SeverityText severity={em.severity} />
                    </div>
                    <p className="mt-1 text-slate-200 line-clamp-2">{em.description}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      {formatDeliveryStatus(em.status)} · {em.syncedAt ? 'Synced' : 'Local Queue'}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* 12. MESH NETWORK SCREEN */}
            {screen === 'mesh-network' && (
              <div className="space-y-3.5 text-xs">
                <h3 className="font-display text-lg font-bold text-white">
                  Mesh Network & Routing
                </h3>
                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Architecture</span>
                    <span className="font-mono text-cyan-300">Store → Carry → Forward</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">SOS / Medical Routing</span>
                    <span className="font-mono text-red-400">Epidemic Flooding</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Location / Chat Routing</span>
                    <span className="font-mono text-amber-300">PRoPHET Probabilistic</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Local Dedup Cache</span>
                    <span className="font-mono text-white">{combinedEmergencies.length} IDs</span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5">
                  <p className="font-semibold text-white">Priority Pre-emption Order</p>
                  <ol className="mt-2 space-y-1.5 font-mono text-[11px] text-slate-300">
                    <li>1. SOS — Highest (Pre-empts all queues)</li>
                    <li>2. MEDICAL — High (Epidemic TTL 10)</li>
                    <li>3. LOCATION — Medium (PRoPHET TTL 6)</li>
                    <li>4. CHAT — Normal (PRoPHET TTL 4)</li>
                  </ol>
                </div>
                <button
                  type="button"
                  onClick={() => setMeshConnected((m) => !m)}
                  className="w-full rounded-xl border border-cyan-500/40 bg-cyan-500/15 py-2.5 font-semibold text-cyan-300"
                >
                  {meshConnected ? 'Pause Mesh Radio (Sim)' : 'Resume Mesh Radio (Sim)'}
                </button>
              </div>
            )}

            {/* 13. NEARBY DEVICES */}
            {screen === 'nearby-devices' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-white">Nearby Mesh Peers</h3>
                  <span className="font-mono text-[10px] text-amber-300">SIMULATION MODE</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Browser Web Bluetooth API detected:{' '}
                  <strong className="text-slate-200">
                    {webBluetoothSupported ? 'Available (Requires HTTPS & user gesture)' : 'Unavailable in sandbox'}
                  </strong>
                  . Physical BLE GATT & Wi-Fi Direct run on the Kotlin Android app.
                </p>
                {SIMULATED_PEERS.map((peer) => (
                  <div
                    key={peer.id}
                    className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-cyan-300">{peer.id}</span>
                      <span className="font-mono text-emerald-400">{peer.rssi} dBm</span>
                    </div>
                    <p className="mt-1 font-medium text-white">{peer.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {peer.transport} · ~{peer.distance} · {peer.role}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* 14. SHAKE-TO-SOS SETTINGS */}
            {screen === 'shake-settings' && (
              <div className="space-y-3.5 text-xs">
                <h3 className="font-display text-lg font-bold text-white">Shake-to-SOS</h3>
                <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3">
                  <span className="font-medium text-white">Enable 3-Shake Emergency Trigger</span>
                  <input
                    type="checkbox"
                    checked={shakeSettings.enabled}
                    onChange={(e) =>
                      onUpdateShakeSettings({ ...shakeSettings, enabled: e.target.checked })
                    }
                  />
                </label>

                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3 space-y-2">
                  <span className="text-slate-400">Sensitivity Threshold</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['LOW', 'MEDIUM', 'HIGH'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() =>
                          onUpdateShakeSettings({ ...shakeSettings, sensitivity: lvl })
                        }
                        className={`rounded-lg py-2 font-mono text-[11px] font-semibold ${
                          shakeSettings.sensitivity === lvl
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-[#07111F] text-slate-300'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShakeCountdown(3)}
                  className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white"
                >
                  Simulate 3 Intentional Shakes Now
                </button>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200 leading-relaxed">
                  Platform Note: Lock-screen and system-level power-button SOS integration are future OS-privileged enhancements and are not guaranteed functionality of the current application.
                </div>
              </div>
            )}

            {/* 15. MESSAGES (PRIORITY QUEUE) */}
            {screen === 'messages' && (
              <div className="space-y-3 text-xs">
                <h3 className="font-display text-lg font-bold text-white">
                  Mesh Priority Messages
                </h3>
                <form onSubmit={handleSendMsg} className="space-y-2">
                  <div className="flex gap-1.5">
                    {(['SOS', 'MEDICAL', 'LOCATION', 'CHAT'] as MeshMessageType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMsgType(t)}
                        className={`flex-1 rounded-lg py-1.5 font-mono text-[10px] font-semibold ${
                          msgType === t
                            ? t === 'SOS'
                              ? 'bg-red-600 text-white'
                              : 'bg-cyan-500 text-slate-950'
                            : 'bg-[#0D1B2E] text-slate-400'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      placeholder="Send encrypted mesh message..."
                      className="flex-1 rounded-xl border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-cyan-500 px-3 text-slate-950 font-semibold"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </form>

                <div className="space-y-2">
                  {combinedMessages.map((m) => (
                    <div
                      key={m.messageId}
                      className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span
                          className={
                            m.messageType === 'SOS'
                              ? 'text-red-400 font-bold'
                              : m.messageType === 'MEDICAL'
                              ? 'text-amber-400 font-bold'
                              : 'text-cyan-400'
                          }
                        >
                          P{m.priorityRank} · {m.messageType} ({m.routingProtocol})
                        </span>
                        <span className="text-slate-400">
                          {m.synced ? 'Synced' : 'Queued Offline'}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-100">{m.payload}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        {m.senderName} · TTL {m.ttl}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 16. OFFLINE MODE & SYNC */}
            {screen === 'offline-mode' && (
              <div className="space-y-3.5 text-xs">
                <h3 className="font-display text-lg font-bold text-white">
                  Offline Mode & Cloud Sync
                </h3>
                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Simulate Cellular Blackout</span>
                    <button
                      type="button"
                      onClick={() => onToggleOffline(!offlineMode)}
                      className={`rounded-lg px-3 py-1.5 font-mono text-[11px] font-semibold ${
                        offlineMode
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#15253E] text-slate-200'
                      }`}
                    >
                      {offlineMode ? 'OFFLINE ACTIVE' : 'GO OFFLINE'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    When offline, SOS alerts and messages are persisted locally in browser storage and never deleted before confirmed server acknowledgement.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 space-y-1.5">
                  <p className="font-mono text-slate-300">
                    Unsynced SOS Packets: <strong className="text-amber-400">{unsyncedEmergencyCount}</strong>
                  </p>
                  <p className="font-mono text-slate-300">
                    Unsynced Mesh Messages: <strong className="text-cyan-400">{unsyncedMessageCount}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={handleManualSync}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 font-semibold text-slate-950"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Synchronize Now (POST /api/emergency/sync)
                  </button>
                  {syncResult && <p className="mt-2 text-emerald-300">{syncResult}</p>}
                </div>
              </div>
            )}

            {/* 17. USER PROFILE */}
            {screen === 'profile' && (
              <div className="space-y-3 text-xs">
                <h3 className="font-display text-lg font-bold text-white">User Profile</h3>
                {user ? (
                  <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-4 space-y-2">
                    <p className="text-base font-semibold text-white">{user.name}</p>
                    <p className="font-mono text-cyan-400">{user.role} · {user.deviceId}</p>
                    <p className="text-slate-300">Email: {user.email}</p>
                    <p className="text-slate-300">Phone: {user.phone}</p>
                    <p className="text-slate-300">Blood Group: {user.bloodGroup || 'Not specified'}</p>
                    <p className="text-slate-400">Medical Notes: {user.medicalNotes || 'None'}</p>
                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        setScreen('login');
                      }}
                      className="mt-3 w-full rounded-lg border border-red-500/40 bg-red-500/10 py-2 font-semibold text-red-300"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-4">
                    <p className="text-slate-400">Currently operating in Guest Field Mode.</p>
                    <button
                      type="button"
                      onClick={() => setScreen('login')}
                      className="mt-3 w-full rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950"
                    >
                      Sign In / Register
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 18. SETTINGS */}
            {screen === 'settings' && (
              <div className="space-y-3 text-xs">
                <h3 className="font-display text-lg font-bold text-white">Device Settings</h3>
                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Simulated Battery Level</span>
                    <span className="font-mono text-cyan-400">{batteryLevel}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={batteryLevel}
                    onChange={(e) => setBatteryLevel(Number(e.target.value))}
                    className="mt-2 w-full accent-cyan-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScreen('shake-settings')}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 text-white"
                >
                  <span>Shake-to-SOS Sensitivity</span>
                  <span className="font-mono text-cyan-400">{shakeSettings.sensitivity}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('offline-mode')}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 text-white"
                >
                  <span>Offline & Sync Settings</span>
                  <span className="font-mono text-amber-300">{offlineMode ? 'OFFLINE' : 'ONLINE'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('help-about')}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 text-white"
                >
                  <span>Help & SIH26206 Disclosures</span>
                  <Info className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            )}

            {/* 19. HELP & ABOUT */}
            {screen === 'help-about' && (
              <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                <h3 className="font-display text-lg font-bold text-white">
                  About RescueMesh AI (SIH26206)
                </h3>
                <p>
                  RescueMesh AI implements a Store-Carry-Forward delay-tolerant emergency mesh architecture for disaster zones without cellular towers.
                </p>
                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-3">
                  <p className="font-semibold text-white">Hardware & OS Limitations</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
                    <li>
                      Web browsers cannot run background Android BLE GATT servers or Wi-Fi Direct P2P groups; the Mesh Lab demonstrates these protocols in Simulation Mode, while the native Kotlin source in <code className="text-cyan-300">RescueMeshAI/android-app/</code> provides physical Android implementations.
                    </li>
                    <li>
                      Lock-screen Shake-to-SOS requires privileged Android system permissions and is documented as a future enhancement.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* 3-Second Shake-to-SOS Countdown Overlay */}
          {shakeCountdown !== null && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#07111F]/95 p-6 text-center backdrop-blur-sm">
              <AlertOctagon className="h-14 w-14 text-red-500" />
              <h4 className="mt-3 font-display text-xl font-bold text-white">
                Shake-to-SOS Triggered
              </h4>
              <p className="mt-1 text-xs text-slate-300">
                Sending emergency SOS in...
              </p>
              <p className="my-5 font-mono text-6xl font-extrabold text-red-400 tabular-nums">
                {shakeCountdown}
              </p>
              <div className="flex w-full gap-3">
                <button
                  type="button"
                  onClick={() => setShakeCountdown(null)}
                  className="flex-1 rounded-xl border border-slate-700 bg-[#15253E] py-3 text-sm font-semibold text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShakeCountdown(null);
                    void handleQuickSosTrigger();
                  }}
                  className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white"
                >
                  Confirm SOS
                </button>
              </div>
            </div>
          )}

          {/* Mobile Bottom Thumb Navigation Bar (<=15% height cap) */}
          {screen !== 'splash' && screen !== 'onboarding' && (
            <nav className="absolute right-0 bottom-0 left-0 grid h-16 grid-cols-5 border-t border-slate-800 bg-[#07111F]/95 backdrop-blur-md">
              {[
                { id: 'home' as MobileScreenId, label: 'Home', icon: Smartphone },
                { id: 'sos-create' as MobileScreenId, label: 'SOS', icon: ShieldAlert },
                { id: 'mesh-network' as MobileScreenId, label: 'Mesh', icon: Radio },
                { id: 'messages' as MobileScreenId, label: 'Msgs', icon: MessageSquare },
                { id: 'profile' as MobileScreenId, label: 'Profile', icon: User },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = screen === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setScreen(tab.id)}
                    className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                      active ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: 19-Screen Directory, Offline Queue Inspector & Controls */}
      <div className="space-y-6 lg:col-span-7 xl:col-span-8">
        <div className="rounded-2xl border border-slate-800 bg-[#0D1B2E] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Field Handset Screen Directory (All 19 Screens)
              </h2>
              <p className="text-xs text-slate-400">
                Inspect every Survivor, Relay Node, and Offline screen in the interactive handset.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleOffline(!offlineMode)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  offlineMode
                    ? 'bg-amber-500 text-slate-950'
                    : 'border border-slate-700 bg-[#15253E] text-slate-200'
                }`}
              >
                {offlineMode ? 'Offline Mode: ON (Restore Internet)' : 'Simulate Internet Blackout'}
              </button>
              <button
                type="button"
                onClick={() => setShakeCountdown(3)}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
              >
                Test Shake-to-SOS
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {SCREEN_LIST.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  screen === item.id
                    ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-[#07111F] text-slate-300 hover:border-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Local Persistent Offline Queue Inspector */}
        <div className="rounded-2xl border border-slate-800 bg-[#0D1B2E] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-white">
                Local Store-Carry-Forward Persistence Queue
              </h3>
              <p className="text-xs text-slate-400">
                Records remain stored locally until confirmed acknowledgement from <code className="text-cyan-300">POST /api/emergency/sync</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={offlineMode}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync Queued Records ({unsyncedEmergencyCount + unsyncedMessageCount})
            </button>
          </div>

          {localEmergencies.length === 0 ? (
            <p className="mt-4 text-xs text-slate-400">
              No local SOS packets queued on this handset yet. Turn on Offline Mode and tap SOS to test Store-Carry-Forward queuing!
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-4 font-medium">Packet ID</th>
                    <th className="py-2 pr-4 font-medium">Severity</th>
                    <th className="py-2 pr-4 font-medium">State</th>
                    <th className="py-2 pr-4 font-medium">Cloud Sync</th>
                    <th className="py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {localEmergencies.slice(0, 8).map((e) => (
                    <tr key={e.messageId}>
                      <td className="py-2 pr-4 font-mono text-cyan-300">{e.messageId}</td>
                      <td className="py-2 pr-4">
                        <SeverityText severity={e.severity} />
                      </td>
                      <td className="py-2 pr-4 text-slate-200">{formatDeliveryStatus(e.status)}</td>
                      <td className="py-2 pr-4 font-mono">
                        {e.syncedAt ? (
                          <span className="text-emerald-400">ACKED</span>
                        ) : (
                          <span className="text-amber-400">LOCAL ONLY</span>
                        )}
                      </td>
                      <td className="py-2 font-mono text-slate-400">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
