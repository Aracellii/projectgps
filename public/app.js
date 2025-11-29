const map = L.map('map').setView([0, 0], 2);
const storedLocationsLayer = L.layerGroup().addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let currentMarker;

// Supabase setup (expects window.SUPABASE_URL and window.SUPABASE_ANON_KEY provided in HTML)
async function loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

let sbClient = null;
async function getSupabase(){
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (sbClient) return sbClient;
  if (!window.supabase) {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
  }
  sbClient = window.supabase.createClient(url, key);
  return sbClient;
}

// Auth state
let currentUser = null;
const sessionCard = document.getElementById('sessionCard');
const shareForm = document.getElementById('shareForm');
const userEmailEl = document.getElementById('userEmail');
const isShareView = /^\/share\//.test(window.location.pathname);
const locationsStatusEl = document.getElementById('locationsStatus');
const refreshLocationsBtn = document.getElementById('refreshLocations');

function updateSessionUI(){
  if (!sessionCard || !shareForm) return;
  if (currentUser) {
    sessionCard.style.display = 'block';
    if (!isShareView) shareForm.style.display = 'block';
    if (userEmailEl) {
      userEmailEl.textContent = currentUser.email || currentUser.user_metadata?.name || 'Pengguna';
    }
  } else {
    sessionCard.style.display = 'none';
    if (!isShareView) shareForm.style.display = 'none';
  }
}

async function ensureAuthenticated(){
  const sb = await getSupabase();
  if (!sb) return;
  try {
    const { data, error } = await sb.auth.getUser();
    if (error) {
      console.error('Auth error:', error);
    }
    currentUser = data?.user || null;
  } catch (err) {
    console.error('Failed to check auth:', err);
    currentUser = null;
  }
  if (!currentUser && !isShareView) {
    const redirectTarget = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `auth.html?redirect=${redirectTarget}`;
    return;
  }
  updateSessionUI();
  if (currentUser) {
    loadStoredLocations({ centerLatest: true, silent: true });
  } else {
    clearStoredLocations();
  }
}

async function logout(){
  const sb = await getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  currentUser = null;
  updateSessionUI();
  window.location.href = 'auth.html';
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', logout);
}

if (refreshLocationsBtn) {
  refreshLocationsBtn.addEventListener('click', () => loadStoredLocations({ force: true }));
}

// Init auth check
ensureAuthenticated();

function showMarker(lat, lng, label) {
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lng]).addTo(map);
  if (label) currentMarker.bindPopup(label).openPopup();
  map.setView([lat, lng], 15);
}

function fmt(ts) {
  if (!ts) return 'tidak ada';
  const d = new Date(ts);
  return d.toLocaleString();
}

async function shareCurrentLocation() {
  if (!currentUser) {
    await ensureAuthenticated();
    if (!currentUser) {
      alert('Harus login dulu!');
      return;
    }
  }
  const resultEl = document.getElementById('result');
  const ttlInput = document.getElementById('ttl');
  const ttlMinutes = ttlInput.value ? Number(ttlInput.value) : undefined;
  resultEl.textContent = 'Mencari lokasi...';
  if (!navigator.geolocation) {
    resultEl.textContent = 'Geolocation tidak didukung browser.';
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    const altitude = pos.coords.altitude;
    const altitudeAccuracy = pos.coords.altitudeAccuracy;
    showMarker(lat, lng, 'Lokasi Anda');
    // Tampilkan detail koordinat di panel hasil
    const details = [
      `Latitude: ${lat.toFixed(6)}`,
      `Longitude: ${lng.toFixed(6)}`,
      `Akurasi: ${typeof accuracy === 'number' ? accuracy.toFixed(1) + ' m' : 'n/a'}`,
      `Altitude: ${typeof altitude === 'number' ? altitude.toFixed(1) + ' m' : 'n/a'}`,
      `Altitude Accuracy: ${typeof altitudeAccuracy === 'number' ? altitudeAccuracy.toFixed(1) + ' m' : 'n/a'}`
    ].join(' | ');
    resultEl.innerHTML = `<div class="small">${details}</div><br/><div class="small"></div>`;

    // Try Supabase first: insert into locations
    try {
      const sb = await getSupabase();
      if (sb) {
        const payload = {
          user_id: currentUser.id,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
        };
        const { data: inserted, error } = await sb.from('locations').insert(payload).select().single();
        if (error) throw error;
        resultEl.innerHTML = `<div class="small">${details}</div><br/><div class="small" style="color: green;">Lokasi tersimpan di Supabase (id: ${inserted.id}).</div>`;
        loadStoredLocations({ centerLatest: true });
        return;
      }
    } catch (e) {
      console.error('Supabase insert failed:', e);
      resultEl.innerHTML = `<div class="small">${details}</div><br/><div class="small" style="color: red;">Gagal simpan ke Supabase: ${e.message}. Fallback ke API lokal...</div>`;
    }

    // Fallback to local Express API for share link behavior
    try {
      const resp = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, label: 'Lokasi saya', ttlMinutes })
      });
      const data = await resp.json();
      if (data.url) {
        resultEl.innerHTML = `<div class="small">${details}</div><br/><div class="small" style="color: blue;">URL dibagikan: <a href="${data.url}" target="_blank">${data.url}</a><br/>Kadaluarsa: ${fmt(data.expiresAt)}</div>`;
      } else {
        resultEl.innerHTML = `<div class="small">${details}</div><br/><div class="small" style="color: red;">Error: ${JSON.stringify(data)}</div>`;
      }
    } catch (e) {
      resultEl.innerHTML = `<div class="small">${details}</div><br/><div class="small" style="color: red;">Gagal membuat share: ${e.message}</div>`;
    }
  }, (err) => {
    resultEl.textContent = 'Gagal mendapatkan lokasi: ' + err.message;
  }, { enableHighAccuracy: true, timeout: 10000 });
}

document.getElementById('shareBtn').addEventListener('click', shareCurrentLocation);

function setLocationsStatus(message, isError = false) {
  if (!locationsStatusEl) return;
  locationsStatusEl.textContent = message || '';
  locationsStatusEl.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function clearStoredLocations() {
  storedLocationsLayer.clearLayers();
  setLocationsStatus('');
}

async function loadStoredLocations({ centerLatest = false, silent = false, force = false } = {}) {
  if (!currentUser || !shareForm) return;
  const sb = await getSupabase();
  if (!sb) return;
  if (!silent) setLocationsStatus('Memuat titik...');
  try {
    const { data, error } = await sb
      .from('locations')
      .select('id, user_id, latitude, longitude, accuracy, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    console.log('locations fetched:', data);
    renderStoredLocations(data || [], { centerLatest });
    const label = data && data.length ? `${data.length} titik` : 'Belum ada data';
    setLocationsStatus(`${label} • ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('Gagal memuat titik:', err);
    setLocationsStatus('Gagal memuat titik', true);
    if (force) alert('Gagal memuat titik: ' + err.message);
  }
}

function renderStoredLocations(rows, { centerLatest = false } = {}) {
  storedLocationsLayer.clearLayers();
  const bounds = [];
  rows.forEach((row, index) => {
    if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') return;
    const owner = row.user_id ? `Pemilik: ${row.user_id}` : null;
    const popupParts = [
      `ID: ${row.id}`,
      owner,
      `Latitude: ${row.latitude.toFixed(5)}`,
      `Longitude: ${row.longitude.toFixed(5)}`,
      `Akurasi: ${row.accuracy ?? 'n/a'}`,
      `Disimpan: ${fmt(row.created_at)}`
    ].filter(Boolean);
    const popup = popupParts.join('<br/>');
    const marker = L.marker([row.latitude, row.longitude]).bindPopup(popup);
    storedLocationsLayer.addLayer(marker);
    bounds.push([row.latitude, row.longitude]);
    if (centerLatest && index === 0) {
      map.setView([row.latitude, row.longitude], 14);
    }
  });
  if (bounds.length > 1 && !centerLatest) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }
}

async function tryLoadShareFromPath() {
  const path = window.location.pathname;
  const match = path.match(/^\/share\/(.+)$/);
  if (!match) return;
  const id = match[1];
  document.getElementById('shareForm').style.display = 'none';
  document.getElementById('viewInfo').style.display = 'block';
  try {
    const resp = await fetch('/api/share/' + id);
    if (!resp.ok) throw new Error('Not found or expired');
    const data = await resp.json();
    showMarker(data.lat, data.lng, data.label || ('Shared: ' + data.id));
    document.getElementById('expiryInfo').textContent = 'Kadaluarsa: ' + fmt(data.expiresAt);
  } catch (e) {
    document.getElementById('viewInfo').textContent = 'Lokasi tidak ditemukan atau sudah kadaluarsa.';
  }
}

tryLoadShareFromPath();
