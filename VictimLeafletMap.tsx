import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { EmergencyItem, PriorityLevel, RescueTeamItem } from '../../types/rescue';
import { formatCategoryLabel, formatDeliveryStatus } from '../common/SeverityBadge';

interface VictimLeafletMapProps {
  emergencies: EmergencyItem[];
  teams?: RescueTeamItem[];
  selectedId?: string | null;
  onSelectEmergency?: (item: EmergencyItem) => void;
  heightClass?: string;
}

function createEmergencyIcon(severity: PriorityLevel, isSelected: boolean): L.DivIcon {
  const palette: Record<PriorityLevel, { fill: string; ring: string; shape: string }> = {
    CRITICAL: { fill: '#EF4444', ring: 'rgba(239,68,68,0.45)', shape: '!' },
    HIGH: { fill: '#F59E0B', ring: 'rgba(245,158,11,0.38)', shape: '▲' },
    MEDIUM: { fill: '#06B6D4', ring: 'rgba(6,182,212,0.32)', shape: '◆' },
    LOW: { fill: '#10B981', ring: 'rgba(16,185,129,0.28)', shape: '●' },
  };
  const cfg = palette[severity];
  const size = isSelected ? 34 : severity === 'CRITICAL' ? 28 : 24;
  const border = isSelected ? '2px solid #FFFFFF' : '1.5px solid #07111F';

  return L.divIcon({
    className: 'rescuemesh-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:${severity === 'HIGH' ? '6px' : severity === 'MEDIUM' ? '4px' : '9999px'};
        background:${cfg.fill};
        border:${border};
        box-shadow:0 0 0 ${isSelected ? 6 : 4}px ${cfg.ring};
        display:flex;
        align-items:center;
        justify-content:center;
        color:#FFFFFF;
        font-family:'JetBrains Mono',monospace;
        font-size:${severity === 'CRITICAL' ? 13 : 11}px;
        font-weight:700;
        cursor:pointer;
      ">${cfg.shape}</div>
    `,
  });
}

function createTeamIcon(): L.DivIcon {
  return L.divIcon({
    className: 'rescuemesh-team-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `
      <div style="
        width:24px;
        height:24px;
        border-radius:5px;
        background:#0F294A;
        border:1.5px solid #22D3EE;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#22D3EE;
        font-family:'JetBrains Mono',monospace;
        font-size:10px;
        font-weight:700;
      ">R</div>
    `,
  });
}

export function VictimLeafletMap({
  emergencies,
  teams = [],
  selectedId,
  onSelectEmergency,
  heightClass = 'h-[420px]',
}: VictimLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [13.025, 80.23],
      zoom: 12,
      zoomControl: true,
    });

    // Dark CartoDB basemap tiles with graceful OSM fallback
    const tileLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }
    );
    tileLayer.addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    emergencies.forEach((em) => {
      const marker = L.marker([em.latitude, em.longitude], {
        icon: createEmergencyIcon(em.severity, em.messageId === selectedId),
      });

      const popupHtml = `
        <div style="min-width:210px;font-family:'Plus Jakarta Sans',sans-serif;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#22D3EE;font-weight:600;">${em.messageId}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:${
              em.severity === 'CRITICAL' ? '#F87171' : em.severity === 'HIGH' ? '#FBBF24' : '#34D399'
            };">${em.severity} (${em.severityScore}/100)</span>
          </div>
          <div style="font-weight:600;font-size:13px;color:#F8FAFC;margin-bottom:2px;">${em.reporterName}</div>
          <div style="font-size:11px;color:#94A3B8;margin-bottom:6px;">${formatCategoryLabel(em.emergencyCategory)} · ${em.victimCount} victim(s)</div>
          <div style="font-size:11px;color:#CBD5E1;margin-bottom:6px;line-height:1.4;">${em.locationLabel}</div>
          <div style="font-size:11px;color:#94A3B8;">Status: <strong style="color:#E2E8F0;">${formatDeliveryStatus(em.status)}</strong></div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        onSelectEmergency?.(em);
      });
      marker.addTo(group);
    });

    teams.forEach((team) => {
      const tMarker = L.marker([team.latitude, team.longitude], {
        icon: createTeamIcon(),
      });
      tMarker.bindPopup(`
        <div style="min-width:180px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#22D3EE;font-weight:600;">${team.callSign}</div>
          <div style="font-weight:600;font-size:13px;color:#F8FAFC;">${team.name}</div>
          <div style="font-size:11px;color:#94A3B8;">${team.specialty} · ${team.personnelCount} personnel</div>
          <div style="font-size:11px;color:#CBD5E1;margin-top:4px;">Status: ${team.status}</div>
        </div>
      `);
      tMarker.addTo(group);
    });

    if (selectedId) {
      const target = emergencies.find((e) => e.messageId === selectedId);
      if (target) {
        map.panTo([target.latitude, target.longitude], { animate: true });
      }
    }
  }, [emergencies, teams, selectedId, onSelectEmergency]);

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-slate-800 bg-[#081426] ${heightClass}`}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-[#07111F]/90 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Critical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" /> High
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-cyan-500" /> Medium
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Low
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-xs border border-cyan-400 bg-[#0F294A] font-mono text-[9px] text-cyan-300">
            R
          </span>
          Rescue Unit
        </span>
      </div>
    </div>
  );
}
