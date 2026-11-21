import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Compass,
  Filter,
  History,
  Lock,
  MapPin,
  Radio,
  Search,
  Send,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../services/api';
import type {
  AnalyticsResponse,
  DashboardSection,
  DeliveryStatus,
  DispatchItem,
  EmergencyItem,
  RelayHistoryItem,
  RescueTeamItem,
  UserProfile,
} from '../../types/rescue';
import {
  formatCategoryLabel,
  formatDeliveryStatus,
  SeverityText,
} from '../common/SeverityBadge';
import { VictimLeafletMap } from '../map/VictimLeafletMap';

interface RescueDashboardProps {
  emergencies: EmergencyItem[];
  teams: RescueTeamItem[];
  dispatches: DispatchItem[];
  relayHistory: RelayHistoryItem[];
  analytics: AnalyticsResponse | null;
  user: UserProfile | null;
  token: string | null;
  socketConnected: boolean;
  onRefresh: () => Promise<void>;
  onCommanderLogin: (email: string, password: string) => Promise<void>;
}

const SIDEBAR_ITEMS: Array<{
  id: DashboardSection;
  label: string;
  icon: typeof Activity;
}> = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'live-alerts', label: 'Live Emergency Alerts', icon: AlertTriangle },
  { id: 'victim-map', label: 'Victim Map', icon: Compass },
  { id: 'priority-queue', label: 'Priority Queue', icon: ClipboardList },
  { id: 'rescue-teams', label: 'Rescue Teams', icon: Users },
  { id: 'dispatch', label: 'Dispatch Management', icon: Send },
  { id: 'history', label: 'Emergency History', icon: History },
  { id: 'analytics', label: 'Analytics & AI Model', icon: BarChart3 },
  { id: 'settings', label: 'Settings & API Console', icon: Settings },
];

export function RescueDashboard({
  emergencies,
  teams,
  dispatches,
  relayHistory,
  analytics,
  user,
  token,
  socketConnected,
  onRefresh,
  onCommanderLogin,
}: RescueDashboardProps) {
  const [section, setSection] = useState<DashboardSection>('overview');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(
    emergencies[0]?.messageId ?? null
  );

  // Dispatch form state
  const [assignTeamId, setAssignTeamId] = useState<string>(teams[0]?.id ?? '');
  const [dispatchNotes, setDispatchNotes] = useState<string>('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Commander login form state
  const [cmdEmail, setCmdEmail] = useState('commander@rescuemesh.org');
  const [cmdPassword, setCmdPassword] = useState('Rescue@2026');

  // API Console tester state
  const [apiTestResult, setApiTestResult] = useState<string>('');
  const [aiPreviewInput, setAiPreviewInput] = useState({
    emergencyCategory: 'COLLAPSE_TRAPPED',
    injuryStatus: true,
    victimCount: 5,
    firePresent: false,
    floodSeverity: 1,
    medicalUrgency: 3,
    trappedPersonStatus: true,
    reportedDangerLevel: 5,
    useFallbackOnly: false,
  });

  const filteredEmergencies = useMemo(() => {
    return emergencies.filter((e) => {
      if (severityFilter !== 'ALL' && e.severity !== severityFilter) return false;
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          e.messageId.toLowerCase().includes(q) ||
          e.reporterName.toLowerCase().includes(q) ||
          e.locationLabel.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [emergencies, severityFilter, statusFilter, searchQuery]);

  const selectedEmergency = useMemo(() => {
    return (
      emergencies.find((e) => e.messageId === selectedId) ??
      filteredEmergencies[0] ??
      null
    );
  }, [emergencies, filteredEmergencies, selectedId]);

  const activeAlerts = useMemo(
    () => emergencies.filter((e) => e.status !== 'RESOLVED'),
    [emergencies]
  );

  const resolvedAlerts = useMemo(
    () => emergencies.filter((e) => e.status === 'RESOLVED'),
    [emergencies]
  );

  const isCommander = user?.role === 'RESCUE_TEAM' && Boolean(token);

  async function handleAssignTeam() {
    if (!selectedEmergency || !token || !assignTeamId) return;
    setBusy(true);
    setActionMsg(null);
    try {
      await api.assignDispatch(
        selectedEmergency.messageId,
        assignTeamId,
        dispatchNotes || 'Rescue team dispatched from Command Center.',
        token
      );
      setDispatchNotes('');
      setActionMsg({ type: 'ok', text: `Assigned rescue team to ${selectedEmergency.messageId}.` });
      await onRefresh();
    } catch (err) {
      setActionMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusUpdate(newStatus: DeliveryStatus) {
    if (!selectedEmergency || !token) return;
    setBusy(true);
    setActionMsg(null);
    try {
      await api.updateEmergencyStatus(
        selectedEmergency.messageId,
        newStatus,
        dispatchNotes || undefined,
        token
      );
      setActionMsg({
        type: 'ok',
        text: `Updated ${selectedEmergency.messageId} to ${formatDeliveryStatus(newStatus)}.`,
      });
      await onRefresh();
    } catch (err) {
      setActionMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestAiPredict() {
    try {
      const res = await api.predictSeverity(aiPreviewInput);
      setApiTestResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setApiTestResult(`Error: ${(err as Error).message}`);
    }
  }

  const totalSos = analytics?.summary.totalSos ?? emergencies.length;
  const criticalCount =
    analytics?.summary.criticalCount ??
    emergencies.filter((e) => e.severity === 'CRITICAL').length;
  const pendingCount =
    analytics?.summary.pendingCount ??
    emergencies.filter((e) =>
      ['SOS_CREATED', 'STORED_LOCALLY', 'NEARBY_DEVICE_RECEIVED', 'FORWARDED', 'RESCUE_TEAM_RECEIVED'].includes(e.status)
    ).length;
  const resolvedCount =
    analytics?.summary.resolvedCount ?? resolvedAlerts.length;

  return (
    <div className="flex min-h-[calc(100vh-65px)] w-full flex-col lg:flex-row">
      {/* Left Navigation Sidebar */}
      <aside className="w-full shrink-0 border-b border-slate-800 bg-[#0A1628] lg:w-64 lg:border-r lg:border-b-0">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between px-2 text-xs text-slate-400">
            <span>Command Sectors</span>
            <span className="font-mono text-[11px] text-cyan-400">
              {socketConnected ? 'LIVE WS' : 'POLLING'}
            </span>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex min-h-[40px] shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#15253E] text-white'
                      : 'text-slate-400 hover:bg-[#0F1F36] hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Operator Session Card */}
          <div className="mt-6 hidden rounded-xl border border-slate-800 bg-[#0D1B2E] p-3.5 lg:block">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <Shield className="h-4 w-4 text-cyan-400" />
              <span>Operator Session</span>
            </div>
            {user ? (
              <div className="mt-2 space-y-1 text-xs">
                <p className="font-semibold text-white truncate">{user.name}</p>
                <p className="font-mono text-[11px] text-cyan-400">
                  {user.role} · {user.deviceId}
                </p>
                {!isCommander && (
                  <button
                    type="button"
                    onClick={() => onCommanderLogin('commander@rescuemesh.org', 'Rescue@2026')}
                    className="mt-2 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                  >
                    Switch to Rescue Commander
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-400">
                  Sign in as Rescue Team to dispatch units & update SOS status.
                </p>
                <button
                  type="button"
                  onClick={() => onCommanderLogin(cmdEmail, cmdPassword)}
                  className="w-full rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Sign In as Commander
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Top KPI Summary Strip (Always visible on Overview, Live Alerts, Priority Queue) */}
        {(section === 'overview' || section === 'live-alerts' || section === 'priority-queue') && (
          <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-4">
              <p className="text-xs font-medium text-slate-400">Total SOS Incidents</p>
              <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">{totalSos}</p>
              <p className="mt-1 text-xs text-slate-500">
                {analytics?.summary.totalVictimsAffected ?? 0} total victims reported
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-4">
              <p className="text-xs font-medium text-slate-400">Critical Emergencies</p>
              <p className="mt-1 font-mono text-2xl font-bold text-red-400 tabular-nums">
                {criticalCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">Priority 1 immediate extraction</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-4">
              <p className="text-xs font-medium text-slate-400">Pending Rescue Dispatch</p>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">
                {pendingCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">Awaiting team assignment</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-4">
              <p className="text-xs font-medium text-slate-400">Resolved Cases</p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                {resolvedCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {analytics?.summary.availableTeams ?? 0}/{analytics?.summary.totalTeams ?? teams.length} units ready
              </p>
            </div>
          </div>
        )}

        {/* Filter Bar for Alert / Queue / Map views */}
        {(section === 'overview' ||
          section === 'live-alerts' ||
          section === 'victim-map' ||
          section === 'priority-queue') && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1B2E] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSeverityFilter(lvl)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    severityFilter === lvl
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-[#15253E] text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {lvl === 'ALL' ? 'All Severities' : lvl}
                </button>
              ))}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="rounded-md border border-slate-700 bg-[#07111F] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="RESCUE_TEAM_RECEIVED">Rescue Team Received</option>
                <option value="HELP_ASSIGNED">Help Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ID, location, victim..."
                className="w-full rounded-lg border border-slate-700 bg-[#07111F] py-1.5 pr-3 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* SECTION 1: OVERVIEW */}
        {section === 'overview' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-7">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">
                    Live Victim & Rescue Unit Map
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('victim-map')}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    Expand Full Map
                  </button>
                </div>
                <VictimLeafletMap
                  emergencies={filteredEmergencies}
                  teams={teams}
                  selectedId={selectedEmergency?.messageId}
                  onSelectEmergency={(em) => setSelectedId(em.messageId)}
                  heightClass="h-[360px]"
                />
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">AI Priority Triage Queue</h2>
                  <span className="text-xs text-slate-400">
                    Advisory Random Forest scoring · Sorted by urgency
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-3 font-medium">Incident ID</th>
                        <th className="py-2 pr-3 font-medium">Severity</th>
                        <th className="py-2 pr-3 font-medium">Location</th>
                        <th className="py-2 pr-3 font-medium">Victims</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {filteredEmergencies.slice(0, 6).map((em) => (
                        <tr
                          key={em.messageId}
                          onClick={() => setSelectedId(em.messageId)}
                          className={`cursor-pointer transition-colors ${
                            selectedEmergency?.messageId === em.messageId
                              ? 'bg-[#15253E]'
                              : 'hover:bg-[#122036]'
                          }`}
                        >
                          <td className="py-2.5 pr-3 font-mono font-medium text-cyan-300">
                            {em.messageId}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <SeverityText severity={em.severity} />
                              <span className="font-mono text-slate-400 tabular-nums">
                                {em.severityScore}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-200 max-w-[200px] truncate">
                            {em.locationLabel}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-slate-300 tabular-nums">
                            {em.victimCount}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-300">
                            {formatDeliveryStatus(em.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Selected Incident Inspector & Dispatch */}
            <div className="xl:col-span-5">
              <IncidentInspectorPanel
                emergency={selectedEmergency}
                teams={teams}
                isCommander={isCommander}
                assignTeamId={assignTeamId}
                onChangeTeamId={setAssignTeamId}
                dispatchNotes={dispatchNotes}
                onChangeNotes={setDispatchNotes}
                onAssignTeam={handleAssignTeam}
                onUpdateStatus={handleStatusUpdate}
                onQuickCommanderLogin={() =>
                  onCommanderLogin(cmdEmail, cmdPassword)
                }
                busy={busy}
                actionMsg={actionMsg}
              />
            </div>
          </div>
        )}

        {/* SECTION 2: LIVE EMERGENCY ALERTS */}
        {section === 'live-alerts' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-3 xl:col-span-7">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Live Emergency Alerts ({filteredEmergencies.length})
                </h2>
                <span className="text-xs text-slate-400">
                  Real-time Socket.IO & offline-synced SOS feed
                </span>
              </div>
              {filteredEmergencies.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-8 text-center text-sm text-slate-400">
                  No emergency records match the current filter criteria.
                </div>
              ) : (
                filteredEmergencies.map((em) => (
                  <button
                    key={em.messageId}
                    type="button"
                    onClick={() => setSelectedId(em.messageId)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selectedEmergency?.messageId === em.messageId
                        ? 'border-cyan-500/60 bg-[#15253E]'
                        : 'border-slate-800 bg-[#0D1B2E] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-semibold text-cyan-400">
                          {em.messageId}
                        </span>
                        <SeverityText severity={em.severity} />
                        <span className="font-mono text-xs text-slate-400">
                          Score {em.severityScore}/100
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(em.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {em.hopCount} mesh hop{em.hopCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-white">
                      {em.reporterName} — {formatCategoryLabel(em.emergencyCategory)}
                    </h3>
                    <p className="mt-1 text-xs text-slate-300">{em.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-slate-500" />
                        {em.locationLabel}
                      </span>
                      <span>·</span>
                      <span>{em.victimCount} victim(s)</span>
                      <span>·</span>
                      <span className="text-slate-200">{formatDeliveryStatus(em.status)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="xl:col-span-5">
              <IncidentInspectorPanel
                emergency={selectedEmergency}
                teams={teams}
                isCommander={isCommander}
                assignTeamId={assignTeamId}
                onChangeTeamId={setAssignTeamId}
                dispatchNotes={dispatchNotes}
                onChangeNotes={setDispatchNotes}
                onAssignTeam={handleAssignTeam}
                onUpdateStatus={handleStatusUpdate}
                onQuickCommanderLogin={() =>
                  onCommanderLogin(cmdEmail, cmdPassword)
                }
                busy={busy}
                actionMsg={actionMsg}
              />
            </div>
          </div>
        )}

        {/* SECTION 3: VICTIM MAP */}
        {section === 'victim-map' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <VictimLeafletMap
                emergencies={filteredEmergencies}
                teams={teams}
                selectedId={selectedEmergency?.messageId}
                onSelectEmergency={(em) => setSelectedId(em.messageId)}
                heightClass="h-[620px]"
              />
            </div>
            <div className="xl:col-span-4">
              <IncidentInspectorPanel
                emergency={selectedEmergency}
                teams={teams}
                isCommander={isCommander}
                assignTeamId={assignTeamId}
                onChangeTeamId={setAssignTeamId}
                dispatchNotes={dispatchNotes}
                onChangeNotes={setDispatchNotes}
                onAssignTeam={handleAssignTeam}
                onUpdateStatus={handleStatusUpdate}
                onQuickCommanderLogin={() =>
                  onCommanderLogin(cmdEmail, cmdPassword)
                }
                busy={busy}
                actionMsg={actionMsg}
              />
            </div>
          </div>
        )}

        {/* SECTION 4: PRIORITY QUEUE */}
        {section === 'priority-queue' && (
          <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  AI-Assisted Rescue Priority Queue
                </h2>
                <p className="text-xs text-slate-400">
                  Ranked by Random Forest classifier (with rule-based fallback). Scores are advisory for human commanders.
                </p>
              </div>
              <span className="font-mono text-xs text-cyan-400">
                {activeAlerts.length} active incidents
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Rank</th>
                    <th className="py-2.5 pr-4 font-medium">Incident</th>
                    <th className="py-2.5 pr-4 font-medium">AI Severity</th>
                    <th className="py-2.5 pr-4 font-medium">Confidence & Source</th>
                    <th className="py-2.5 pr-4 font-medium">Risk Factors</th>
                    <th className="py-2.5 pr-4 font-medium">Recommended Unit</th>
                    <th className="py-2.5 pr-4 font-medium">Status</th>
                    <th className="py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredEmergencies.map((em, idx) => (
                    <tr key={em.messageId} className="hover:bg-[#132238]">
                      <td className="py-3 pr-4 font-mono text-slate-400 tabular-nums">
                        #{idx + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-mono font-semibold text-cyan-300">
                          {em.messageId}
                        </div>
                        <div className="text-slate-200">{em.reporterName}</div>
                        <div className="text-slate-500">{em.locationLabel}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <SeverityText severity={em.severity} />
                        <div className="mt-1 font-mono text-sm font-bold text-white tabular-nums">
                          {em.severityScore}/100
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-mono text-slate-200 tabular-nums">
                          {em.aiConfidence !== null
                            ? `${Math.round(em.aiConfidence * 100)}% conf`
                            : 'Rule fallback'}
                        </div>
                        <div className="text-[11px] text-slate-500">{em.modelSource}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-300">
                        <div>Victims: {em.victimCount}</div>
                        <div className="text-slate-400">
                          {[
                            em.trappedPersonStatus && 'Trapped',
                            em.injuryStatus && 'Injured',
                            em.firePresent && 'Fire',
                            em.floodSeverity > 0 && `Flood L${em.floodSeverity}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Standard'}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-300 max-w-[200px]">
                        {em.recommendedResponse}
                      </td>
                      <td className="py-3 pr-4 text-slate-200">
                        {formatDeliveryStatus(em.status)}
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(em.messageId);
                            setSection('dispatch');
                          }}
                          className="rounded-md bg-[#15253E] px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500 hover:text-slate-950"
                        >
                          Dispatch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 5: RESCUE TEAMS */}
        {section === 'rescue-teams' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Rescue Team Readiness Roster</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-cyan-400">
                        {team.callSign}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-white">
                        {team.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-400">{team.specialty}</p>
                    </div>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        team.status === 'AVAILABLE'
                          ? 'text-emerald-400'
                          : team.status === 'ON_SCENE'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {team.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-800 pt-3 text-xs">
                    <div>
                      <span className="text-slate-500">Personnel</span>
                      <p className="mt-0.5 font-mono font-semibold text-slate-200">
                        {team.personnelCount}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Staging Base</span>
                      <p className="mt-0.5 text-slate-200 truncate">{team.baseLocation}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Active Case</span>
                      <p className="mt-0.5 font-mono text-cyan-300">
                        {team.activeIncidentId || 'None'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 6: DISPATCH MANAGEMENT */}
        {section === 'dispatch' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-5">
              <IncidentInspectorPanel
                emergency={selectedEmergency}
                teams={teams}
                isCommander={isCommander}
                assignTeamId={assignTeamId}
                onChangeTeamId={setAssignTeamId}
                dispatchNotes={dispatchNotes}
                onChangeNotes={setDispatchNotes}
                onAssignTeam={handleAssignTeam}
                onUpdateStatus={handleStatusUpdate}
                onQuickCommanderLogin={() =>
                  onCommanderLogin(cmdEmail, cmdPassword)
                }
                busy={busy}
                actionMsg={actionMsg}
              />
            </div>

            <div className="space-y-4 xl:col-span-7">
              <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
                <h2 className="text-base font-semibold text-white">Select Incident to Manage</h2>
                <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                  {emergencies.map((em) => (
                    <button
                      key={em.messageId}
                      type="button"
                      onClick={() => setSelectedId(em.messageId)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                        selectedEmergency?.messageId === em.messageId
                          ? 'border-cyan-500/60 bg-[#15253E]'
                          : 'border-slate-800 bg-[#07111F] hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono font-semibold text-cyan-400">
                          {em.messageId}
                        </span>
                        <SeverityText severity={em.severity} />
                        <span className="truncate text-slate-200">{em.locationLabel}</span>
                      </div>
                      <span className="ml-2 shrink-0 text-slate-400">
                        {formatDeliveryStatus(em.status)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
                <h2 className="text-base font-semibold text-white">Recent Dispatch Log</h2>
                <div className="mt-3 space-y-2.5">
                  {dispatches.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No dispatches recorded yet. Select an incident and assign a rescue unit.
                    </p>
                  ) : (
                    dispatches.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-lg border border-slate-800 bg-[#07111F] p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-cyan-300">
                            {d.id} → {d.emergencyId}
                          </span>
                          <span className="text-slate-400">
                            {new Date(d.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 font-medium text-white">
                          {d.teamName} · Assigned by {d.assignedBy}
                        </p>
                        <p className="mt-0.5 text-slate-400">{d.notes}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 7: EMERGENCY HISTORY */}
        {section === 'history' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
              <h2 className="text-base font-semibold text-white">
                Resolved & Archived Emergency Records ({resolvedAlerts.length})
              </h2>
              <div className="mt-4 space-y-3">
                {resolvedAlerts.length === 0 ? (
                  <p className="text-xs text-slate-400">No resolved incidents yet.</p>
                ) : (
                  resolvedAlerts.map((em) => (
                    <div
                      key={em.messageId}
                      className="rounded-lg border border-slate-800 bg-[#07111F] p-4 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-emerald-400">
                            {em.messageId}
                          </span>
                          <span className="text-white font-medium">{em.reporterName}</span>
                        </div>
                        <span className="text-slate-400">
                          {new Date(em.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-300">{em.description}</p>
                      <p className="mt-1 text-slate-400">
                        Unit: {em.assignedTeamName || 'Field Rescue'} · Notes:{' '}
                        {em.dispatchNotes || 'Closed'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
              <h2 className="text-base font-semibold text-white">
                Mesh Store-Carry-Forward Hop Audit Trail ({relayHistory.length})
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-4 font-medium">Message ID</th>
                      <th className="py-2 pr-4 font-medium">Hop</th>
                      <th className="py-2 pr-4 font-medium">From Node</th>
                      <th className="py-2 pr-4 font-medium">To Node</th>
                      <th className="py-2 pr-4 font-medium">Transport</th>
                      <th className="py-2 font-medium">Signal (RSSI)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {relayHistory.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-4 font-mono text-cyan-300">{r.messageId}</td>
                        <td className="py-2 pr-4 font-mono text-slate-300">#{r.hopNumber}</td>
                        <td className="py-2 pr-4 text-slate-200">{r.fromNode}</td>
                        <td className="py-2 pr-4 text-slate-200">{r.toNode}</td>
                        <td className="py-2 pr-4 font-mono text-slate-300">{r.transport}</td>
                        <td className="py-2 font-mono text-slate-400">{r.rssi} dBm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 8: ANALYTICS & AI MODEL */}
        {section === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
                <h2 className="text-base font-semibold text-white">
                  Severity Distribution
                </h2>
                <div className="mt-4 space-y-3">
                  {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => {
                    const count = analytics?.bySeverity[lvl] ?? 0;
                    const pct = totalSos > 0 ? Math.round((count / totalSos) * 100) : 0;
                    const barColor =
                      lvl === 'CRITICAL'
                        ? 'bg-red-500'
                        : lvl === 'HIGH'
                        ? 'bg-amber-500'
                        : lvl === 'MEDIUM'
                        ? 'bg-cyan-500'
                        : 'bg-emerald-500';
                    return (
                      <div key={lvl} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <SeverityText severity={lvl} />
                          <span className="font-mono text-slate-300 tabular-nums">
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#07111F]">
                          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
                <h2 className="text-base font-semibold text-white">
                  Evaluated Random Forest Classifier Telemetry
                </h2>
                {analytics?.aiModel ? (
                  <div className="mt-3 space-y-3 text-xs">
                    <p className="text-slate-400">
                      Model: <span className="text-slate-200">{analytics.aiModel.modelType}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-800 bg-[#07111F] p-3">
                        <span className="text-slate-400">Held-Out Test Accuracy</span>
                        <p className="mt-1 font-mono text-xl font-bold text-cyan-400 tabular-nums">
                          {(analytics.aiModel.evaluation.accuracy * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-[#07111F] p-3">
                        <span className="text-slate-400">Held-Out Macro F1</span>
                        <p className="mt-1 font-mono text-xl font-bold text-emerald-400 tabular-nums">
                          {analytics.aiModel.evaluation.macro_f1.toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-1.5 pr-3">Class</th>
                            <th className="py-1.5 pr-3">Precision</th>
                            <th className="py-1.5 pr-3">Recall</th>
                            <th className="py-1.5 pr-3">F1</th>
                            <th className="py-1.5">Support</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {Object.entries(analytics.aiModel.evaluation.per_class).map(
                            ([cls, m]) => (
                              <tr key={cls}>
                                <td className="py-1.5 pr-3 text-slate-200">{cls}</td>
                                <td className="py-1.5 pr-3 text-slate-300">{m.precision}</td>
                                <td className="py-1.5 pr-3 text-slate-300">{m.recall}</td>
                                <td className="py-1.5 pr-3 text-cyan-300">{m.f1}</td>
                                <td className="py-1.5 text-slate-400">{m.support}</td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Evaluated on 482 held-out stratified samples from a 2,400-record synthetic disaster triage corpus. Rule-based fallback executes automatically if model weights are unreachable.
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-400">
                    Model evaluation artifact loading...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 9: SETTINGS & API CONSOLE */}
        {section === 'settings' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
              <h2 className="text-base font-semibold text-white">
                Commander Authentication (JWT + RBAC)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Sign in with Rescue Team credentials to authorize dispatch & status updates.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs text-slate-400">Email</label>
                  <input
                    type="email"
                    value={cmdEmail}
                    onChange={(e) => setCmdEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">Password</label>
                  <input
                    type="password"
                    value={cmdPassword}
                    onChange={(e) => setCmdPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07111F] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onCommanderLogin(cmdEmail, cmdPassword)}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Authenticate Rescue Commander
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
              <h2 className="text-base font-semibold text-white">
                Live AI Prediction Endpoint Tester (POST /api/ai/predict)
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400">Category</label>
                  <select
                    value={aiPreviewInput.emergencyCategory}
                    onChange={(e) =>
                      setAiPreviewInput((p) => ({ ...p, emergencyCategory: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07111F] px-2.5 py-1.5 text-white"
                  >
                    <option value="COLLAPSE_TRAPPED">COLLAPSE_TRAPPED</option>
                    <option value="MEDICAL_CARDIAC_TRAUMA">MEDICAL_CARDIAC_TRAUMA</option>
                    <option value="FLOOD_SUBMERSION">FLOOD_SUBMERSION</option>
                    <option value="FIRE_HAZMAT">FIRE_HAZMAT</option>
                    <option value="LANDSLIDE">LANDSLIDE</option>
                    <option value="SHELTER_SUPPLY">SHELTER_SUPPLY</option>
                    <option value="GENERAL_SOS">GENERAL_SOS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400">Victims</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={aiPreviewInput.victimCount}
                    onChange={(e) =>
                      setAiPreviewInput((p) => ({
                        ...p,
                        victimCount: Number(e.target.value) || 1,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07111F] px-2.5 py-1.5 text-white"
                  />
                </div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={aiPreviewInput.trappedPersonStatus}
                    onChange={(e) =>
                      setAiPreviewInput((p) => ({ ...p, trappedPersonStatus: e.target.checked }))
                    }
                  />
                  Trapped Person(s)
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={aiPreviewInput.useFallbackOnly}
                    onChange={(e) =>
                      setAiPreviewInput((p) => ({ ...p, useFallbackOnly: e.target.checked }))
                    }
                  />
                  Test Rule-Based Fallback
                </label>
              </div>
              <button
                type="button"
                onClick={handleTestAiPredict}
                className="mt-3 rounded-lg bg-[#15253E] px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500 hover:text-slate-950"
              >
                Run POST /api/ai/predict
              </button>
              {apiTestResult && (
                <pre className="mt-3 max-h-52 overflow-auto rounded-lg border border-slate-800 bg-[#07111F] p-3 font-mono text-[11px] text-cyan-200">
                  {apiTestResult}
                </pre>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface InspectorProps {
  emergency: EmergencyItem | null;
  teams: RescueTeamItem[];
  isCommander: boolean;
  assignTeamId: string;
  onChangeTeamId: (id: string) => void;
  dispatchNotes: string;
  onChangeNotes: (notes: string) => void;
  onAssignTeam: () => Promise<void>;
  onUpdateStatus: (status: DeliveryStatus) => Promise<void>;
  onQuickCommanderLogin: () => Promise<void>;
  busy: boolean;
  actionMsg: { type: 'ok' | 'err'; text: string } | null;
}

function IncidentInspectorPanel({
  emergency,
  teams,
  isCommander,
  assignTeamId,
  onChangeTeamId,
  dispatchNotes,
  onChangeNotes,
  onAssignTeam,
  onUpdateStatus,
  onQuickCommanderLogin,
  busy,
  actionMsg,
}: InspectorProps) {
  if (!emergency) {
    return (
      <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-6 text-center text-sm text-slate-400">
        Select an emergency incident to inspect AI severity details and assign rescue units.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-semibold text-cyan-400">
              {emergency.messageId}
            </span>
            <SeverityText severity={emergency.severity} />
          </div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {emergency.reporterName}
          </h3>
          <p className="text-xs text-slate-400">
            {formatCategoryLabel(emergency.emergencyCategory)} ·{' '}
            {emergency.victimCount} victim(s)
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-slate-400">AI Severity</span>
          <p className="font-mono text-2xl font-bold text-white tabular-nums">
            {emergency.severityScore}
            <span className="text-xs font-normal text-slate-400">/100</span>
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-xs">
        <p className="leading-relaxed text-slate-200">{emergency.description}</p>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-[#07111F] p-3">
          <div>
            <span className="text-slate-500">Coordinates</span>
            <p className="mt-0.5 font-mono text-slate-200 tabular-nums">
              {emergency.latitude.toFixed(4)}, {emergency.longitude.toFixed(4)}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Routing & Hops</span>
            <p className="mt-0.5 font-mono text-cyan-300">
              {emergency.routingProtocol} · {emergency.hopCount} hop(s) · TTL {emergency.ttl}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Delivery Status</span>
            <p className="mt-0.5 font-semibold text-white">
              {formatDeliveryStatus(emergency.status)}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Recommended Unit</span>
            <p className="mt-0.5 text-slate-200">{emergency.recommendedResponse}</p>
          </div>
        </div>

        {emergency.encryptedPayload && (
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#07111F] px-3 py-2 font-mono text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-emerald-400" />
              Payload Integrity
            </span>
            <span className="truncate max-w-[200px] text-slate-300">
              {emergency.encryptedPayload}
            </span>
          </div>
        )}

        {/* Dispatch Controls */}
        <div className="border-t border-slate-800 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-white">
              Rescue Dispatch & Status Control
            </span>
            {emergency.assignedTeamName && (
              <span className="font-mono text-[11px] text-emerald-400">
                Assigned: {emergency.assignedTeamName}
              </span>
            )}
          </div>

          {!isCommander ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-200">
                RBAC Protection: Only authenticated Rescue Team commanders can assign units or update rescue status.
              </p>
              <button
                type="button"
                onClick={onQuickCommanderLogin}
                className="mt-2.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Authenticate as Commander (Rescue@2026)
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400">
                  Assign Rescue Team
                </label>
                <div className="mt-1 flex gap-2">
                  <select
                    value={assignTeamId}
                    onChange={(e) => onChangeTeamId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-700 bg-[#07111F] px-2.5 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.callSign} — {t.name} ({t.status})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onAssignTeam}
                    className="rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 whitespace-nowrap"
                  >
                    Assign Unit
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400">
                  Dispatch Notes
                </label>
                <textarea
                  rows={2}
                  value={dispatchNotes}
                  onChange={(e) => onChangeNotes(e.target.value)}
                  placeholder="Add extraction route, road closure, or triage notes..."
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07111F] p-2.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onUpdateStatus('HELP_ASSIGNED')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#15253E] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500"
                >
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  Help Assigned
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onUpdateStatus('IN_PROGRESS')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#15253E] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500"
                >
                  <Radio className="h-3.5 w-3.5 text-cyan-400" />
                  In Progress
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onUpdateStatus('RESOLVED')}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark Resolved
                </button>
              </div>
            </div>
          )}

          {actionMsg && (
            <p
              className={`mt-2.5 text-xs ${
                actionMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {actionMsg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
