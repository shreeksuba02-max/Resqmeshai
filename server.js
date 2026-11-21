const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
require('dotenv').config();

const ctrl = require('./controllers/emergencyController');
const { requireAuth, requireRole } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

app.use(cors());
app.use(express.json());

app.post('/api/emergency/create', ctrl.createEmergency);
app.post('/api/emergency/sync', ctrl.syncBatch);
app.get('/api/emergency', ctrl.listEmergencies);
app.post('/api/dispatch/assign', requireAuth, requireRole('RESCUE_TEAM'), ctrl.assignDispatch);

const port = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI).then(() => {
  server.listen(port, () => console.log(`RescueMesh MongoDB API running on port ${port}`));
});
