import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import {
  getModelEvaluationSummary,
  predictEmergencySeverity,
} from './server/aiPredictor.js';
import {
  hashPassword,
  requireAuth,
  requireRole,
  signToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.js';
import {
  db,
  initializeDatabase,
  listDispatches,
  listEmergencies,
  listMeshMessages,
  listRelayHistory,
  listRescueTeams,
  rowToEmergency,
} from './server/db.js';
import type {
  DeliveryStatus,
  EmergencyCategory,
  MeshMessageType,
  UserRole,
} from './server/types.js';

dotenv.config();
initializeDatabase();

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});

app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'RescueMesh AI Backend',
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// 1. AUTHENTICATION & RBAC
// ---------------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, role, bloodGroup, medicalNotes } = req.body ?? {};
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const validRoles: UserRole[] = ['SURVIVOR', 'RELAY_NODE', 'RESCUE_TEAM'];
    const safeRole: UserRole = validRoles.includes(role) ? role : 'SURVIVOR';

    const userId = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const deviceId = `RM-${safeRole.slice(0, 3)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const passwordHash = await hashPassword(String(password));
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, name, email, passwordHash, phone, role, bloodGroup, medicalNotes, deviceId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      String(name).trim(),
      normalizedEmail,
      passwordHash,
      String(phone || '+91-00000-00000').trim(),
      safeRole,
      String(bloodGroup || '').trim(),
      String(medicalNotes || '').trim(),
      deviceId,
      createdAt
    );

    const token = signToken({
      userId,
      email: normalizedEmail,
      name: String(name).trim(),
      role: safeRole,
      deviceId,
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        name: String(name).trim(),
        email: normalizedEmail,
        phone: String(phone || '+91-00000-00000').trim(),
        role: safeRole,
        bloodGroup: String(bloodGroup || ''),
        medicalNotes: String(medicalNotes || ''),
        deviceId,
        createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', detail: (err as Error).message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(normalizedEmail) as Record<string, unknown> | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const valid = await verifyPassword(String(password), String(user.passwordHash));
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const token = signToken({
      userId: String(user.id),
      email: String(user.email),
      name: String(user.name),
      role: user.role as UserRole,
      deviceId: String(user.deviceId),
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        bloodGroup: user.bloodGroup,
        medicalNotes: user.medicalNotes,
        deviceId: user.deviceId,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: (err as Error).message });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db
    .prepare('SELECT id, name, email, phone, role, bloodGroup, medicalNotes, deviceId, createdAt FROM users WHERE id = ?')
    .get(req.user?.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

// ---------------------------------------------------------------------------
// 2. AI SEVERITY ENGINE
// ---------------------------------------------------------------------------
app.post('/api/ai/predict', (req, res) => {
  try {
    const prediction = predictEmergencySeverity({
      emergencyCategory: req.body?.emergencyCategory ?? 'GENERAL_SOS',
      injuryStatus: Boolean(req.body?.injuryStatus),
      victimCount: Number(req.body?.victimCount ?? 1),
      firePresent: Boolean(req.body?.firePresent),
      floodSeverity: Number(req.body?.floodSeverity ?? 0),
      medicalUrgency: Number(req.body?.medicalUrgency ?? 0),
      trappedPersonStatus: Boolean(req.body?.trappedPersonStatus),
      reportedDangerLevel: Number(req.body?.reportedDangerLevel ?? 3),
      useFallbackOnly: Boolean(req.body?.useFallbackOnly),
    });
    res.json(prediction);
  } catch (err) {
    res.status(400).json({ error: 'AI prediction error', detail: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// 3. EMERGENCY SOS & OFFLINE SYNC
// ---------------------------------------------------------------------------
function insertOrDeduplicateEmergency(payload: Record<string, unknown>, markRescueReceived: boolean) {
  const messageId =
    String(payload.messageId || '').trim() ||
    `SOS-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const existing = db
    .prepare('SELECT * FROM emergencies WHERE messageId = ?')
    .get(messageId) as Record<string, unknown> | undefined;

  if (existing) {
    return {
      duplicate: true,
      record: rowToEmergency(existing),
    };
  }

  const emergencyCategory = (payload.emergencyCategory || 'GENERAL_SOS') as EmergencyCategory;
  const ai = predictEmergencySeverity({
    emergencyCategory,
    injuryStatus: Boolean(payload.injuryStatus),
    victimCount: Number(payload.victimCount ?? 1),
    firePresent: Boolean(payload.firePresent),
    floodSeverity: Number(payload.floodSeverity ?? 0),
    medicalUrgency: Number(payload.medicalUrgency ?? 0),
    trappedPersonStatus: Boolean(payload.trappedPersonStatus),
    reportedDangerLevel: Number(payload.reportedDangerLevel ?? 3),
  });

  const timestamp = String(payload.timestamp || new Date().toISOString());
  const syncedAt = new Date().toISOString();
  const status: DeliveryStatus = markRescueReceived ? 'RESCUE_TEAM_RECEIVED' : 'RESCUE_TEAM_RECEIVED';
  const latitude = Number(payload.latitude ?? 13.0475);
  const longitude = Number(payload.longitude ?? 80.2376);
  const emergencyType = String(payload.emergencyType || 'SOS').toUpperCase();
  const routingProtocol = emergencyType === 'SOS' || emergencyType === 'MEDICAL' ? 'EPIDEMIC' : 'PROPHET';

  const digest = crypto
    .createHash('sha256')
    .update(`${messageId}:${timestamp}:${latitude}:${longitude}`)
    .digest('hex')
    .slice(0, 32);

  db.prepare(`
    INSERT INTO emergencies (
      messageId, userId, reporterName, emergencyType, emergencyCategory,
      latitude, longitude, locationLabel, timestamp, severity, severityScore,
      priority, ttl, hopCount, status, injuryStatus, victimCount, firePresent,
      floodSeverity, medicalUrgency, trappedPersonStatus, reportedDangerLevel,
      description, recommendedResponse, aiConfidence, modelSource,
      encryptedPayload, routingProtocol, syncedAt, assignedTeamId, assignedTeamName, dispatchNotes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    String(payload.userId || 'usr-anonymous'),
    String(payload.reporterName || 'Field Survivor'),
    emergencyType,
    emergencyCategory,
    latitude,
    longitude,
    String(payload.locationLabel || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`),
    timestamp,
    ai.priority,
    ai.severityScore,
    ai.priorityNumeric,
    Number(payload.ttl ?? 10),
    Number(payload.hopCount ?? 0),
    status,
    payload.injuryStatus ? 1 : 0,
    Math.max(1, Number(payload.victimCount ?? 1)),
    payload.firePresent ? 1 : 0,
    Number(payload.floodSeverity ?? 0),
    Number(payload.medicalUrgency ?? 0),
    payload.trappedPersonStatus ? 1 : 0,
    Number(payload.reportedDangerLevel ?? 3),
    String(payload.description || 'Emergency SOS alert received via RescueMesh.'),
    ai.recommendedResponseCategory,
    ai.confidence,
    ai.modelSource,
    String(payload.encryptedPayload || `AES256-GCM:${digest}`),
    routingProtocol,
    syncedAt,
    null,
    null,
    null
  );

  // Record relay hop trace if provided
  if (Array.isArray(payload.relayHops)) {
    const insertRelay = db.prepare(`
      INSERT OR IGNORE INTO relay_history (id, messageId, fromNode, toNode, transport, hopNumber, rssi, relayedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    payload.relayHops.forEach((hop: Record<string, unknown>, idx: number) => {
      insertRelay.run(
        `rel-${crypto.randomUUID().slice(0, 8)}`,
        messageId,
        String(hop.fromNode || 'Field Device'),
        String(hop.toNode || 'Rescue Gateway'),
        String(hop.transport || 'BLE'),
        Number(hop.hopNumber ?? idx + 1),
        Number(hop.rssi ?? -62),
        String(hop.relayedAt || syncedAt)
      );
    });
  }

  const created = db.prepare('SELECT * FROM emergencies WHERE messageId = ?').get(messageId) as Record<string, unknown>;
  return {
    duplicate: false,
    record: rowToEmergency(created),
  };
}

app.post('/api/emergency/create', (req, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      res.status(400).json({ error: 'Valid numeric latitude and longitude are required.' });
      return;
    }

    const result = insertOrDeduplicateEmergency(body, true);
    if (!result.duplicate) {
      io.emit('emergency:created', result.record);
    }

    res.status(result.duplicate ? 200 : 201).json({
      acknowledged: true,
      duplicate: result.duplicate,
      emergency: result.record,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create emergency', detail: (err as Error).message });
  }
});

app.post('/api/emergency/sync', (req, res) => {
  try {
    const items = Array.isArray(req.body?.emergencies) ? req.body.emergencies : [];
    const acks: Array<{ messageId: string; status: 'SYNCED' | 'DUPLICATE'; serverTimestamp: string }> = [];
    const createdRecords = [];

    for (const item of items) {
      const result = insertOrDeduplicateEmergency(item, true);
      acks.push({
        messageId: result.record.messageId,
        status: result.duplicate ? 'DUPLICATE' : 'SYNCED',
        serverTimestamp: new Date().toISOString(),
      });
      if (!result.duplicate) {
        createdRecords.push(result.record);
        io.emit('emergency:created', result.record);
      }
    }

    // Also sync queued mesh messages if provided
    const queuedMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const syncedMessageIds: string[] = [];
    const insertMsg = db.prepare(`
      INSERT OR IGNORE INTO mesh_messages (
        messageId, senderId, senderName, messageType, priorityRank, routingProtocol,
        payload, encryptedDigest, ttl, hopCount, createdAt, expiresAt, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const msg of queuedMessages) {
      const msgId = String(msg.messageId || `MSG-${crypto.randomUUID().slice(0, 8)}`);
      const mType = (['SOS', 'MEDICAL', 'LOCATION', 'CHAT'].includes(msg.messageType)
        ? msg.messageType
        : 'CHAT') as MeshMessageType;
      const rank = mType === 'SOS' ? 1 : mType === 'MEDICAL' ? 2 : mType === 'LOCATION' ? 3 : 4;
      const proto = mType === 'SOS' || mType === 'MEDICAL' ? 'EPIDEMIC' : 'PROPHET';
      insertMsg.run(
        msgId,
        String(msg.senderId || 'usr-field'),
        String(msg.senderName || 'Field User'),
        mType,
        rank,
        proto,
        String(msg.payload || ''),
        String(msg.encryptedDigest || `GCM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`),
        Number(msg.ttl ?? 8),
        Number(msg.hopCount ?? 1),
        String(msg.createdAt || new Date().toISOString()),
        String(msg.expiresAt || new Date(Date.now() + 6 * 3600000).toISOString())
      );
      syncedMessageIds.push(msgId);
    }
    if (syncedMessageIds.length > 0) {
      io.emit('messages:synced', { count: syncedMessageIds.length });
    }

    res.json({
      acknowledged: true,
      syncedCount: createdRecords.length,
      duplicateCount: acks.filter((a) => a.status === 'DUPLICATE').length,
      acknowledgements: acks,
      syncedMessageIds,
    });
  } catch (err) {
    res.status(500).json({ error: 'Offline batch sync failed', detail: (err as Error).message });
  }
});

app.get('/api/emergency', (req, res) => {
  const emergencies = listEmergencies({
    severity: req.query.severity ? String(req.query.severity) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  });
  res.json({ emergencies });
});

app.get('/api/emergency/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM emergencies WHERE messageId = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Emergency record not found' });
    return;
  }
  const dispatches = listDispatches(req.params.id);
  const relayHistory = listRelayHistory(req.params.id);
  res.json({
    emergency: rowToEmergency(row),
    dispatches,
    relayHistory,
  });
});

app.patch('/api/emergency/:id/status', requireAuth, requireRole('RESCUE_TEAM'), (req: AuthenticatedRequest, res) => {
  const { status, dispatchNotes } = req.body ?? {};
  const validStatuses: DeliveryStatus[] = [
    'RESCUE_TEAM_RECEIVED',
    'HELP_ASSIGNED',
    'IN_PROGRESS',
    'RESOLVED',
  ];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
    return;
  }

  const existing = db
    .prepare('SELECT * FROM emergencies WHERE messageId = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Emergency not found' });
    return;
  }

  db.prepare(`
    UPDATE emergencies SET status = ?, dispatchNotes = COALESCE(?, dispatchNotes)
    WHERE messageId = ?
  `).run(status, dispatchNotes ? String(dispatchNotes) : null, req.params.id);

  if (status === 'RESOLVED' && existing.assignedTeamId) {
    db.prepare(`UPDATE rescue_teams SET status = 'AVAILABLE', activeIncidentId = NULL WHERE id = ?`).run(
      existing.assignedTeamId
    );
  }

  const updated = rowToEmergency(
    db.prepare('SELECT * FROM emergencies WHERE messageId = ?').get(req.params.id) as Record<string, unknown>
  );
  io.emit('emergency:updated', updated);
  res.json({ emergency: updated });
});

// ---------------------------------------------------------------------------
// 4. DISPATCH & RESCUE TEAMS
// ---------------------------------------------------------------------------
app.get('/api/rescue-teams', (_req, res) => {
  res.json({ teams: listRescueTeams() });
});

app.post('/api/dispatch/assign', requireAuth, requireRole('RESCUE_TEAM'), (req: AuthenticatedRequest, res) => {
  const { emergencyId, teamId, notes } = req.body ?? {};
  if (!emergencyId || !teamId) {
    res.status(400).json({ error: 'emergencyId and teamId are required.' });
    return;
  }

  const emergency = db
    .prepare('SELECT * FROM emergencies WHERE messageId = ?')
    .get(emergencyId) as Record<string, unknown> | undefined;
  const team = db
    .prepare('SELECT * FROM rescue_teams WHERE id = ?')
    .get(teamId) as Record<string, unknown> | undefined;

  if (!emergency || !team) {
    res.status(404).json({ error: 'Emergency or Rescue Team not found.' });
    return;
  }

  const dispatchId = `DSP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const cleanNotes = String(notes || `Assigned ${team.name} (${team.callSign})`);

  db.prepare(`
    INSERT INTO dispatches (id, emergencyId, teamId, teamName, assignedBy, notes, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(dispatchId, emergencyId, teamId, String(team.name), req.user?.name || 'Commander', cleanNotes, 'HELP_ASSIGNED', createdAt);

  db.prepare(`
    UPDATE emergencies
    SET status = 'HELP_ASSIGNED', assignedTeamId = ?, assignedTeamName = ?, dispatchNotes = ?
    WHERE messageId = ?
  `).run(teamId, String(team.name), cleanNotes, emergencyId);

  db.prepare(`
    UPDATE rescue_teams
    SET status = 'DISPATCHED', activeIncidentId = ?
    WHERE id = ?
  `).run(emergencyId, teamId);

  const updatedEmergency = rowToEmergency(
    db.prepare('SELECT * FROM emergencies WHERE messageId = ?').get(emergencyId) as Record<string, unknown>
  );
  io.emit('emergency:updated', updatedEmergency);
  io.emit('dispatch:created', { dispatchId, emergencyId, teamId, teamName: team.name });

  res.status(201).json({
    dispatch: {
      id: dispatchId,
      emergencyId,
      teamId,
      teamName: team.name,
      assignedBy: req.user?.name || 'Commander',
      notes: cleanNotes,
      status: 'HELP_ASSIGNED',
      createdAt,
    },
    emergency: updatedEmergency,
  });
});

app.get('/api/dispatches', (_req, res) => {
  res.json({ dispatches: listDispatches() });
});

// ---------------------------------------------------------------------------
// 5. MESH MESSAGES & RELAY TELEMETRY
// ---------------------------------------------------------------------------
app.get('/api/messages', (_req, res) => {
  res.json({ messages: listMeshMessages() });
});

app.post('/api/messages', (req, res) => {
  const { senderId, senderName, messageType, payload, ttl, hopCount } = req.body ?? {};
  if (!payload || !String(payload).trim()) {
    res.status(400).json({ error: 'Message payload is required.' });
    return;
  }
  const mType = (['SOS', 'MEDICAL', 'LOCATION', 'CHAT'].includes(messageType)
    ? messageType
    : 'CHAT') as MeshMessageType;
  const priorityRank = mType === 'SOS' ? 1 : mType === 'MEDICAL' ? 2 : mType === 'LOCATION' ? 3 : 4;
  const routingProtocol = mType === 'SOS' || mType === 'MEDICAL' ? 'EPIDEMIC' : 'PROPHET';
  const messageId = `MSG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 6 * 3600000).toISOString();
  const encryptedDigest = `GCM-${crypto.createHash('sha256').update(String(payload)).digest('hex').slice(0, 12).toUpperCase()}`;

  db.prepare(`
    INSERT INTO mesh_messages (
      messageId, senderId, senderName, messageType, priorityRank, routingProtocol,
      payload, encryptedDigest, ttl, hopCount, createdAt, expiresAt, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    messageId,
    String(senderId || 'usr-field'),
    String(senderName || 'Field Device'),
    mType,
    priorityRank,
    routingProtocol,
    String(payload).trim(),
    encryptedDigest,
    Number(ttl ?? 8),
    Number(hopCount ?? 0),
    createdAt,
    expiresAt
  );

  const created = {
    messageId,
    senderId: String(senderId || 'usr-field'),
    senderName: String(senderName || 'Field Device'),
    messageType: mType,
    priorityRank,
    routingProtocol,
    payload: String(payload).trim(),
    encryptedDigest,
    ttl: Number(ttl ?? 8),
    hopCount: Number(hopCount ?? 0),
    createdAt,
    expiresAt,
    synced: true,
  };
  io.emit('message:created', created);
  res.status(201).json({ message: created });
});

app.get('/api/relay-history', (_req, res) => {
  res.json({ relayHistory: listRelayHistory() });
});

// ---------------------------------------------------------------------------
// 6. ANALYTICS
// ---------------------------------------------------------------------------
app.get('/api/analytics', (_req, res) => {
  const emergencies = listEmergencies();
  const teams = listRescueTeams();
  const relayHistory = listRelayHistory();
  const aiSummary = getModelEvaluationSummary();

  const totalSos = emergencies.length;
  const criticalCount = emergencies.filter((e) => e.severity === 'CRITICAL').length;
  const pendingCount = emergencies.filter((e) =>
    ['SOS_CREATED', 'STORED_LOCALLY', 'NEARBY_DEVICE_RECEIVED', 'FORWARDED', 'RESCUE_TEAM_RECEIVED'].includes(e.status)
  ).length;
  const activeCount = emergencies.filter((e) => ['HELP_ASSIGNED', 'IN_PROGRESS'].includes(e.status)).length;
  const resolvedCount = emergencies.filter((e) => e.status === 'RESOLVED').length;

  const bySeverity = {
    CRITICAL: emergencies.filter((e) => e.severity === 'CRITICAL').length,
    HIGH: emergencies.filter((e) => e.severity === 'HIGH').length,
    MEDIUM: emergencies.filter((e) => e.severity === 'MEDIUM').length,
    LOW: emergencies.filter((e) => e.severity === 'LOW').length,
  };

  const byCategory: Record<string, number> = {};
  for (const e of emergencies) {
    byCategory[e.emergencyCategory] = (byCategory[e.emergencyCategory] || 0) + 1;
  }

  const totalVictimsAffected = emergencies.reduce((sum, e) => sum + e.victimCount, 0);
  const averageHops =
    totalSos > 0
      ? Number((emergencies.reduce((sum, e) => sum + e.hopCount, 0) / totalSos).toFixed(2))
      : 0;

  res.json({
    summary: {
      totalSos,
      criticalCount,
      pendingCount,
      activeCount,
      resolvedCount,
      totalVictimsAffected,
      averageHops,
      availableTeams: teams.filter((t) => t.status === 'AVAILABLE').length,
      totalTeams: teams.length,
      totalRelayEvents: relayHistory.length,
    },
    bySeverity,
    byCategory,
    aiModel: aiSummary,
  });
});

// Socket.IO connection
io.on('connection', (socket) => {
  socket.emit('sync:welcome', {
    serverTime: new Date().toISOString(),
    message: 'Connected to RescueMesh AI Real-Time Coordination Channel',
  });
});

// ---------------------------------------------------------------------------
// VITE MIDDLEWARE (DEV) OR STATIC SERVE (PROD)
// ---------------------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`RescueMesh AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
