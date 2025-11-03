cd backend
npm init -y
npm install express cors dotenv

// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_TOKEN = process.env.SECRET_TOKEN || '';

app.use(cors());
app.use(express.json());

// In-memory storage for VC lists
// Structure: { guildId: { guildName, updated, channels: { channelName: [members...] } } }
const VCLISTS = {};

// SSE clients
const sseClients = new Set();

function sendSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

// Endpoint for bot to POST updates
app.post('/api/update-vc', (req, res) => {
  const secret = req.header('x-tracker-secret') || '';
  if (SECRET_TOKEN && secret !== SECRET_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const body = req.body;
  if (!body || !body.guildId) return res.status(400).end();

  VCLISTS[body.guildId] = {
    guildId: body.guildId,
    guildName: body.guildName || '',
    channels: body.channels || {},
    updated: Date.now()
  };

  // Broadcast to SSE clients
  sendSSE({ type: 'vc-update', payload: VCLISTS[body.guildId] });

  res.json({ ok: true });
});

// Snapshot GET endpoint
app.get('/api/vc-list', (req, res) => {
  res.json(VCLISTS);
});

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // send initial full state
  res.write(`data: ${JSON.stringify({ type: 'init', payload: VCLISTS })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
