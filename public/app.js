// ═══════════════════════════════════════════════════
// Bilcoguard Fuel Delivery — Full Working Frontend
// ═══════════════════════════════════════════════════

const API = '/api';
let token = localStorage.getItem('bg_token') || null;
let currentUser = null;
let ws = null;
let activeTab = 'home';
let trackingInterval = null;

// ─── Branded Vehicle Icon System ─────────────────────
// Returns an inline SVG string for the given vehicle type key.
// size = pixel dimension of the square icon
function vehicleIcon(type, size = 28, color = '#2E3192') {
  const paths = {
    sedan: `<path d="M5 16h1a2 2 0 1 0 4 0h4a2 2 0 1 0 4 0h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-.2-.6l-2.3-3.1A2 2 0 0 0 16 7H8a2 2 0 0 0-1.5.7L4.2 11a1 1 0 0 0-.2.6V15a1 1 0 0 0 1 1z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="16" r="1.5" fill="${color}"/><circle cx="16" cy="16" r="1.5" fill="${color}"/><path d="M6.5 11h11" stroke="${color}" stroke-width="1" opacity="0.4"/>`,
    suv: `<path d="M4 16h1a2 2 0 1 0 4 0h6a2 2 0 1 0 4 0h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-.3-.7l-2.2-2.5A2 2 0 0 0 17 7H7a2 2 0 0 0-1.5.8L3.3 10.3A1 1 0 0 0 3 11v4a1 1 0 0 0 1 1z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="16" r="1.5" fill="${color}"/><circle cx="17" cy="16" r="1.5" fill="${color}"/><rect x="6" y="9" width="12" height="3" rx="1" fill="${color}" opacity="0.12"/>`,
    pickup: `<path d="M3 15h1a2 2 0 1 0 4 0h8a2 2 0 1 0 4 0h1v-3l-2-3h-4V6H6a1 1 0 0 0-1 1v2H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="15" r="1.5" fill="${color}"/><circle cx="18" cy="15" r="1.5" fill="${color}"/><path d="M15 6v6" stroke="${color}" stroke-width="1" opacity="0.3"/>`,
    van: `<path d="M4 16h1a2 2 0 1 0 4 0h6a2 2 0 1 0 4 0h1a1 1 0 0 0 1-1V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a1 1 0 0 0 1 1z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="16" r="1.5" fill="${color}"/><circle cx="17" cy="16" r="1.5" fill="${color}"/><path d="M14 6v10" stroke="${color}" stroke-width="1" opacity="0.25"/><rect x="15" y="8" width="4" height="4" rx="1" fill="${color}" opacity="0.12"/>`,
    truck: `<path d="M3 15h1a2 2 0 1 0 4 0h4a2 2 0 1 0 4 0h2a2 2 0 1 0 0 0h1V8a1 1 0 0 0-1-1h-4l-2-3H7a2 2 0 0 0-2 2v2H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="15" r="1.5" fill="${color}"/><circle cx="14" cy="15" r="1.5" fill="${color}"/><circle cx="18" cy="15" r="1.5" fill="${color}"/><rect x="3" y="7" width="9" height="5" rx="1" fill="${color}" opacity="0.08"/>`,
    heavy: `<path d="M2 14h1a2 2 0 1 0 4 0h2a2 2 0 1 0 4 0h2a2 2 0 1 0 4 0h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v1H2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="14" r="1.5" fill="${color}"/><circle cx="11" cy="14" r="1.5" fill="${color}"/><circle cx="17" cy="14" r="1.5" fill="${color}"/><rect x="4" y="6" width="14" height="4" rx="1" fill="${color}" opacity="0.1"/>`,
  };
  const svgInner = paths[type] || paths['sedan'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 20" fill="none">${svgInner}</svg>`;
}

// Returns a styled container div with the vehicle icon inside (for cards etc)
function vehicleIconBox(type, boxSize = 52) {
  const iconSize = Math.round(boxSize * 0.55);
  return `<div style="width:${boxSize}px;height:${boxSize}px;border-radius:${Math.round(boxSize*0.27)}px;background:linear-gradient(135deg,rgba(46,49,146,0.06),rgba(0,191,255,0.10));display:flex;align-items:center;justify-content:center;">${vehicleIcon(type, iconSize)}</div>`;
}

// Maps legacy emoji icons to new type keys
function normalizeVehicleIcon(icon) {
  if (!icon) return 'sedan';
  const map = { '🚗': 'sedan', '🚙': 'suv', '🛻': 'pickup', '🚐': 'van', '🚛': 'truck', '🚜': 'heavy' };
  return map[icon] || (['sedan','suv','pickup','van','truck','heavy'].includes(icon) ? icon : 'sedan');
}

// Branded tanker icon for delivery tracking
function tankerIcon(size = 28, color = '#00BFFF') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 20">
    <ellipse cx="12" cy="9" rx="8" ry="5" fill="${color}" opacity="0.15"/>
    <rect x="5" y="5" width="14" height="9" rx="4.5" fill="none" stroke="${color}" stroke-width="1.5"/>
    <rect x="3" y="8" width="3" height="4" rx="1" fill="none" stroke="${color}" stroke-width="1.2"/>
    <circle cx="7" cy="16" r="1.5" fill="${color}"/><circle cx="17" cy="16" r="1.5" fill="${color}"/>
    <path d="M4 14h16" stroke="${color}" stroke-width="1" opacity="0.3"/>
  </svg>`;
}

// ─── API Helper ──────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API}${path}`, { ...opts, headers });
    const data = await res.json();
    if (res.status === 401) { logout(); return null; }
    if (!res.ok) { showToast(data.error || 'Something went wrong', 'error'); return null; }
    return data;
  } catch (e) {
    showToast('Network error — check connection', 'error');
    return null;
  }
}

// ─── Auth ────────────────────────────────────────────
async function login(email, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('bg_token', token);
    connectWebSocket();
    navigateTo('home');
    showToast(`Welcome back, ${currentUser.name}!`);
  }
}

async function register(name, email, password, phone) {
  const data = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, phone })
  });
  if (data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('bg_token', token);
    connectWebSocket();
    navigateTo('home');
    showToast('Account created successfully!');
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('bg_token');
  if (ws) ws.close();
  renderLogin();
}

async function checkAuth() {
  if (!token) { renderLogin(); return; }
  const data = await api('/auth/me');
  if (data) {
    currentUser = data.user;
    connectWebSocket();
    navigateTo('home');
  } else {
    renderLogin();
  }
}

// ─── WebSocket ───────────────────────────────────────
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}/ws`);
  ws.onopen = () => { ws.send(JSON.stringify({ type: 'auth', token })); };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'tracking_update' && activeTab === 'tracking') {
      updateTrackingUI(msg);
    }
  };
  ws.onclose = () => { setTimeout(connectWebSocket, 3000); };
}

// ─── Navigation ──────────────────────────────────────
function navigateTo(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-item').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  renderScreen(tab);
}

document.getElementById('tabBar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab-item');
  if (tab) navigateTo(tab.dataset.tab);
});

// ─── Toast ───────────────────────────────────────────
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  if (type === 'error') toast.style.background = '#e74c3c';
  if (type === 'success') toast.style.background = '#2ecc71';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── Render Screens ──────────────────────────────────
function renderScreen(tab) {
  const app = document.getElementById('app');
  switch (tab) {
    case 'home': renderHome(app); break;
    case 'schedule': renderSchedule(app); break;
    case 'vehicles': renderVehicles(app); break;
    case 'tracking': renderTracking(app); break;
    case 'profile': renderProfile(app); break;
  }
}

// ─── LOGIN SCREEN ────────────────────────────────────
function renderLogin() {
  document.getElementById('tabBar').style.display = 'none';
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="screen active" style="background: var(--royal);">
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px;">
        <div style="width:80px; height:80px; border-radius:20px; background:rgba(0,191,255,0.15); display:flex; align-items:center; justify-content:center; margin-bottom:20px;">
          <span style="font-size:40px;">⛽</span>
        </div>
        <h1 style="color:#fff; font-size:24px; font-weight:700; margin-bottom:4px;">Bilcoguard Fuel</h1>
        <p style="color:rgba(255,255,255,0.6); font-size:13px; margin-bottom:32px;">Fuel delivery at your fingertips</p>

        <div id="loginForm" style="width:100%;">
          <div class="input-group">
            <label style="color:rgba(255,255,255,0.7);">Email</label>
            <input type="email" id="loginEmail" value="peter@bilcoguard.com" placeholder="your@email.com" style="background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:#fff;">
          </div>
          <div class="input-group">
            <label style="color:rgba(255,255,255,0.7);">Password</label>
            <input type="password" id="loginPass" value="bilcoguard2026" placeholder="••••••••" style="background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:#fff;">
          </div>
          <button class="btn btn-primary btn-full" onclick="doLogin()" style="margin-top:8px;">Sign In</button>
          <p style="color:rgba(255,255,255,0.5); font-size:12px; text-align:center; margin-top:16px;">
            Don't have an account? <a href="#" onclick="showRegister()" style="color:var(--sky);">Sign Up</a>
          </p>
        </div>

        <div id="registerForm" style="width:100%; display:none;">
          <div class="input-group">
            <label style="color:rgba(255,255,255,0.7);">Full Name</label>
            <input type="text" id="regName" placeholder="Peter Ndhlovu" style="background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:#fff;">
          </div>
          <div class="input-group">
            <label style="color:rgba(255,255,255,0.7);">Email</label>
            <input type="email" id="regEmail" placeholder="your@email.com" style="background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:#fff;">
          </div>
          <div class="input-group">
            <label style="color:rgba(255,255,255,0.7);">Phone</label>
            <input type="tel" id="regPhone" placeholder="+260..." style="background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:#fff;">
          </div>
          <div class="input-group">
            <label style="color:rgba(255,255,255,0.7);">Password</label>
            <input type="password" id="regPass" placeholder="••••••••" style="background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:#fff;">
          </div>
          <button class="btn btn-primary btn-full" onclick="doRegister()" style="margin-top:8px;">Create Account</button>
          <p style="color:rgba(255,255,255,0.5); font-size:12px; text-align:center; margin-top:16px;">
            Already have an account? <a href="#" onclick="showLogin()" style="color:var(--sky);">Sign In</a>
          </p>
        </div>

        <p style="color:rgba(255,255,255,0.3); font-size:10px; margin-top:24px;">Bilcoguard Fuel Delivery v2.1.0</p>
      </div>
    </div>
  `;
}

function showRegister() { document.getElementById('loginForm').style.display = 'none'; document.getElementById('registerForm').style.display = 'block'; }
function showLogin() { document.getElementById('loginForm').style.display = 'block'; document.getElementById('registerForm').style.display = 'none'; }
function doLogin() { login(document.getElementById('loginEmail').value, document.getElementById('loginPass').value); }
function doRegister() { register(document.getElementById('regName').value, document.getElementById('regEmail').value, document.getElementById('regPass').value, document.getElementById('regPhone').value); }

// ─── HOME SCREEN ─────────────────────────────────────
async function renderHome(app) {
  document.getElementById('tabBar').style.display = 'flex';
  app.innerHTML = `<div class="screen active"><div class="spinner"></div></div>`;

  const data = await api('/dashboard');
  if (!data) return;

  const activeOrders = await api('/orders/active');
  const activeOrder = activeOrders && activeOrders.length > 0 ? activeOrders[0] : null;

  app.innerHTML = `
    <div class="screen active">
      <div class="header-geo" style="min-height:160px; display:flex; flex-direction:column; justify-content:flex-end;">
        <div class="bg"></div>
        <div class="content">
          <p style="color:rgba(255,255,255,0.7); font-size:13px;">Welcome back,</p>
          <h1 style="color:#fff; font-size:26px; font-weight:700; margin:4px 0 4px;">${currentUser.name}</h1>
          <p style="color:var(--sky); font-size:13px; font-weight:500;">Bilcoguard Fuel Delivery</p>
        </div>
      </div>

      <div class="scroll-content animate-in">
        ${activeOrder ? `
        <div class="card dark" style="margin-bottom:16px; cursor:pointer;" onclick="navigateTo('tracking')">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="color:var(--sky); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1px;">Active Delivery</p>
              <p style="color:#fff; font-size:16px; font-weight:700; margin:4px 0 2px;">${activeOrder.fuel_type} — ${activeOrder.volume}L</p>
              <p style="color:rgba(255,255,255,0.6); font-size:12px;">ETA: ${activeOrder.eta_minutes || '—'} minutes</p>
            </div>
            <div style="width:52px; height:52px; border-radius:26px; background:rgba(0,191,255,0.15); display:flex; align-items:center; justify-content:center;">
              ${tankerIcon(30, '#00BFFF')}
            </div>
          </div>
          <div style="margin-top:12px; background:rgba(255,255,255,0.1); border-radius:8px; height:6px; overflow:hidden;">
            <div style="width:${activeOrder.progress}%; height:100%; background:var(--sky); border-radius:8px; transition:width 1s;"></div>
          </div>
        </div>
        ` : ''}

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
          ${[
            { svg: tankerIcon(32,'#2E3192'), label: 'Order Fuel', desc: 'Get fuel delivered', tab: 'schedule' },
            { svg: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2E3192" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" stroke-linecap="round"/></svg>', label: 'Schedule', desc: 'Plan ahead', tab: 'schedule' },
            { svg: vehicleIcon('suv', 32, '#2E3192'), label: 'Vehicles', desc: 'Manage fleet', tab: 'vehicles' },
            { svg: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2E3192" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#00BFFF" fill-opacity="0.3"/></svg>', label: 'Track', desc: 'Live status', tab: 'tracking' },
          ].map(a => `
            <div class="card" style="text-align:center; padding:20px 12px; cursor:pointer;" onclick="navigateTo('${a.tab}')">
              <div style="margin-bottom:8px; display:flex; justify-content:center;">${a.svg}</div>
              <p style="font-weight:600; font-size:14px; color:var(--royal); margin-bottom:2px;">${a.label}</p>
              <p style="font-size:11px; color:var(--grey);">${a.desc}</p>
            </div>
          `).join('')}
        </div>

        <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin-bottom:12px;">Current Fuel Prices</h3>
        <div style="display:flex; gap:10px; margin-bottom:20px;">
          ${data.fuel_prices.map(f => `
            <div style="flex:1; background:#fff; border-radius:12px; padding:14px 10px; text-align:center; box-shadow:0 1px 6px rgba(46,49,146,0.06);">
              <span style="font-size:20px;">${f.icon}</span>
              <p style="font-size:12px; font-weight:600; color:var(--royal); margin:6px 0 2px;">${f.fuel_type}</p>
              <p style="font-size:16px; font-weight:700; color:var(--sky);">K${f.price_per_litre.toFixed(2)}</p>
              <p style="font-size:9px; color:var(--grey); margin-top:2px;">per litre</p>
            </div>
          `).join('')}
        </div>

        <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin-bottom:12px;">Recent Orders</h3>
        ${data.recent_orders.map(o => `
          <div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="font-weight:600; font-size:14px; color:var(--royal);">${o.fuel_type} ${o.volume}L</p>
              <p style="font-size:12px; color:var(--grey);">${o.vehicle_name || 'Vehicle'} · ${new Date(o.delivery_date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</p>
            </div>
            <div style="text-align:right;">
              <p style="font-weight:700; font-size:14px; color:var(--royal);">K${o.total.toLocaleString()}</p>
              <span style="font-size:10px; font-weight:600; color:${o.status === 'delivered' ? 'var(--success)' : 'var(--sky)'}; background:${o.status === 'delivered' ? 'rgba(46,204,113,0.1)' : 'rgba(0,191,255,0.1)'}; padding:2px 8px; border-radius:10px;">${o.status}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── SCHEDULE SCREEN ─────────────────────────────────
let scheduleState = { step: 1, fuelType: 'diesel', volume: 100, vehicleId: null, locationId: null, date: 'today', time: '14:00' };

async function renderSchedule(app) {
  app.innerHTML = `<div class="screen active"><div class="spinner"></div></div>`;

  const [prices, vehicles, locations] = await Promise.all([
    api('/prices'),
    api('/vehicles'),
    api('/locations')
  ]);
  if (!prices || !vehicles || !locations) return;

  const s = scheduleState;
  const selFuel = prices.find(p => p.fuel_type === s.fuelType) || prices[0];
  const total = (selFuel.price_per_litre * s.volume).toFixed(2);

  const dates = ['today', 'tomorrow', new Date(Date.now() + 2*86400000).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })];
  const times = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];

  if (!s.vehicleId && vehicles.length > 0) s.vehicleId = vehicles[0].id;
  if (!s.locationId && locations.length > 0) s.locationId = locations[0].id;

  app.innerHTML = `
    <div class="screen active">
      <div class="header-geo">
        <div class="bg"></div>
        <div class="content">
          <h1 style="color:#fff; font-size:22px; font-weight:700;">Schedule Delivery</h1>
          <p style="color:rgba(255,255,255,0.7); font-size:13px;">Step ${s.step} of 3</p>
        </div>
      </div>
      <div class="scroll-content animate-in">
        <div style="display:flex; gap:6px; margin-bottom:20px;">
          ${[1,2,3].map(n => `<div style="flex:1; height:4px; border-radius:2px; background:${n <= s.step ? 'var(--sky)' : 'var(--off-white)'}; transition:background 0.3s;"></div>`).join('')}
        </div>

        ${s.step === 1 ? `
          <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin-bottom:12px;">Select Fuel Type</h3>
          ${prices.map(f => `
            <div class="card" style="margin-bottom:10px; display:flex; align-items:center; gap:14px; cursor:pointer; border:2px solid ${s.fuelType === f.fuel_type ? 'var(--sky)' : 'transparent'};" onclick="scheduleState.fuelType='${f.fuel_type}'; renderSchedule(document.getElementById('app'));">
              <span style="font-size:28px;">${f.icon}</span>
              <div style="flex:1;">
                <p style="font-weight:600; font-size:15px; color:var(--royal);">${f.fuel_type}</p>
                <p style="font-size:12px; color:var(--grey);">K${f.price_per_litre.toFixed(2)}/litre</p>
              </div>
              <div style="width:22px; height:22px; border-radius:11px; border:2px solid ${s.fuelType === f.fuel_type ? 'var(--sky)' : 'var(--grey)'}; display:flex; align-items:center; justify-content:center;">
                ${s.fuelType === f.fuel_type ? '<div style="width:12px; height:12px; border-radius:6px; background:var(--sky);"></div>' : ''}
              </div>
            </div>
          `).join('')}

          <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin:16px 0 12px;">Volume (Litres)</h3>
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:8px;">
            <button class="btn btn-outline" style="width:44px; height:44px; padding:0; border-radius:22px; font-size:20px;" onclick="scheduleState.volume=Math.max(20,scheduleState.volume-20); renderSchedule(document.getElementById('app'));">−</button>
            <div style="flex:1; text-align:center;">
              <span style="font-size:36px; font-weight:700; color:var(--royal);">${s.volume}</span>
              <span style="font-size:14px; color:var(--grey); margin-left:4px;">L</span>
            </div>
            <button class="btn btn-primary" style="width:44px; height:44px; padding:0; border-radius:22px; font-size:20px;" onclick="scheduleState.volume=Math.min(500,scheduleState.volume+20); renderSchedule(document.getElementById('app'));">+</button>
          </div>
          <input type="range" min="20" max="500" step="10" value="${s.volume}" oninput="scheduleState.volume=+this.value; document.getElementById('volDisplay').textContent=this.value; document.getElementById('totalDisplay').textContent='K'+(${selFuel.price_per_litre}*this.value).toLocaleString();" style="margin-bottom:16px;">

          <div class="card no-border" style="background:var(--off-white); margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--grey); font-size:13px;">Estimated Total</span>
              <span id="totalDisplay" style="color:var(--royal); font-size:18px; font-weight:700;">K${Number(total).toLocaleString()}</span>
            </div>
          </div>
          <button class="btn btn-primary btn-full" onclick="scheduleState.step=2; renderSchedule(document.getElementById('app'));">Continue</button>
        ` : s.step === 2 ? `
          <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin-bottom:12px;">Delivery Location</h3>
          ${locations.map(l => `
            <div class="card" style="margin-bottom:10px; display:flex; align-items:center; gap:12px; cursor:pointer; border:2px solid ${s.locationId === l.id ? 'var(--sky)' : 'transparent'};" onclick="scheduleState.locationId='${l.id}'; renderSchedule(document.getElementById('app'));">
              <div style="width:40px; height:40px; border-radius:10px; background:rgba(0,191,255,0.1); display:flex; align-items:center; justify-content:center;">
                <span style="font-size:20px;">📍</span>
              </div>
              <div style="flex:1;">
                <p style="font-weight:600; font-size:14px; color:var(--royal);">${l.name}</p>
                <p style="font-size:12px; color:var(--grey);">${l.address}</p>
              </div>
              <div style="width:22px; height:22px; border-radius:11px; border:2px solid ${s.locationId === l.id ? 'var(--sky)' : 'var(--grey)'}; display:flex; align-items:center; justify-content:center;">
                ${s.locationId === l.id ? '<div style="width:12px; height:12px; border-radius:6px; background:var(--sky);"></div>' : ''}
              </div>
            </div>
          `).join('')}

          <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin:16px 0 12px;">Select Vehicle</h3>
          ${vehicles.map(v => `
            <div class="card" style="margin-bottom:10px; display:flex; align-items:center; gap:12px; cursor:pointer; border:2px solid ${s.vehicleId === v.id ? 'var(--sky)' : 'transparent'};" onclick="scheduleState.vehicleId='${v.id}'; renderSchedule(document.getElementById('app'));">
              ${vehicleIconBox(normalizeVehicleIcon(v.icon), 42)}
              <div style="flex:1;">
                <p style="font-weight:600; font-size:14px; color:var(--royal);">${v.name} — ${v.plate}</p>
                <p style="font-size:12px; color:var(--grey);">${v.fuel_type} · ${v.tank_capacity}L tank</p>
              </div>
            </div>
          `).join('')}

          <div style="display:flex; gap:10px; margin-top:16px;">
            <button class="btn btn-outline btn-full" onclick="scheduleState.step=1; renderSchedule(document.getElementById('app'));">Back</button>
            <button class="btn btn-primary btn-full" onclick="scheduleState.step=3; renderSchedule(document.getElementById('app'));">Continue</button>
          </div>
        ` : `
          <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin-bottom:12px;">Delivery Time</h3>
          <div style="display:flex; gap:10px; margin-bottom:16px;">
            ${dates.map(d => `
              <button style="flex:1; padding:12px 8px; border-radius:12px; border:${s.date === d ? '2px solid var(--sky)' : '1px solid var(--off-white)'}; background:${s.date === d ? 'rgba(0,191,255,0.08)' : '#fff'}; cursor:pointer; font-family:Poppins; font-weight:600; font-size:13px; color:${s.date === d ? 'var(--sky)' : 'var(--royal)'}; text-transform:capitalize;" onclick="scheduleState.date='${d}'; renderSchedule(document.getElementById('app'));">${d}</button>
            `).join('')}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:20px;">
            ${times.map(t => `
              <button style="padding:10px; border-radius:10px; border:${s.time === t ? '2px solid var(--sky)' : '1px solid var(--off-white)'}; background:${s.time === t ? 'rgba(0,191,255,0.08)' : '#fff'}; cursor:pointer; font-family:Poppins; font-weight:${s.time === t ? '600' : '400'}; color:${s.time === t ? 'var(--sky)' : 'var(--grey)'}; font-size:14px;" onclick="scheduleState.time='${t}'; renderSchedule(document.getElementById('app'));">${t}</button>
            `).join('')}
          </div>

          <div class="card no-border" style="background:var(--off-white); margin-bottom:20px;">
            <h4 style="font-size:14px; font-weight:700; color:var(--royal); margin-bottom:10px;">Order Summary</h4>
            ${[
              ['Fuel', selFuel.fuel_type],
              ['Volume', s.volume + 'L'],
              ['Price/L', 'K' + selFuel.price_per_litre.toFixed(2)],
              ['Delivery', s.date + ' at ' + s.time],
            ].map(([k,v], i) => `
              <div style="display:flex; justify-content:space-between; padding:4px 0; ${i < 3 ? 'border-bottom:1px solid rgba(167,168,171,0.2);' : ''}">
                <span style="font-size:13px; color:var(--grey);">${k}</span>
                <span style="font-size:13px; font-weight:600; color:var(--royal);">${v}</span>
              </div>
            `).join('')}
            <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:10px; border-top:2px solid var(--sky);">
              <span style="font-size:15px; font-weight:700; color:var(--royal);">Total</span>
              <span style="font-size:18px; font-weight:700; color:var(--sky);">K${Number(total).toLocaleString()}</span>
            </div>
          </div>

          <div style="display:flex; gap:10px;">
            <button class="btn btn-outline btn-full" onclick="scheduleState.step=2; renderSchedule(document.getElementById('app'));">Back</button>
            <button class="btn btn-primary btn-full" id="confirmBtn" onclick="placeOrder()">Confirm Order</button>
          </div>
        `}
      </div>
    </div>
  `;
}

async function placeOrder() {
  const s = scheduleState;
  const btn = document.getElementById('confirmBtn');
  btn.textContent = 'Placing...';
  btn.disabled = true;

  const deliveryDate = s.date === 'today' ? new Date().toISOString().split('T')[0] :
    s.date === 'tomorrow' ? new Date(Date.now() + 86400000).toISOString().split('T')[0] :
    new Date(Date.now() + 2*86400000).toISOString().split('T')[0];

  const order = await api('/orders', {
    method: 'POST',
    body: JSON.stringify({
      vehicle_id: s.vehicleId,
      location_id: s.locationId,
      fuel_type: s.fuelType,
      volume: s.volume,
      delivery_date: deliveryDate,
      delivery_time: s.time
    })
  });

  if (order) {
    showToast('Order placed successfully!', 'success');
    scheduleState = { step: 1, fuelType: 'diesel', volume: 100, vehicleId: null, locationId: null, date: 'today', time: '14:00' };
    navigateTo('tracking');
  } else {
    btn.textContent = 'Confirm Order';
    btn.disabled = false;
  }
}

// ─── VEHICLES SCREEN ─────────────────────────────────
async function renderVehicles(app) {
  app.innerHTML = `<div class="screen active"><div class="spinner"></div></div>`;
  const vehicles = await api('/vehicles');
  if (!vehicles) return;

  app.innerHTML = `
    <div class="screen active">
      <div class="header-geo">
        <div class="bg"></div>
        <div class="content">
          <h1 style="color:#fff; font-size:22px; font-weight:700;">My Vehicles</h1>
          <p style="color:rgba(255,255,255,0.7); font-size:13px;">${vehicles.length} vehicles registered</p>
        </div>
      </div>
      <div class="scroll-content animate-in">
        ${vehicles.map(v => `
          <div class="card" style="margin-bottom:12px; display:flex; gap:14px; align-items:center;">
            ${vehicleIconBox(normalizeVehicleIcon(v.icon), 52)}
            <div style="flex:1;">
              <p style="font-weight:600; font-size:15px; color:var(--royal);">${v.name}</p>
              <p style="font-size:12px; color:var(--grey);">${v.plate} · ${v.fuel_type} · ${v.tank_capacity}L tank</p>
              ${v.last_fill ? `<p style="font-size:11px; color:var(--sky); font-weight:500;">Last fill: ${new Date(v.last_fill).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</p>` : ''}
            </div>
            <button style="background:none; border:none; color:var(--danger); font-size:16px; cursor:pointer; padding:8px;" onclick="deleteVehicle('${v.id}')">✕</button>
          </div>
        `).join('')}

        <div id="addVehicleForm" style="display:none;" class="card" style="margin-top:12px;">
          <h4 style="font-size:14px; font-weight:700; color:var(--royal); margin-bottom:12px;">Add New Vehicle</h4>
          <div class="input-group"><label>Name</label><input id="vName" placeholder="Toyota Hilux"></div>
          <div class="input-group"><label>Plate Number</label><input id="vPlate" placeholder="BAH 1234"></div>
          <div class="input-group">
            <label>Fuel Type</label>
            <select id="vFuel"><option value="diesel">Diesel</option><option value="petrol">Petrol</option><option value="premium">Premium</option></select>
          </div>
          <div class="input-group"><label>Tank Capacity (L)</label><input id="vTank" type="number" value="80"></div>
          <div class="input-group">
            <label>Vehicle Type</label>
            <div style="display:flex; gap:8px; margin-top:4px;" id="vehicleTypeSelector">
              ${['sedan','suv','pickup','van','truck','heavy'].map(t => `
                <div class="vtype-btn" data-type="${t}" onclick="document.querySelectorAll('.vtype-btn').forEach(b=>b.style.borderColor='var(--off-white)');this.style.borderColor='var(--sky)';this.dataset.selected='true';" style="cursor:pointer; padding:8px; border-radius:12px; border:2px solid var(--off-white); background:#fff; display:flex; flex-direction:column; align-items:center; gap:4px; flex:1;">
                  ${vehicleIcon(t, 22)}
                  <span style="font-size:9px; font-weight:600; color:var(--grey);">${t.charAt(0).toUpperCase()+t.slice(1)}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-outline btn-full" onclick="document.getElementById('addVehicleForm').style.display='none';">Cancel</button>
            <button class="btn btn-primary btn-full" onclick="addVehicle()">Save</button>
          </div>
        </div>

        <button class="btn btn-outline btn-full" style="margin-top:8px;" onclick="document.getElementById('addVehicleForm').style.display='block';">+ Add Vehicle</button>
      </div>
    </div>
  `;
}

async function addVehicle() {
  const selectedType = document.querySelector('.vtype-btn[data-selected="true"]');
  const icon = selectedType ? selectedType.dataset.type : 'sedan';
  const v = await api('/vehicles', {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('vName').value,
      plate: document.getElementById('vPlate').value,
      fuel_type: document.getElementById('vFuel').value,
      tank_capacity: +document.getElementById('vTank').value,
      icon: icon
    })
  });
  if (v) { showToast('Vehicle added!', 'success'); renderVehicles(document.getElementById('app')); }
}

async function deleteVehicle(id) {
  if (!confirm('Remove this vehicle?')) return;
  await api(`/vehicles/${id}`, { method: 'DELETE' });
  showToast('Vehicle removed');
  renderVehicles(document.getElementById('app'));
}

// ─── TRACKING SCREEN ─────────────────────────────────
async function renderTracking(app) {
  app.innerHTML = `<div class="screen active"><div class="spinner"></div></div>`;
  const activeOrders = await api('/orders/active');

  if (!activeOrders || activeOrders.length === 0) {
    const recent = await api('/orders?limit=3');
    app.innerHTML = `
      <div class="screen active">
        <div class="header-geo">
          <div class="bg"></div>
          <div class="content">
            <h1 style="color:#fff; font-size:22px; font-weight:700;">Live Tracking</h1>
            <p style="color:rgba(255,255,255,0.7); font-size:13px;">No active deliveries</p>
          </div>
        </div>
        <div class="scroll-content">
          <div class="empty-state">
            <span style="font-size:48px; margin-bottom:16px;">📍</span>
            <h3 style="color:var(--royal); font-weight:600; margin-bottom:8px;">No Active Deliveries</h3>
            <p style="color:var(--grey); font-size:13px; margin-bottom:20px;">Place an order to track it here in real-time</p>
            <button class="btn btn-primary" onclick="navigateTo('schedule')">Order Fuel</button>
          </div>
          ${recent && recent.length > 0 ? `
            <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin:20px 0 12px;">Past Deliveries</h3>
            ${recent.map(o => `
              <div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <p style="font-weight:600; font-size:14px; color:var(--royal);">${o.order_number}</p>
                  <p style="font-size:12px; color:var(--grey);">${o.fuel_type} ${o.volume}L</p>
                </div>
                <span style="font-size:10px; font-weight:600; color:var(--success); background:rgba(46,204,113,0.1); padding:2px 8px; border-radius:10px;">${o.status}</span>
              </div>
            `).join('')}
          ` : ''}
        </div>
      </div>
    `;
    return;
  }

  const order = activeOrders[0];
  const trackData = await api(`/orders/${order.id}/track`);
  if (!trackData) return;

  // Start WebSocket tracking
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'track_order', order_id: order.id }));
  }

  renderTrackingUI(app, trackData);
}

function renderTrackingUI(app, data) {
  const routePoints = [
    [45,230],[65,215],[90,195],[110,180],[135,168],[155,155],[170,140],[190,128],[210,118],[230,112],[250,108],[268,110],[285,118],[300,130],[315,142],[328,150]
  ];
  const routePath = routePoints.map((p,i) => `${i===0?'M':'L'}${p[0]},${p[1]}`).join(' ');
  const driverIdx = Math.min(Math.floor((data.progress/100)*(routePoints.length-1)), routePoints.length-1);
  const nextIdx = Math.min(driverIdx+1, routePoints.length-1);
  const seg = ((data.progress/100)*(routePoints.length-1))-driverIdx;
  const dx = routePoints[driverIdx][0]+(routePoints[nextIdx][0]-routePoints[driverIdx][0])*seg;
  const dy = routePoints[driverIdx][1]+(routePoints[nextIdx][1]-routePoints[driverIdx][1])*seg;
  const traveled = routePoints.slice(0,driverIdx+1).map((p,i)=>`${i===0?'M':'L'}${p[0]},${p[1]}`).join(' ')+` L${dx},${dy}`;
  const eta = data.eta_minutes || 0;
  const speed = data.speed_kmh || 0;

  const steps = [
    { label: 'Order Placed', done: true },
    { label: 'Confirmed', done: data.progress >= 5 },
    { label: 'Driver Assigned', done: data.progress >= 10 },
    { label: 'En Route', done: data.progress >= 25 },
    { label: 'Arriving', done: data.progress >= 80 },
    { label: 'Fueling', done: data.progress >= 92 },
    { label: 'Complete', done: data.progress >= 100 },
  ];

  app.innerHTML = `
    <div class="screen active">
      <div class="header-geo" style="padding-bottom:16px;">
        <div class="bg"></div>
        <div class="content" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h1 style="color:#fff; font-size:20px; font-weight:700;">Live Tracking</h1>
            <p style="color:var(--sky); font-size:12px; font-weight:500;">${data.order_number}</p>
          </div>
          <div style="background:rgba(0,191,255,0.2); padding:6px 12px; border-radius:10px;">
            <span id="etaBig" style="color:#fff; font-size:18px; font-weight:700;">${eta}</span>
            <span style="color:rgba(255,255,255,0.7); font-size:10px; margin-left:3px;">min</span>
          </div>
        </div>
      </div>

      <div style="padding:8px 16px 20px; position:relative; z-index:2; flex:1; overflow-y:auto;">
        <!-- LIVE MAP -->
        <div class="live-map" id="liveMap" style="height:220px; margin-bottom:14px;">
          <svg id="mapSvg" viewBox="0 0 380 280" style="width:100%; height:100%; display:block;" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8edf5"/><stop offset="100%" stop-color="#d4dbe8"/></linearGradient>
              <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#2E3192"/><stop offset="100%" stop-color="#00BFFF"/></linearGradient>
              <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.15"/></filter>
            </defs>
            <rect width="380" height="280" fill="url(#mapBg)"/>
            <rect x="20" y="40" width="80" height="50" rx="4" fill="#c8d6e5" opacity="0.4"/>
            <rect x="120" y="30" width="60" height="40" rx="4" fill="#c8d6e5" opacity="0.35"/>
            <rect x="200" y="50" width="70" height="45" rx="4" fill="#c8d6e5" opacity="0.3"/>
            <rect x="290" y="35" width="55" height="55" rx="4" fill="#c8d6e5" opacity="0.35"/>
            <rect x="30" y="120" width="55" height="65" rx="4" fill="#b8c9dc" opacity="0.3"/>
            <rect x="250" y="160" width="65" height="50" rx="4" fill="#c8d6e5" opacity="0.3"/>
            <line x1="0" y1="100" x2="380" y2="100" stroke="#bcc8d8" stroke-width="3" opacity="0.5"/>
            <line x1="0" y1="170" x2="380" y2="170" stroke="#bcc8d8" stroke-width="2.5" opacity="0.4"/>
            <line x1="0" y1="240" x2="380" y2="240" stroke="#bcc8d8" stroke-width="2" opacity="0.35"/>
            <line x1="70" y1="0" x2="70" y2="280" stroke="#bcc8d8" stroke-width="2" opacity="0.35"/>
            <line x1="160" y1="0" x2="160" y2="280" stroke="#bcc8d8" stroke-width="2.5" opacity="0.4"/>
            <line x1="250" y1="0" x2="250" y2="280" stroke="#bcc8d8" stroke-width="2" opacity="0.35"/>
            <text x="5" y="96" font-size="6" fill="#8896a7" font-family="Poppins" font-weight="500">Great East Rd</text>
            <text x="5" y="166" font-size="6" fill="#8896a7" font-family="Poppins" font-weight="500">Leopards Hill Rd</text>
            <text x="162" y="14" font-size="6" fill="#8896a7" font-family="Poppins" font-weight="500">Independence Ave</text>
            <ellipse cx="100" cy="85" rx="25" ry="15" fill="#a8d5a2" opacity="0.3"/>
            <ellipse cx="310" cy="95" rx="18" ry="12" fill="#a8d5a2" opacity="0.25"/>
            <path d="${routePath}" fill="none" stroke="#2E3192" stroke-width="4" opacity="0.15" stroke-linecap="round"/>
            <path d="${routePath}" fill="none" stroke="#2E3192" stroke-width="2" opacity="0.25" stroke-dasharray="6,4" stroke-linecap="round"/>
            <path id="traveledPath" d="${traveled}" fill="none" stroke="url(#routeGrad)" stroke-width="4.5" stroke-linecap="round" filter="url(#glow)"/>
            <g filter="url(#shadow)"><circle cx="45" cy="230" r="10" fill="#2E3192"/><circle cx="45" cy="230" r="5" fill="#fff"/></g>
            <text x="45" y="252" text-anchor="middle" font-size="7" fill="#2E3192" font-weight="600">Fuel Depot</text>
            <g filter="url(#shadow)">
              <circle cx="328" cy="150" r="12" fill="#00BFFF" opacity="0.2"><animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite"/></circle>
              <circle cx="328" cy="150" r="10" fill="#fff" stroke="#00BFFF" stroke-width="2.5"/><text x="328" y="153" text-anchor="middle" font-size="8" fill="#00BFFF" font-weight="700">B</text>
            </g>
            <text x="328" y="174" text-anchor="middle" font-size="7" fill="#2E3192" font-weight="600">Bilcoguard HQ</text>
            <g id="driverMarker" filter="url(#glow)">
              <circle id="driverPulse" cx="${dx}" cy="${dy}" r="14" fill="#00BFFF" opacity="0.2"><animate attributeName="r" values="14;22;14" dur="1.5s" repeatCount="indefinite"/></circle>
              <circle id="driverDot" cx="${dx}" cy="${dy}" r="8" fill="#2E3192" stroke="#fff" stroke-width="2.5"/>
              <text id="driverIcon" x="${dx}" y="${dy+3}" text-anchor="middle" font-size="8" fill="#fff">B</text>
            </g>
            <g id="etaBadge" filter="url(#shadow)">
              <rect x="${dx+14}" y="${dy-22}" width="48" height="20" rx="10" fill="#2E3192"/>
              <text id="etaText" x="${dx+38}" y="${dy-9}" text-anchor="middle" font-size="8" fill="#fff" font-weight="600">${eta} min</text>
            </g>
            <g transform="translate(350,30)"><circle r="12" fill="rgba(255,255,255,0.85)" stroke="#A7A8AB" stroke-width="0.5"/><text y="-3" text-anchor="middle" font-size="7" fill="#e74c3c" font-weight="700">N</text><polygon points="0,-8 -2,-4 2,-4" fill="#e74c3c"/></g>
          </svg>
          <div class="live-badge"><div class="live-dot"></div><span style="font-size:10px; font-weight:600; color:#fff;">LIVE</span></div>
          <div class="speed-badge">
            <span id="speedVal" style="font-size:14px; font-weight:700; color:var(--royal);">${speed}</span>
            <span style="font-size:8px; color:var(--grey); display:block;">km/h</span>
          </div>
        </div>

        <!-- Stats bar -->
        <div style="display:flex; justify-content:space-around; background:#fff; border-radius:14px; padding:10px 8px; margin-bottom:14px; box-shadow:0 2px 10px rgba(46,49,146,0.06);">
          <div style="text-align:center;"><p id="distVal" style="font-size:13px; font-weight:700; color:var(--royal);">${((100-data.progress)*0.12).toFixed(1)} km</p><p style="font-size:9px; color:var(--grey);">Distance</p></div>
          <div style="text-align:center;"><p id="etaVal" style="font-size:13px; font-weight:700; color:var(--royal);">${eta} min</p><p style="font-size:9px; color:var(--grey);">ETA</p></div>
          <div style="text-align:center;"><p id="speedStat" style="font-size:13px; font-weight:700; color:var(--royal);">${speed} km/h</p><p style="font-size:9px; color:var(--grey);">Speed</p></div>
          <div style="text-align:center;"><p style="font-size:13px; font-weight:700; color:var(--royal);">${data.fuel_type} ${data.volume}L</p><p style="font-size:9px; color:var(--grey);">Fuel</p></div>
        </div>

        <!-- Driver -->
        <div class="card" style="margin-bottom:12px; display:flex; align-items:center; gap:12px; padding:12px 14px;">
          <div style="width:44px; height:44px; border-radius:22px; background:var(--royal); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:16px;">JM</div>
          <div style="flex:1;">
            <p style="font-weight:600; font-size:13px; color:var(--royal);">${data.driver_name}</p>
            <div style="display:flex; align-items:center; gap:4px;"><span style="font-size:10px; color:#f39c12;">★★★★★</span><span style="font-size:10px; color:var(--grey);">${data.driver_rating} · Bilcoguard Tanker</span></div>
            <p style="font-size:11px; color:var(--grey);">${data.driver_plate}</p>
          </div>
          <a href="tel:${data.driver_phone}" style="width:36px; height:36px; border-radius:18px; background:rgba(0,191,255,0.1); display:flex; align-items:center; justify-content:center; text-decoration:none;"><span style="font-size:15px;">📞</span></a>
        </div>

        <!-- Progress -->
        <div class="card" style="padding:14px 16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="font-size:13px; font-weight:700; color:var(--royal);">Delivery Progress</h4>
            <span id="progressPct" style="font-size:11px; font-weight:600; color:var(--sky);">${data.progress}%</span>
          </div>
          <div style="height:4px; background:var(--off-white); border-radius:2px; margin-bottom:14px; overflow:hidden;">
            <div id="progressBar" style="width:${data.progress}%; height:100%; background:linear-gradient(90deg, var(--royal), var(--sky)); border-radius:2px; transition:width 1.5s;"></div>
          </div>
          ${steps.map((s,i) => `
            <div style="display:flex; gap:10px;">
              <div style="display:flex; flex-direction:column; align-items:center; width:18px;">
                <div style="width:12px; height:12px; border-radius:6px; background:${s.done ? 'var(--sky)' : 'var(--off-white)'}; border:2px solid ${s.done ? 'var(--sky)' : 'var(--grey)'}; flex-shrink:0;"></div>
                ${i < steps.length-1 ? `<div style="width:2px; height:20px; background:${s.done ? 'var(--sky)' : 'var(--off-white)'};"></div>` : ''}
              </div>
              <p style="font-size:12px; font-weight:${s.done ? '600' : '400'}; color:${s.done ? 'var(--royal)' : 'var(--grey)'}; padding-bottom:6px;">${s.label}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function updateTrackingUI(msg) {
  const routePoints = [[45,230],[65,215],[90,195],[110,180],[135,168],[155,155],[170,140],[190,128],[210,118],[230,112],[250,108],[268,110],[285,118],[300,130],[315,142],[328,150]];
  const driverIdx = Math.min(Math.floor((msg.progress/100)*(routePoints.length-1)), routePoints.length-1);
  const nextIdx = Math.min(driverIdx+1, routePoints.length-1);
  const seg = ((msg.progress/100)*(routePoints.length-1))-driverIdx;
  const dx = routePoints[driverIdx][0]+(routePoints[nextIdx][0]-routePoints[driverIdx][0])*seg;
  const dy = routePoints[driverIdx][1]+(routePoints[nextIdx][1]-routePoints[driverIdx][1])*seg;
  const traveled = routePoints.slice(0,driverIdx+1).map((p,i)=>`${i===0?'M':'L'}${p[0]},${p[1]}`).join(' ')+` L${dx},${dy}`;

  const tp = document.getElementById('traveledPath'); if (tp) tp.setAttribute('d', traveled);
  const dp = document.getElementById('driverPulse'); if (dp) { dp.setAttribute('cx', dx); dp.setAttribute('cy', dy); }
  const dd = document.getElementById('driverDot'); if (dd) { dd.setAttribute('cx', dx); dd.setAttribute('cy', dy); }
  const di = document.getElementById('driverIcon'); if (di) { di.setAttribute('x', dx); di.setAttribute('y', dy+3); }

  const eb = document.getElementById('etaBadge');
  if (eb) eb.innerHTML = `<rect x="${dx+14}" y="${dy-22}" width="48" height="20" rx="10" fill="#2E3192"/><text x="${dx+38}" y="${dy-9}" text-anchor="middle" font-size="8" fill="#fff" font-weight="600">${msg.eta_minutes} min</text>`;

  const pb = document.getElementById('progressBar'); if (pb) pb.style.width = msg.progress + '%';
  const pp = document.getElementById('progressPct'); if (pp) pp.textContent = Math.round(msg.progress) + '%';
  const sv = document.getElementById('speedVal'); if (sv) sv.textContent = msg.speed_kmh;
  const ss = document.getElementById('speedStat'); if (ss) ss.textContent = msg.speed_kmh + ' km/h';
  const ev = document.getElementById('etaVal'); if (ev) ev.textContent = msg.eta_minutes + ' min';
  const dv = document.getElementById('distVal'); if (dv) dv.textContent = ((100-msg.progress)*0.12).toFixed(1) + ' km';
  const eB = document.getElementById('etaBig'); if (eB) eB.textContent = msg.eta_minutes;

  if (msg.status === 'delivered') {
    showToast('Delivery complete! Your vehicle has been fueled.', 'success');
  }
}

// ─── PROFILE SCREEN ──────────────────────────────────
async function renderProfile(app) {
  app.innerHTML = `<div class="screen active"><div class="spinner"></div></div>`;
  const data = await api('/auth/me');
  const notifs = await api('/notifications');
  if (!data) return;

  const u = data.user;
  const s = data.stats;

  app.innerHTML = `
    <div class="screen active">
      <div class="header-geo">
        <div class="bg"></div>
        <div class="content" style="display:flex; align-items:center; gap:16px;">
          <div style="width:60px; height:60px; border-radius:30px; background:var(--sky); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:24px; border:3px solid rgba(255,255,255,0.3);">${u.name.split(' ').map(n=>n[0]).join('')}</div>
          <div>
            <h1 style="color:#fff; font-size:20px; font-weight:700;">${u.name}</h1>
            <p style="color:rgba(255,255,255,0.7); font-size:13px;">${u.email}</p>
            <span style="display:inline-block; background:var(--sky); color:#fff; font-size:10px; font-weight:600; padding:2px 10px; border-radius:10px; margin-top:4px;">${u.plan} Fleet</span>
          </div>
        </div>
      </div>
      <div class="scroll-content animate-in">
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
          <div class="card" style="text-align:center; padding:14px;"><p style="font-size:22px; font-weight:700; color:var(--royal);">${s.total_orders}</p><p style="font-size:11px; color:var(--grey);">Orders</p></div>
          <div class="card" style="text-align:center; padding:14px;"><p style="font-size:22px; font-weight:700; color:var(--royal);">${s.total_litres.toLocaleString()}</p><p style="font-size:11px; color:var(--grey);">Litres</p></div>
          <div class="card" style="text-align:center; padding:14px;"><p style="font-size:22px; font-weight:700; color:var(--royal);">K${(s.total_spent/1000).toFixed(1)}k</p><p style="font-size:11px; color:var(--grey);">Spent</p></div>
        </div>

        ${notifs && notifs.length > 0 ? `
          <h3 style="font-size:16px; font-weight:700; color:var(--royal); margin-bottom:12px;">Notifications</h3>
          ${notifs.slice(0,3).map(n => `
            <div class="card" style="margin-bottom:8px; display:flex; align-items:center; gap:12px; padding:12px; opacity:${n.read ? '0.6' : '1'};">
              <div style="width:36px; height:36px; border-radius:18px; background:${n.type === 'success' ? 'rgba(46,204,113,0.1)' : n.type === 'delivery' ? 'rgba(0,191,255,0.1)' : 'rgba(46,49,146,0.1)'}; display:flex; align-items:center; justify-content:center;">
                ${n.type === 'delivery' ? tankerIcon(18, '#00BFFF') : `<span style="font-size:16px;">${n.type === 'success' ? '✅' : 'ℹ️'}</span>`}
              </div>
              <div style="flex:1;">
                <p style="font-weight:600; font-size:13px; color:var(--royal);">${n.title}</p>
                <p style="font-size:11px; color:var(--grey);">${n.body}</p>
              </div>
            </div>
          `).join('')}
        ` : ''}

        ${[
          { icon: '🏢', label: 'Company Details', sub: u.company },
          { icon: '📊', label: 'Fuel Reports', sub: 'Monthly analytics' },
          { icon: '📋', label: 'Subscription', sub: u.plan + ' Plan' },
          { icon: '⚙️', label: 'Settings', sub: 'Account preferences' },
          { icon: '❓', label: 'Help & Support', sub: 'FAQs, contact us' },
        ].map(m => `
          <div class="card" style="margin-bottom:8px; display:flex; align-items:center; gap:14px; padding:14px 16px; cursor:pointer;">
            <span style="font-size:22px;">${m.icon}</span>
            <div style="flex:1;"><p style="font-weight:600; font-size:14px; color:var(--royal);">${m.label}</p><p style="font-size:12px; color:var(--grey);">${m.sub}</p></div>
            <span style="color:var(--grey); font-size:18px;">›</span>
          </div>
        `).join('')}

        <button class="btn btn-outline btn-full" style="margin-top:12px; color:var(--danger); border-color:var(--danger);" onclick="logout()">Sign Out</button>

        <div style="text-align:center; margin-top:16px;">
          <p style="font-size:11px; color:var(--grey);">Bilcoguard Fuel Delivery v2.1.0</p>
          <p style="font-size:10px; color:var(--grey);">Powered by Bilcoguard Limited</p>
        </div>
      </div>
    </div>
  `;
}

// ─── INIT ────────────────────────────────────────────
checkAuth();
