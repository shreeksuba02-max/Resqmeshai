import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import type {
  DispatchRecord,
  EmergencyRecord,
  MeshMessageRecord,
  RelayHistoryRecord,
  RescueTeamRecord,
} from './types.js';

const dbPath = process.env.RESCUEMESH_DB_PATH
  ? path.resolve(process.cwd(), process.env.RESCUEMESH_DB_PATH)
  : path.resolve(process.cwd(), 'rescuemesh.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SURVIVOR','RELAY_NODE','RESCUE_TEAM')),
      bloodGroup TEXT DEFAULT '',
      medicalNotes TEXT DEFAULT '',
      deviceId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rescue_teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      callSign TEXT NOT NULL,
      specialty TEXT NOT NULL,
      personnelCount INTEGER NOT NULL,
      status TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      baseLocation TEXT NOT NULL,
      activeIncidentId TEXT
    );

    CREATE TABLE IF NOT EXISTS emergencies (
      messageId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      reporterName TEXT NOT NULL,
      emergencyType TEXT NOT NULL,
      emergencyCategory TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      locationLabel TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      severity TEXT NOT NULL,
      severityScore INTEGER NOT NULL,
      priority INTEGER NOT NULL,
      ttl INTEGER NOT NULL,
      hopCount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      injuryStatus INTEGER NOT NULL DEFAULT 0,
      victimCount INTEGER NOT NULL DEFAULT 1,
      firePresent INTEGER NOT NULL DEFAULT 0,
      floodSeverity INTEGER NOT NULL DEFAULT 0,
      medicalUrgency INTEGER NOT NULL DEFAULT 0,
      trappedPersonStatus INTEGER NOT NULL DEFAULT 0,
      reportedDangerLevel INTEGER NOT NULL DEFAULT 3,
      description TEXT NOT NULL,
      recommendedResponse TEXT NOT NULL,
      aiConfidence REAL,
      modelSource TEXT NOT NULL,
      encryptedPayload TEXT,
      routingProtocol TEXT NOT NULL DEFAULT 'EPIDEMIC',
      syncedAt TEXT,
      assignedTeamId TEXT,
      assignedTeamName TEXT,
      dispatchNotes TEXT
    );

    CREATE TABLE IF NOT EXISTS dispatches (
      id TEXT PRIMARY KEY,
      emergencyId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      teamName TEXT NOT NULL,
      assignedBy TEXT NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mesh_messages (
      messageId TEXT PRIMARY KEY,
      senderId TEXT NOT NULL,
      senderName TEXT NOT NULL,
      messageType TEXT NOT NULL CHECK(messageType IN ('SOS','MEDICAL','LOCATION','CHAT')),
      priorityRank INTEGER NOT NULL,
      routingProtocol TEXT NOT NULL,
      payload TEXT NOT NULL,
      encryptedDigest TEXT NOT NULL,
      ttl INTEGER NOT NULL,
      hopCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS relay_history (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      fromNode TEXT NOT NULL,
      toNode TEXT NOT NULL,
      transport TEXT NOT NULL,
      hopNumber INTEGER NOT NULL,
      rssi INTEGER NOT NULL,
      relayedAt TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    const now = new Date().toISOString();
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, passwordHash, phone, role, bloodGroup, medicalNotes, deviceId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const demoHash = bcrypt.hashSync('Rescue@2026', 10);
    insertUser.run(
      'usr-survivor-01',
      'Ananya Krishnan',
      'survivor@rescuemesh.org',
      demoHash,
      '+91-98401-44210',
      'SURVIVOR',
      'O+',
      'Asthma inhaler required',
      'RM-DEV-409A',
      now
    );
    insertUser.run(
      'usr-relay-01',
      'Karthik Subramanian',
      'relay@rescuemesh.org',
      demoHash,
      '+91-94440-11298',
      'RELAY_NODE',
      'B+',
      'Field Volunteer - Velachery Sector',
      'RM-REL-882C',
      now
    );
    insertUser.run(
      'usr-rescue-01',
      'Cmdr. Rajeshwar Nair',
      'commander@rescuemesh.org',
      demoHash,
      '+91-94450-90001',
      'RESCUE_TEAM',
      'A+',
      'NDRF Sector Incident Commander',
      'RM-CMD-001X',
      now
    );
  }

  const teamCount = (db.prepare('SELECT COUNT(*) as c FROM rescue_teams').get() as { c: number }).c;
  if (teamCount === 0) {
    const insertTeam = db.prepare(`
      INSERT INTO rescue_teams (id, name, callSign, specialty, personnelCount, status, latitude, longitude, baseLocation, activeIncidentId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertTeam.run('team-ndrf-1', 'NDRF Swift-Water Unit Alpha', 'NDRF-SW-01', 'Flood & Boat Extraction', 14, 'DISPATCHED', 13.0125, 80.2241, 'Guindy Command Staging', 'SOS-2026-001');
    insertTeam.run('team-usar-2', 'Urban Search & Rescue Bravo', 'USAR-BR-02', 'Structural Collapse Extraction', 18, 'AVAILABLE', 13.0674, 80.2376, 'Nungambakkam Fire Hub', null);
    insertTeam.run('team-med-3', 'Trauma & Air-Evac Medical 03', 'MED-EVAC-03', 'Emergency Cardiac & Trauma', 8, 'ON_SCENE', 12.9815, 80.2180, 'Velachery Relief Camp', 'SOS-2026-002');
    insertTeam.run('team-sdrf-4', 'SDRF Coastal Hazmat & Fire', 'SDRF-HZ-04', 'Fire Suppression & Chemical Containment', 12, 'AVAILABLE', 13.0892, 80.2707, 'Chennai Port Staging', null);
  }

  const emergencyCount = (db.prepare('SELECT COUNT(*) as c FROM emergencies').get() as { c: number }).c;
  if (emergencyCount === 0) {
    const nowMs = Date.now();
    const insertEm = db.prepare(`
      INSERT INTO emergencies (
        messageId, userId, reporterName, emergencyType, emergencyCategory,
        latitude, longitude, locationLabel, timestamp, severity, severityScore,
        priority, ttl, hopCount, status, injuryStatus, victimCount, firePresent,
        floodSeverity, medicalUrgency, trappedPersonStatus, reportedDangerLevel,
        description, recommendedResponse, aiConfidence, modelSource,
        encryptedPayload, routingProtocol, syncedAt, assignedTeamId, assignedTeamName, dispatchNotes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedCases = [
      {
        messageId: 'SOS-2026-001',
        userId: 'usr-survivor-01',
        reporterName: 'Ananya Krishnan',
        emergencyType: 'SOS',
        emergencyCategory: 'FLOOD_SUBMERSION',
        latitude: 12.9756,
        longitude: 80.2206,
        locationLabel: 'Velachery Bypass Bridge, Chennai',
        timestamp: new Date(nowMs - 14 * 60000).toISOString(),
        severity: 'CRITICAL',
        severityScore: 91,
        priority: 1,
        ttl: 8,
        hopCount: 2,
        status: 'HELP_ASSIGNED',
        injuryStatus: 1,
        victimCount: 6,
        firePresent: 0,
        floodSeverity: 3,
        medicalUrgency: 2,
        trappedPersonStatus: 1,
        reportedDangerLevel: 5,
        description: 'Water level rising rapidly on ground floor; 6 residents including 2 elderly stranded on mezzanine.',
        recommendedResponse: 'Swift-Water Boat Unit + Helicopter Winch',
        aiConfidence: 0.94,
        modelSource: 'random_forest_classifier',
        routingProtocol: 'EPIDEMIC',
        syncedAt: new Date(nowMs - 11 * 60000).toISOString(),
        assignedTeamId: 'team-ndrf-1',
        assignedTeamName: 'NDRF Swift-Water Unit Alpha',
        dispatchNotes: 'Inflatable rescue boat en route via 100ft road corridor.',
      },
      {
        messageId: 'SOS-2026-002',
        userId: 'usr-survivor-02',
        reporterName: 'Meenakshi Sundaram',
        emergencyType: 'MEDICAL',
        emergencyCategory: 'MEDICAL_CARDIAC_TRAUMA',
        latitude: 12.9891,
        longitude: 80.2112,
        locationLabel: 'Madipakkam Lake South Bank',
        timestamp: new Date(nowMs - 28 * 60000).toISOString(),
        severity: 'CRITICAL',
        severityScore: 88,
        priority: 1,
        ttl: 7,
        hopCount: 3,
        status: 'IN_PROGRESS',
        injuryStatus: 1,
        victimCount: 2,
        firePresent: 0,
        floodSeverity: 2,
        medicalUrgency: 3,
        trappedPersonStatus: 0,
        reportedDangerLevel: 5,
        description: 'Severe chest pain and laceration trauma; road flooded, cellular tower down.',
        recommendedResponse: 'Paramedic Trauma Team + Air/Ambulance Evac',
        aiConfidence: 0.92,
        modelSource: 'random_forest_classifier',
        routingProtocol: 'EPIDEMIC',
        syncedAt: new Date(nowMs - 22 * 60000).toISOString(),
        assignedTeamId: 'team-med-3',
        assignedTeamName: 'Trauma & Air-Evac Medical 03',
        dispatchNotes: 'Paramedics reached perimeter, stabilizing patient.',
      },
      {
        messageId: 'SOS-2026-003',
        userId: 'usr-survivor-03',
        reporterName: 'Prakash Rao',
        emergencyType: 'SOS',
        emergencyCategory: 'COLLAPSE_TRAPPED',
        latitude: 13.0418,
        longitude: 80.2341,
        locationLabel: 'T. Nagar Old Commercial Complex',
        timestamp: new Date(nowMs - 7 * 60000).toISOString(),
        severity: 'CRITICAL',
        severityScore: 95,
        priority: 1,
        ttl: 9,
        hopCount: 1,
        status: 'RESCUE_TEAM_RECEIVED',
        injuryStatus: 1,
        victimCount: 4,
        firePresent: 0,
        floodSeverity: 0,
        medicalUrgency: 3,
        trappedPersonStatus: 1,
        reportedDangerLevel: 5,
        description: 'Partial stairwell collapse following tremor; 4 people trapped in basement lobby.',
        recommendedResponse: 'Urban Search & Rescue (USAR) + Heavy Extraction',
        aiConfidence: 0.97,
        modelSource: 'random_forest_classifier',
        routingProtocol: 'EPIDEMIC',
        syncedAt: new Date(nowMs - 4 * 60000).toISOString(),
        assignedTeamId: null,
        assignedTeamName: null,
        dispatchNotes: null,
      },
      {
        messageId: 'SOS-2026-004',
        userId: 'usr-survivor-04',
        reporterName: 'Deepika Venkatesh',
        emergencyType: 'SOS',
        emergencyCategory: 'FIRE_HAZMAT',
        latitude: 13.0815,
        longitude: 80.2584,
        locationLabel: 'Royapuram Industrial Transformer Yard',
        timestamp: new Date(nowMs - 19 * 60000).toISOString(),
        severity: 'HIGH',
        severityScore: 71,
        priority: 2,
        ttl: 8,
        hopCount: 2,
        status: 'RESCUE_TEAM_RECEIVED',
        injuryStatus: 0,
        victimCount: 3,
        firePresent: 1,
        floodSeverity: 1,
        medicalUrgency: 1,
        trappedPersonStatus: 0,
        reportedDangerLevel: 4,
        description: 'Short-circuit transformer fire near fuel drums; smoke inhalation risk for 3 workers.',
        recommendedResponse: 'Fire Suppression + Hazmat Containment Unit',
        aiConfidence: 0.85,
        modelSource: 'random_forest_classifier',
        routingProtocol: 'EPIDEMIC',
        syncedAt: new Date(nowMs - 16 * 60000).toISOString(),
        assignedTeamId: null,
        assignedTeamName: null,
        dispatchNotes: null,
      },
      {
        messageId: 'SOS-2026-005',
        userId: 'usr-survivor-05',
        reporterName: 'Aravind Selvam',
        emergencyType: 'LOCATION',
        emergencyCategory: 'SHELTER_SUPPLY',
        latitude: 13.0052,
        longitude: 80.2569,
        locationLabel: 'Adyar Community School Shelter',
        timestamp: new Date(nowMs - 55 * 60000).toISOString(),
        severity: 'MEDIUM',
        severityScore: 42,
        priority: 3,
        ttl: 6,
        hopCount: 4,
        status: 'RESCUE_TEAM_RECEIVED',
        injuryStatus: 0,
        victimCount: 18,
        firePresent: 0,
        floodSeverity: 1,
        medicalUrgency: 1,
        trappedPersonStatus: 0,
        reportedDangerLevel: 2,
        description: '18 evacuees safe on second floor; potable water and infant formula depleted.',
        recommendedResponse: 'Relief Logistics + Medical Aid Drop',
        aiConfidence: 0.82,
        modelSource: 'random_forest_classifier',
        routingProtocol: 'PROPHET',
        syncedAt: new Date(nowMs - 49 * 60000).toISOString(),
        assignedTeamId: null,
        assignedTeamName: null,
        dispatchNotes: null,
      },
      {
        messageId: 'SOS-2026-006',
        userId: 'usr-survivor-06',
        reporterName: 'Suresh Babu',
        emergencyType: 'SOS',
        emergencyCategory: 'FLOOD_SUBMERSION',
        latitude: 12.9522,
        longitude: 80.1844,
        locationLabel: 'Pallikaranai Marsh East Edge',
        timestamp: new Date(nowMs - 120 * 60000).toISOString(),
        severity: 'LOW',
        severityScore: 24,
        priority: 4,
        ttl: 5,
        hopCount: 3,
        status: 'RESOLVED',
        injuryStatus: 0,
        victimCount: 2,
        firePresent: 0,
        floodSeverity: 1,
        medicalUrgency: 0,
        trappedPersonStatus: 0,
        reportedDangerLevel: 2,
        description: 'Family safely evacuated to Tambaram transit camp by volunteer boat.',
        recommendedResponse: 'Swift-Water Boat Unit + Helicopter Winch',
        aiConfidence: 0.89,
        modelSource: 'random_forest_classifier',
        routingProtocol: 'EPIDEMIC',
        syncedAt: new Date(nowMs - 110 * 60000).toISOString(),
        assignedTeamId: 'team-ndrf-1',
        assignedTeamName: 'NDRF Swift-Water Unit Alpha',
        dispatchNotes: 'Evacuation verified and closed.',
      },
    ];

    for (const c of seedCases) {
      const digest = crypto
        .createHash('sha256')
        .update(`${c.messageId}:${c.timestamp}:${c.latitude}:${c.longitude}`)
        .digest('hex')
        .slice(0, 32);

      insertEm.run(
        c.messageId,
        c.userId,
        c.reporterName,
        c.emergencyType,
        c.emergencyCategory,
        c.latitude,
        c.longitude,
        c.locationLabel,
        c.timestamp,
        c.severity,
        c.severityScore,
        c.priority,
        c.ttl,
        c.hopCount,
        c.status,
        c.injuryStatus,
        c.victimCount,
        c.firePresent,
        c.floodSeverity,
        c.medicalUrgency,
        c.trappedPersonStatus,
        c.reportedDangerLevel,
        c.description,
        c.recommendedResponse,
        c.aiConfidence,
        c.modelSource,
        `AES256-GCM:${digest}`,
        c.routingProtocol,
        c.syncedAt,
        c.assignedTeamId,
        c.assignedTeamName,
        c.dispatchNotes
      );
    }

    const insertRelay = db.prepare(`
      INSERT INTO relay_history (id, messageId, fromNode, toNode, transport, hopNumber, rssi, relayedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertRelay.run('rel-1', 'SOS-2026-001', 'RM-DEV-409A (Victim)', 'RM-REL-882C (Relay B)', 'BLE', 1, -64, new Date(nowMs - 13 * 60000).toISOString());
    insertRelay.run('rel-2', 'SOS-2026-001', 'RM-REL-882C (Relay B)', 'RM-REL-510F (Relay C)', 'WIFI_DIRECT', 2, -52, new Date(nowMs - 12 * 60000).toISOString());
    insertRelay.run('rel-3', 'SOS-2026-001', 'RM-REL-510F (Relay C)', 'NDRF-GATEWAY-01', 'CLOUD_SYNC', 3, -45, new Date(nowMs - 11 * 60000).toISOString());
    insertRelay.run('rel-4', 'SOS-2026-003', 'RM-DEV-711B (Victim)', 'RM-REL-882C (Relay B)', 'BLE', 1, -71, new Date(nowMs - 6 * 60000).toISOString());

    const insertMsg = db.prepare(`
      INSERT INTO mesh_messages (messageId, senderId, senderName, messageType, priorityRank, routingProtocol, payload, encryptedDigest, ttl, hopCount, createdAt, expiresAt, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMsg.run(
      'MSG-9001',
      'usr-survivor-01',
      'Ananya Krishnan',
      'SOS',
      1,
      'EPIDEMIC',
      'Water rising fast near Velachery Bypass Bridge. 6 stranded, 2 elderly.',
      'GCM-90A8F1C2E40B',
      10,
      2,
      new Date(nowMs - 14 * 60000).toISOString(),
      new Date(nowMs + 6 * 3600000).toISOString(),
      1
    );
    insertMsg.run(
      'MSG-9002',
      'usr-relay-01',
      'Karthik Subramanian (Relay)',
      'LOCATION',
      3,
      'PROPHET',
      'Relay B moving north toward Guindy staging area with 4 cached packets.',
      'GCM-44B109C7D221',
      8,
      1,
      new Date(nowMs - 9 * 60000).toISOString(),
      new Date(nowMs + 6 * 3600000).toISOString(),
      1
    );
  }
}

export function rowToEmergency(row: Record<string, unknown>): EmergencyRecord {
  return {
    messageId: String(row.messageId),
    userId: String(row.userId),
    reporterName: String(row.reporterName),
    emergencyType: String(row.emergencyType),
    emergencyCategory: row.emergencyCategory as EmergencyRecord['emergencyCategory'],
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    locationLabel: String(row.locationLabel),
    timestamp: String(row.timestamp),
    severity: row.severity as EmergencyRecord['severity'],
    severityScore: Number(row.severityScore),
    priority: Number(row.priority),
    ttl: Number(row.ttl),
    hopCount: Number(row.hopCount),
    status: row.status as EmergencyRecord['status'],
    injuryStatus: Boolean(row.injuryStatus),
    victimCount: Number(row.victimCount),
    firePresent: Boolean(row.firePresent),
    floodSeverity: Number(row.floodSeverity),
    medicalUrgency: Number(row.medicalUrgency),
    trappedPersonStatus: Boolean(row.trappedPersonStatus),
    reportedDangerLevel: Number(row.reportedDangerLevel),
    description: String(row.description),
    recommendedResponse: String(row.recommendedResponse),
    aiConfidence: row.aiConfidence === null ? null : Number(row.aiConfidence),
    modelSource: String(row.modelSource),
    encryptedPayload: row.encryptedPayload ? String(row.encryptedPayload) : undefined,
    routingProtocol: (row.routingProtocol as 'EPIDEMIC' | 'PROPHET') || 'EPIDEMIC',
    syncedAt: row.syncedAt ? String(row.syncedAt) : null,
    assignedTeamId: row.assignedTeamId ? String(row.assignedTeamId) : null,
    assignedTeamName: row.assignedTeamName ? String(row.assignedTeamName) : null,
    dispatchNotes: row.dispatchNotes ? String(row.dispatchNotes) : null,
  };
}

export function listEmergencies(filters?: {
  severity?: string;
  status?: string;
  search?: string;
}): EmergencyRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM emergencies ORDER BY priority ASC, severityScore DESC, timestamp DESC`
    )
    .all() as Record<string, unknown>[];

  let list = rows.map(rowToEmergency);
  if (filters?.severity && filters.severity !== 'ALL') {
    list = list.filter((e) => e.severity === filters.severity);
  }
  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter((e) => e.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (e) =>
        e.messageId.toLowerCase().includes(q) ||
        e.reporterName.toLowerCase().includes(q) ||
        e.locationLabel.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
    );
  }
  return list;
}

export function listRescueTeams(): RescueTeamRecord[] {
  return db
    .prepare('SELECT * FROM rescue_teams ORDER BY status ASC, name ASC')
    .all() as RescueTeamRecord[];
}

export function listDispatches(emergencyId?: string): DispatchRecord[] {
  if (emergencyId) {
    return db
      .prepare('SELECT * FROM dispatches WHERE emergencyId = ? ORDER BY createdAt DESC')
      .all(emergencyId) as DispatchRecord[];
  }
  return db
    .prepare('SELECT * FROM dispatches ORDER BY createdAt DESC')
    .all() as DispatchRecord[];
}

export function listRelayHistory(messageId?: string): RelayHistoryRecord[] {
  if (messageId) {
    return db
      .prepare('SELECT * FROM relay_history WHERE messageId = ? ORDER BY hopNumber ASC')
      .all(messageId) as RelayHistoryRecord[];
  }
  return db
    .prepare('SELECT * FROM relay_history ORDER BY relayedAt DESC LIMIT 100')
    .all() as RelayHistoryRecord[];
}

export function listMeshMessages(): MeshMessageRecord[] {
  const rows = db
    .prepare('SELECT * FROM mesh_messages ORDER BY priorityRank ASC, createdAt DESC LIMIT 150')
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    messageId: String(r.messageId),
    senderId: String(r.senderId),
    senderName: String(r.senderName),
    messageType: r.messageType as MeshMessageRecord['messageType'],
    priorityRank: Number(r.priorityRank),
    routingProtocol: r.routingProtocol as 'EPIDEMIC' | 'PROPHET',
    payload: String(r.payload),
    encryptedDigest: String(r.encryptedDigest),
    ttl: Number(r.ttl),
    hopCount: Number(r.hopCount),
    createdAt: String(r.createdAt),
    expiresAt: String(r.expiresAt),
    synced: Boolean(r.synced),
  }));
}
