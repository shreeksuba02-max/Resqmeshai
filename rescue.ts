export type UserRole = 'SURVIVOR' | 'RELAY_NODE' | 'RESCUE_TEAM';

export type EmergencyCategory =
  | 'COLLAPSE_TRAPPED'
  | 'MEDICAL_CARDIAC_TRAUMA'
  | 'FLOOD_SUBMERSION'
  | 'FIRE_HAZMAT'
  | 'LANDSLIDE'
  | 'SHELTER_SUPPLY'
  | 'GENERAL_SOS';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type DeliveryStatus =
  | 'SOS_CREATED'
  | 'STORED_LOCALLY'
  | 'NEARBY_DEVICE_RECEIVED'
  | 'FORWARDED'
  | 'RESCUE_TEAM_RECEIVED'
  | 'HELP_ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED';

export type MeshMessageType = 'SOS' | 'MEDICAL' | 'LOCATION' | 'CHAT';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  bloodGroup?: string;
  medicalNotes?: string;
  deviceId: string;
  createdAt?: string;
}

export interface RelayHop {
  fromNode: string;
  toNode: string;
  transport: 'BLE' | 'WIFI_DIRECT' | 'CLOUD_SYNC';
  hopNumber: number;
  rssi: number;
  relayedAt: string;
}

export interface EmergencyItem {
  messageId: string;
  userId: string;
  reporterName: string;
  emergencyType: string;
  emergencyCategory: EmergencyCategory;
  latitude: number;
  longitude: number;
  locationLabel: string;
  timestamp: string;
  severity: PriorityLevel;
  severityScore: number;
  priority: number;
  ttl: number;
  hopCount: number;
  status: DeliveryStatus;
  injuryStatus: boolean;
  victimCount: number;
  firePresent: boolean;
  floodSeverity: number;
  medicalUrgency: number;
  trappedPersonStatus: boolean;
  reportedDangerLevel: number;
  description: string;
  recommendedResponse: string;
  aiConfidence: number | null;
  modelSource: string;
  encryptedPayload?: string;
  routingProtocol: 'EPIDEMIC' | 'PROPHET';
  syncedAt: string | null;
  assignedTeamId?: string | null;
  assignedTeamName?: string | null;
  dispatchNotes?: string | null;
  relayHops?: RelayHop[];
}

export interface MeshMessageItem {
  messageId: string;
  senderId: string;
  senderName: string;
  messageType: MeshMessageType;
  priorityRank: number;
  routingProtocol: 'EPIDEMIC' | 'PROPHET';
  payload: string;
  encryptedDigest: string;
  ttl: number;
  hopCount: number;
  createdAt: string;
  expiresAt: string;
  synced: boolean;
}

export interface RescueTeamItem {
  id: string;
  name: string;
  callSign: string;
  specialty: string;
  personnelCount: number;
  status: 'AVAILABLE' | 'DISPATCHED' | 'ON_SCENE' | 'RETURNING';
  latitude: number;
  longitude: number;
  baseLocation: string;
  activeIncidentId?: string | null;
}

export interface DispatchItem {
  id: string;
  emergencyId: string;
  teamId: string;
  teamName: string;
  assignedBy: string;
  notes: string;
  status: string;
  createdAt: string;
}

export interface RelayHistoryItem {
  id: string;
  messageId: string;
  fromNode: string;
  toNode: string;
  transport: 'BLE' | 'WIFI_DIRECT' | 'CLOUD_SYNC';
  hopNumber: number;
  rssi: number;
  relayedAt: string;
}

export interface AnalyticsResponse {
  summary: {
    totalSos: number;
    criticalCount: number;
    pendingCount: number;
    activeCount: number;
    resolvedCount: number;
    totalVictimsAffected: number;
    averageHops: number;
    availableTeams: number;
    totalTeams: number;
    totalRelayEvents: number;
  };
  bySeverity: Record<PriorityLevel, number>;
  byCategory: Record<string, number>;
  aiModel: {
    modelType: string;
    version: string;
    trainedAt: string;
    evaluation: {
      accuracy: number;
      macro_f1: number;
      per_class: Record<string, { precision: number; recall: number; f1: number; support: number }>;
      confusion_matrix: number[][];
    };
  } | null;
}

export type AppWorkspace = 'dashboard' | 'field-app' | 'mesh-sim' | 'architecture';

export type DashboardSection =
  | 'overview'
  | 'live-alerts'
  | 'victim-map'
  | 'priority-queue'
  | 'rescue-teams'
  | 'dispatch'
  | 'history'
  | 'analytics'
  | 'settings';

export type MobileScreenId =
  | 'splash'
  | 'onboarding'
  | 'login'
  | 'register'
  | 'role-select'
  | 'home'
  | 'sos-create'
  | 'category-select'
  | 'location'
  | 'mesh-network'
  | 'nearby-devices'
  | 'shake-settings'
  | 'emergency-status'
  | 'emergency-history'
  | 'messages'
  | 'profile'
  | 'settings'
  | 'offline-mode'
  | 'help-about';
