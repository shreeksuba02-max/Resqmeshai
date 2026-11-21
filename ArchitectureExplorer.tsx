import { Cpu, Database, FileCode2, Lock, Radio, ShieldCheck } from 'lucide-react';

export function ArchitectureExplorer() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-6 rounded-2xl border border-slate-800 bg-[#0D1B2E] p-6 lg:grid-cols-12 items-stretch">
        <div className="flex flex-col justify-between lg:col-span-7">
          <div>
            <p className="font-mono text-xs font-semibold text-cyan-400">
              SIH26206 · DISASTER MANAGEMENT ARCHITECTURE
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">
              RescueMesh AI System Architecture & Monorepo
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              RescueMesh AI integrates a native Kotlin Jetpack Compose Android application (BLE + Wi-Fi Direct + Room + WorkManager + SensorManager), a Node.js Express + Socket.IO backend, a trained Random Forest severity engine, and this real-time Rescue Team Command Dashboard.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-xl border border-slate-800 bg-[#07111F] p-3">
              <span className="text-slate-400">Communication Model</span>
              <p className="mt-1 font-mono font-semibold text-cyan-300">Store → Carry → Forward</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#07111F] p-3">
              <span className="text-slate-400">AI Model (Evaluated)</span>
              <p className="mt-1 font-mono font-semibold text-emerald-400">40-Tree Random Forest</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#07111F] p-3">
              <span className="text-slate-400">Android Persistence</span>
              <p className="mt-1 font-mono font-semibold text-white">Room (6 Entities)</p>
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800 lg:col-span-5">
          <img
            src="/src/assets/images/disaster_mesh_terrain_1795278054122.jpg"
            alt="RescueMesh AI disaster terrain architecture"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[
          {
            icon: FileCode2,
            title: 'RescueMeshAI/android-app/',
            desc: 'Kotlin + Jetpack Compose Material 3 MVVM app with 19 screens, Room Database (UserEntity, EmergencyEntity, MeshMessageEntity, RelayHistoryEntity, RescueTeamEntity, DispatchEntity), BLE GATT & Wi-Fi Direct managers, SensorManager ShakeDetector, and WorkManager SyncWorker.',
          },
          {
            icon: Database,
            title: 'RescueMeshAI/backend/ & /server.ts',
            desc: 'Express.js REST APIs (/api/auth/*, /api/emergency/*, /api/dispatch/assign, /api/ai/predict, /api/analytics), bcryptjs password hashing, JWT RBAC middleware, SQLite live persistence + MongoDB Mongoose schemas for production scale, and Socket.IO sync.',
          },
          {
            icon: Cpu,
            title: 'RescueMeshAI/ai-engine/',
            desc: 'Python Random Forest classifier trained and evaluated on 2,400 disaster triage records (84.44% held-out test accuracy, 0.7884 macro-F1), Scikit-learn pipeline, plus deterministic rule-based fallback.',
          },
          {
            icon: Radio,
            title: 'Hybrid Mesh Routing',
            desc: 'Epidemic flooding for Priority 1 SOS & Priority 2 Medical packets; PRoPHET probabilistic forwarding for Priority 3 Location & Priority 4 Chat. Enforces message ID deduplication and TTL hop expiration.',
          },
          {
            icon: Lock,
            title: 'Security & Integrity',
            desc: 'AES-256-GCM payload encryption helpers, SHA-256 integrity digests, JWT Bearer authentication, role-based dispatch guardrails, and guaranteed local persistence until server ACK.',
          },
          {
            icon: ShieldCheck,
            title: 'Honest Hardware Disclosures',
            desc: 'Browser previews cannot access raw Android BLE peripheral advertising or Wi-Fi Direct P2P sockets. Physical multi-device radio testing uses the Kotlin Android build; the web Mesh Lab provides a separate Simulation Mode.',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-xl border border-slate-800 bg-[#0D1B2E] p-5"
            >
              <Icon className="h-5 w-5 text-cyan-400" />
              <h2 className="mt-3 font-display text-base font-semibold text-white">
                {card.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{card.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
