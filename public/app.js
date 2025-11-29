const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let currentMarker;

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
    showMarker(lat, lng, 'Lokasi Anda');

    const resp = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, label: 'Lokasi saya', ttlMinutes })
    });
    const data = await resp.json();
    if (data.url) {
      resultEl.innerHTML = `URL dibagikan: <a href="${data.url}" target="_blank">${data.url}</a><br/>Kadaluarsa: ${fmt(data.expiresAt)}`;
    } else {
      resultEl.textContent = JSON.stringify(data);
    }
  }, (err) => {
    resultEl.textContent = 'Gagal mendapatkan lokasi: ' + err.message;
  }, { enableHighAccuracy: true, timeout: 10000 });
}

document.getElementById('shareBtn').addEventListener('click', shareCurrentLocation);

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
