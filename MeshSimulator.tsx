import {
  ArrowRight,
  Bluetooth,
  CheckCircle2,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  Wifi,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import type { EmergencyItem, MeshMessageType } from '../../types/rescue';

interface MeshSimulatorProps {
  onCommitSimulatedSosToBackend: (item: EmergencyItem) => Promise<void>;
}

interface SimPacket {
  messageId: string;
  type: MeshMessageType;
  priorityRank: number;
  protocol: 'EPIDEMIC' | 'PROPHET';
  ttl: number;
  hops: number;
  currentNodeIndex: number; // 0: Victim A, 1: Relay B, 2: Relay C, 3: Rescue Gateway
  status: 'CREATED' | 'STORED' | 'FORWARDED' | 'DELIVERED' | 'EXPIRED' | 'DROPPED_DUPLICATE';
  log: string[];
}

const NODES = [
  { id: 'NODE-A', name: 'Victim A', role: 'Survivor Handset', radio: 'BLE Advertiser' },
  { id: 'NODE-B', name: 'Relay B', role: 'Volunteer Moto Node', radio: 'BLE 5.2 + SQLite' },
  { id: 'NODE-C', name: 'Relay C', role: 'Solar Hilltop Relay', radio: 'Wi-Fi Direct P2P' },
  { id: 'GATEWAY', name: 'Rescue Team Gateway', role: 'Internet Uplink / NDRF', radio: 'HTTPS + Socket.IO' },
];

export function MeshSimulator({ onCommitSimulatedSosToBackend }: MeshSimulatorProps) {
  const [packetType, setPacketType] = useState<MeshMessageType>('SOS');
  const [initialTtl, setInitialTtl] = useState<number>(5);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [packets, setPackets] = useState<SimPacket[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncedNotice, setSyncedNotice] = useState<string | null>(null);

  function spawnPacket(duplicateId?: string) {
    const id =
      duplicateId ||
      `SIM-${packetType}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
    const priorityRank =
      packetType === 'SOS' ? 1 : packetType === 'MEDICAL' ? 2 : packetType === 'LOCATION' ? 3 : 4;
    const protocol =
      packetType === 'SOS' || packetType === 'MEDICAL' ? 'EPIDEMIC' : 'PROPHET';

    if (seenIds.includes(id)) {
      setPackets((prev) => [
        {
          messageId: id,
          type: packetType,
          priorityRank,
          protocol,
          ttl: initialTtl,
          hops: 0,
          currentNodeIndex: 1,
          status: 'DROPPED_DUPLICATE',
          log: [
            `Duplicate packet ${id} detected in Relay B deduplication cache — forwarding suppressed.`,
          ],
        },
        ...prev,
      ]);
      return;
    }

    setSeenIds((prev) => [...prev, id]);
    const newPacket: SimPacket = {
      messageId: id,
      type: packetType,
      priorityRank,
      protocol,
      ttl: initialTtl,
      hops: 0,
      currentNodeIndex: 0,
      status: 'STORED',
      log: [
        `[${new Date().toLocaleTimeString()}] Created ${packetType} packet ${id} (TTL=${initialTtl}, ${protocol} routing). Stored locally on Victim A.`,
      ],
    };
    setPackets((prev) =>
      [newPacket, ...prev].sort((a, b) => a.priorityRank - b.priorityRank)
    );
  }

  function stepForwardAll() {
    setPackets((prev) =>
      prev
        .map((pkt) => {
          if (
            pkt.status === 'DELIVERED' ||
            pkt.status === 'EXPIRED' ||
            pkt.status === 'DROPPED_DUPLICATE'
          ) {
            return pkt;
          }
          if (pkt.ttl <= 1) {
            return {
              ...pkt,
              ttl: 0,
              status: 'EXPIRED' as const,
              log: [
                ...pkt.log,
                `TTL reached 0 at ${NODES[pkt.currentNodeIndex].name} — packet expired to prevent loop.`,
              ],
            };
          }
          const nextIdx = Math.min(3, pkt.currentNodeIndex + 1);
          const transport =
            nextIdx === 1 ? 'BLE 5.2' : nextIdx === 2 ? 'Wi-Fi Direct' : 'Cloud Sync Uplink';
          const nextStatus = nextIdx === 3 ? ('DELIVERED' as const) : ('FORWARDED' as const);
          return {
            ...pkt,
            currentNodeIndex: nextIdx,
            ttl: pkt.ttl - 1,
            hops: pkt.hops + 1,
            status: nextStatus,
            log: [
              ...pkt.log,
              `Hop #${pkt.hops + 1} via ${transport}: ${NODES[pkt.currentNodeIndex].name} → ${
                NODES[nextIdx].name
              } (remaining TTL=${pkt.ttl - 1})`,
            ],
          };
        })
        .sort((a, b) => a.priorityRank - b.priorityRank)
    );
  }

  async function pushToRealBackend(pkt: SimPacket) {
    setSyncingId(pkt.messageId);
    setSyncedNotice(null);
    try {
      const now = new Date().toISOString();
      await onCommitSimulatedSosToBackend({
        messageId: pkt.messageId,
        userId: 'usr-sim-victim',
        reporterName: 'Simulated Mesh Victim A',
        emergencyType: pkt.type,
        emergencyCategory:
          pkt.type === 'MEDICAL' ? 'MEDICAL_CARDIAC_TRAUMA' : 'FLOOD_SUBMERSION',
        latitude: 12.9912 + (Math.random() - 0.5) * 0.02,
        longitude: 80.2244 + (Math.random() - 0.5) * 0.02,
        locationLabel: 'Mesh Simulator Sector (Velachery-Guindy Corridor)',
        timestamp: now,
        severity: pkt.type === 'SOS' || pkt.type === 'MEDICAL' ? 'CRITICAL' : 'MEDIUM',
        severityScore: pkt.type === 'SOS' ? 91 : 84,
        priority: pkt.priorityRank,
        ttl: pkt.ttl,
        hopCount: pkt.hops,
        status: 'RESCUE_TEAM_RECEIVED',
        injuryStatus: pkt.type === 'SOS' || pkt.type === 'MEDICAL',
        victimCount: 3,
        firePresent: false,
        floodSeverity: 2,
        medicalUrgency: pkt.type === 'MEDICAL' ? 3 : 2,
        trappedPersonStatus: pkt.type === 'SOS',
        reportedDangerLevel: 5,
        description: `Relayed via Store-Carry-Forward Simulation Mode (${pkt.hops} hops, ${pkt.protocol}).`,
        recommendedResponse: 'Swift-Water Boat Unit + Helicopter Winch',
        aiConfidence: null,
        modelSource: 'pending_server_eval',
        routingProtocol: pkt.protocol,
        syncedAt: now,
        relayHops: [
          {
            fromNode: 'Victim A (SIM)',
            toNode: 'Relay B (SIM)',
            transport: 'BLE',
            hopNumber: 1,
            rssi: -60,
            relayedAt: now,
          },
          {
            fromNode: 'Relay B (SIM)',
            toNode: 'Relay C (SIM)',
            transport: 'WIFI_DIRECT',
            hopNumber: 2,
            rssi: -51,
            relayedAt: now,
          },
        ],
      });
      setSyncedNotice(
        `Packet ${pkt.messageId} synchronized to live Rescue Team backend via POST /api/emergency/sync.`
      );
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-[#0D1B2E] p-5">
        <div>
          <p className="font-mono text-xs font-semibold text-amber-300">
            SIMULATION MODE — DEVELOPMENT & DEMONSTRATION
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">
            Store → Carry → Forward Mesh Routing Lab
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">
            Demonstrates Epidemic routing (SOS/Medical), PRoPHET routing (Location/Chat), priority preemption, TTL expiration, and duplicate suppression. Physical BLE/Wi-Fi Direct radio transport is implemented in the Kotlin Android module.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPackets([]);
            setSeenIds([]);
            setSyncedNotice(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#15253E] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Simulation
        </button>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1B2E] p-5 lg:col-span-4">
          <h2 className="text-base font-semibold text-white">Inject Mesh Packet</h2>
          <div>
            <label className="block text-xs text-slate-400">Message Priority Type</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['SOS', 'MEDICAL', 'LOCATION', 'CHAT'] as MeshMessageType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPacketType(t)}
                  className={`rounded-lg py-2 font-mono text-xs font-semibold ${
                    packetType === t
                      ? t === 'SOS'
                        ? 'bg-red-600 text-white'
                        : 'bg-cyan-500 text-slate-950'
                      : 'bg-[#07111F] text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Initial TTL (Max Hops)</span>
              <span className="font-mono text-cyan-400">{initialTtl}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={initialTtl}
              onChange={(e) => setInitialTtl(Number(e.target.value))}
              className="mt-1.5 w-full accent-cyan-400"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Set TTL = 1 to verify loop-prevention & expiration drop behavior.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => spawnPacket()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500"
            >
              <ShieldAlert className="h-4 w-4" />
              Create & Store Packet at Victim A
            </button>
            <button
              type="button"
              onClick={stepForwardAll}
              disabled={packets.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
              Advance Next Store-Carry-Forward Hop
            </button>
            {seenIds.length > 0 && (
              <button
                type="button"
                onClick={() => spawnPacket(seenIds[0])}
                className="rounded-xl border border-slate-700 bg-[#15253E] py-2 text-xs font-medium text-amber-300 hover:bg-slate-700"
              >
                Test Duplicate Replay ({seenIds[0]})
              </button>
            )}
          </div>
        </div>

        {/* Visual Topology & Packet Queue */}
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
            <h2 className="mb-4 text-base font-semibold text-white">
              4-Hop Relay Topology
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {NODES.map((node, idx) => {
                const countHere = packets.filter(
                  (p) => p.currentNodeIndex === idx && p.status !== 'EXPIRED' && p.status !== 'DROPPED_DUPLICATE'
                ).length;
                return (
                  <div
                    key={node.id}
                    className="relative rounded-xl border border-slate-700 bg-[#07111F] p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold text-cyan-400">
                        {node.id}
                      </span>
                      {idx === 0 || idx === 1 ? (
                        <Bluetooth className="h-3.5 w-3.5 text-cyan-400" />
                      ) : idx === 2 ? (
                        <Wifi className="h-3.5 w-3.5 text-amber-400" />
                      ) : (
                        <Radio className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-white">{node.name}</p>
                    <p className="text-[11px] text-slate-400">{node.role}</p>
                    <p className="mt-2 font-mono text-[10px] text-slate-500">{node.radio}</p>
                    <div className="mt-3 border-t border-slate-800 pt-2 font-mono text-xs text-white">
                      Cached Packets: <span className="text-cyan-400">{countHere}</span>
                    </div>
                    {idx < 3 && (
                      <ArrowRight className="absolute top-1/2 -right-3.5 hidden h-4 w-4 -translate-y-1/2 text-slate-600 sm:block" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {syncedNotice && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              {syncedNotice}
            </div>
          )}

          {/* Priority Queue Table */}
          <div className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">
              Priority-Sorted Forwarding Queue ({packets.length})
            </h3>
            {packets.length === 0 ? (
              <p className="text-xs text-slate-400">
                Click "Create & Store Packet at Victim A" to simulate Store-Carry-Forward routing.
              </p>
            ) : (
              <div className="space-y-2.5">
                {packets.map((pkt) => (
                  <div
                    key={`${pkt.messageId}-${pkt.status}-${pkt.hops}`}
                    className="rounded-xl border border-slate-800 bg-[#07111F] p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-cyan-300">
                          {pkt.messageId}
                        </span>
                        <span className="font-mono text-[11px] text-slate-300">
                          P{pkt.priorityRank} · {pkt.type} · {pkt.protocol}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-slate-400">
                          TTL {pkt.ttl} · Hops {pkt.hops}
                        </span>
                        {pkt.status === 'DELIVERED' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Gateway Reached
                          </span>
                        ) : pkt.status === 'EXPIRED' || pkt.status === 'DROPPED_DUPLICATE' ? (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <XCircle className="h-3.5 w-3.5" /> {pkt.status}
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            At {NODES[pkt.currentNodeIndex].name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-400">
                      {pkt.log.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>

                    {pkt.status === 'DELIVERED' && (
                      <button
                        type="button"
                        disabled={syncingId === pkt.messageId}
                        onClick={() => pushToRealBackend(pkt)}
                        className="mt-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {syncingId === pkt.messageId
                          ? 'Syncing...'
                          : 'Sync Delivered Packet to Live Rescue Dashboard'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
