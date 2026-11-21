import type { DeliveryStatus, PriorityLevel } from '../../types/rescue';

export function getSeverityColor(severity: PriorityLevel): {
  text: string;
  hex: string;
  markerBg: string;
} {
  switch (severity) {
    case 'CRITICAL':
      return { text: 'text-red-400', hex: '#EF4444', markerBg: '#DC2626' };
    case 'HIGH':
      return { text: 'text-amber-400', hex: '#F59E0B', markerBg: '#D97706' };
    case 'MEDIUM':
      return { text: 'text-cyan-400', hex: '#22D3EE', markerBg: '#0891B2' };
    case 'LOW':
      return { text: 'text-emerald-400', hex: '#34D399', markerBg: '#059669' };
  }
}

export function formatDeliveryStatus(status: DeliveryStatus): string {
  switch (status) {
    case 'SOS_CREATED':
      return 'SOS Created';
    case 'STORED_LOCALLY':
      return 'Stored Locally';
    case 'NEARBY_DEVICE_RECEIVED':
      return 'Nearby Device Received';
    case 'FORWARDED':
      return 'Forwarded';
    case 'RESCUE_TEAM_RECEIVED':
      return 'Rescue Team Received';
    case 'HELP_ASSIGNED':
      return 'Help Assigned';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'RESOLVED':
      return 'Resolved';
  }
}

export function formatCategoryLabel(cat: string): string {
  return cat
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SeverityText({ severity }: { severity: PriorityLevel }) {
  const style = getSeverityColor(severity);
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wide ${style.text}`}>
      <span
        className="inline-block h-2 w-2 rounded-xs shrink-0"
        style={{ backgroundColor: style.hex }}
        aria-hidden="true"
      />
      {severity}
    </span>
  );
}
