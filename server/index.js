const express = require('express');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// In-memory store for shared locations
const store = new Map();

// Serve static frontend
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// API: create a share
app.post('/api/share', (req, res) => {
  const { lat, lng, label, ttlMinutes } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng must be numbers' });
  }

  const id = uuidv4();
  const createdAt = Date.now();
  let expiresAt = null;
  if (typeof ttlMinutes === 'number' && ttlMinutes > 0) {
    expiresAt = createdAt + ttlMinutes * 60 * 1000;
  }
  store.set(id, { id, lat, lng, label: label || '', createdAt, expiresAt });

  const url = `${req.protocol}://${req.get('host')}/share/${id}`;
  res.json({ id, url, expiresAt });
});

// API: get share by id
app.get('/api/share/:id', (req, res) => {
  const id = req.params.id;
  const item = store.get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (item.expiresAt && Date.now() > item.expiresAt) {
    store.delete(id);
    return res.status(410).json({ error: 'Expired' });
  }
  res.json(item);
});

// Fallback to frontend for share pages
app.get('/share/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Location-share server listening on http://localhost:${PORT}`);
});
