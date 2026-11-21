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

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  bloodGroup?: string;
  medicalNotes?: string;
  deviceId: string;
  createdAt: string;
}

export interface EmergencyRecord {
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
  priority: number; // 1 = CRITICAL, 2 = HIGH, 3 = MEDIUM, 4 = LOW
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
}

export interface MeshMessageRecord {
  messageId: string;
  senderId: string;
  senderName: string;
  messageType: MeshMessageType;
  priorityRank: number; // 1 SOS, 2 MEDICAL, 3 LOCATION, 4 CHAT
  routingProtocol: 'EPIDEMIC' | 'PROPHET';
  payload: string;
  encryptedDigest: string;
  ttl: number;
  hopCount: number;
  createdAt: string;
  expiresAt: string;
  synced: boolean;
}

export interface RescueTeamRecord {
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

export interface DispatchRecord {
  id: string;
  emergencyId: string;
  teamId: string;
  teamName: string;
  assignedBy: string;
  notes: string;
  status: string;
  createdAt: string;
}

export interface RelayHistoryRecord {
  id: string;
  messageId: string;
  fromNode: string;
  toNode: string;
  transport: 'BLE' | 'WIFI_DIRECT' | 'CLOUD_SYNC';
  hopNumber: number;
  rssi: number;
  relayedAt: string;
}

export interface AiPredictionInput {
  emergencyCategory: EmergencyCategory | string;
  injuryStatus: boolean;
  victimCount: number;
  firePresent: boolean;
  floodSeverity: number; // 0..3
  medicalUrgency: number; // 0..3
  trappedPersonStatus: boolean;
  reportedDangerLevel: number; // 1..5
  useFallbackOnly?: boolean;
}

export interface AiPredictionOutput {
  severityScore: number;
  priority: PriorityLevel;
  priorityNumeric: number;
  recommendedResponseCategory: string;
  confidence: number | null;
  classProbabilities?: Record<string, number>;
  modelSource: 'random_forest_classifier' | 'rule_based_fallback';
  modelEvaluation?: {
    accuracy: number;
    macro_f1: number;
    per_class: Record<string, { precision: number; recall: number; f1: number; support: number }>;
    confusion_matrix: number[][];
  };
  advisoryNote: string;
}
