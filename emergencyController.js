const { Emergency, Dispatch, RescueTeam } = require('../models/Models');

exports.createEmergency = async (req, res) => {
  try {
    const existing = await Emergency.findOne({ messageId: req.body.messageId });
    if (existing) {
      return res.status(200).json({ acknowledged: true, duplicate: true, emergency: existing });
    }
    const created = await Emergency.create({ ...req.body, status: 'RESCUE_TEAM_RECEIVED' });
    req.app.get('io').emit('emergency:created', created);
    return res.status(201).json({ acknowledged: true, duplicate: false, emergency: created });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.syncBatch = async (req, res) => {
  const items = Array.isArray(req.body.emergencies) ? req.body.emergencies : [];
  const acknowledgements = [];
  for (const item of items) {
    const existing = await Emergency.findOne({ messageId: item.messageId });
    if (existing) {
      acknowledgements.push({ messageId: item.messageId, status: 'DUPLICATE' });
    } else {
      const created = await Emergency.create({ ...item, status: 'RESCUE_TEAM_RECEIVED' });
      req.app.get('io').emit('emergency:created', created);
      acknowledgements.push({ messageId: item.messageId, status: 'SYNCED' });
    }
  }
  return res.json({ acknowledged: true, acknowledgements });
};

exports.listEmergencies = async (_req, res) => {
  const emergencies = await Emergency.find().sort({ priority: 1, severityScore: -1, timestamp: -1 });
  return res.json({ emergencies });
};

exports.assignDispatch = async (req, res) => {
  const { emergencyId, teamId, notes } = req.body;
  const team = await RescueTeam.findById(teamId);
  if (!team) return res.status(404).json({ error: 'Rescue team not found' });

  const dispatch = await Dispatch.create({
    emergencyId,
    teamId,
    assignedBy: req.user.name,
    notes,
  });
  const emergency = await Emergency.findOneAndUpdate(
    { messageId: emergencyId },
    { status: 'HELP_ASSIGNED', assignedTeamId: teamId, dispatchNotes: notes },
    { new: true }
  );
  req.app.get('io').emit('emergency:updated', emergency);
  return res.status(201).json({ dispatch, emergency });
};
