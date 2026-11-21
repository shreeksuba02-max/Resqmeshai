const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, required: true },
  role: { type: String, enum: ['SURVIVOR', 'RELAY_NODE', 'RESCUE_TEAM'], default: 'SURVIVOR' },
  deviceId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const EmergencySchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true },
  emergencyType: { type: String, default: 'SOS' },
  emergencyCategory: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  severity: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], required: true },
  severityScore: { type: Number, min: 0, max: 100, required: true },
  priority: { type: Number, min: 1, max: 4, required: true },
  ttl: { type: Number, default: 10 },
  hopCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: [
      'SOS_CREATED',
      'STORED_LOCALLY',
      'NEARBY_DEVICE_RECEIVED',
      'FORWARDED',
      'RESCUE_TEAM_RECEIVED',
      'HELP_ASSIGNED',
      'IN_PROGRESS',
      'RESOLVED',
    ],
    default: 'RESCUE_TEAM_RECEIVED',
  },
  description: { type: String, default: '' },
  assignedTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'RescueTeam', default: null },
  dispatchNotes: { type: String, default: '' },
  syncedAt: { type: Date, default: Date.now },
});

const RescueTeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  callSign: { type: String, required: true, unique: true },
  specialty: { type: String, required: true },
  status: { type: String, enum: ['AVAILABLE', 'DISPATCHED', 'ON_SCENE'], default: 'AVAILABLE' },
});

const DispatchSchema = new mongoose.Schema({
  emergencyId: { type: String, required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'RescueTeam', required: true },
  assignedBy: { type: String, required: true },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  Emergency: mongoose.model('Emergency', EmergencySchema),
  RescueTeam: mongoose.model('RescueTeam', RescueTeamSchema),
  Dispatch: mongoose.model('Dispatch', DispatchSchema),
};
