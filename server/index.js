const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const db = require('./db');
const routes = require('./routes');
const jwt = require('jsonwebtoken');
const { SECRET } = require('./auth');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Config endpoint — serves runtime env vars to frontend
app.get('/api/config/maps-key', (req, res) => {
  res.json({ key: process.env.GMAPS_TOKEN || '' });
});

// API routes
app.use('/api', routes);

// Driver API routes
const driverRoutes = require('./driver-routes');
app.use('/api/driver', driverRoutes);

// Admin API routes
const adminRoutes = require('./admin-routes');
app.use('/api/admin', adminRoutes);

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback (Express 5 uses named param syntax)
app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

// ─── WebSocket for real-time tracking ─────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  let userId = null;
  let trackingInterval = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'auth') {
        try {
          const decoded = jwt.verify(msg.token, SECRET);
          userId = decoded.id;
          ws.send(JSON.stringify({ type: 'auth_ok' }));
        } catch {
          ws.send(JSON.stringify({ type: 'auth_error' }));
        }
      }

      if (msg.type === 'track_order' && userId) {
        if (trackingInterval) clearInterval(trackingInterval);

        const sendUpdate = () => {
          const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(msg.order_id, userId);
          if (!order) return;

          // Advance progress
          if (['en_route', 'arriving', 'fueling'].includes(order.status) && order.progress < 100) {
            const newProgress = Math.min(order.progress + 1, 100);
            const newEta = Math.max(0, Math.round((100 - newProgress) * 0.3));
            let newStatus = order.status;
            if (newProgress >= 80 && order.status === 'en_route') newStatus = 'arriving';
            if (newProgress >= 92) newStatus = 'fueling';
            if (newProgress >= 100) newStatus = 'delivered';

            db.prepare('UPDATE orders SET progress = ?, eta_minutes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(newProgress, newEta, newStatus, order.id);

            order.progress = newProgress;
            order.eta_minutes = newEta;
            order.status = newStatus;
          }

          // Route simulation
          const routePoints = [
            [-15.44, 28.29], [-15.438, 28.295], [-15.435, 28.30], [-15.432, 28.305],
            [-15.429, 28.31], [-15.426, 28.315], [-15.423, 28.318], [-15.420, 28.320],
            [-15.418, 28.322], [-15.4167, 28.3222]
          ];
          const idx = Math.min(Math.floor((order.progress / 100) * (routePoints.length - 1)), routePoints.length - 1);

          ws.send(JSON.stringify({
            type: 'tracking_update',
            order_id: order.id,
            progress: order.progress,
            status: order.status,
            eta_minutes: order.eta_minutes,
            driver_location: { lat: routePoints[idx][0], lng: routePoints[idx][1] },
            speed_kmh: order.progress < 90 ? 35 + Math.floor(Math.random() * 15) : 0
          }));

          if (order.status === 'delivered') {
            clearInterval(trackingInterval);
          }
        };

        sendUpdate();
        trackingInterval = setInterval(sendUpdate, 2000);
      }

      if (msg.type === 'stop_tracking') {
        if (trackingInterval) clearInterval(trackingInterval);
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    if (trackingInterval) clearInterval(trackingInterval);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   ⛽ Bilcoguard Fuel Delivery API            ║
  ║   Running on http://localhost:${PORT}          ║
  ║   WebSocket:  ws://localhost:${PORT}/ws        ║
  ╚══════════════════════════════════════════════╝
  `);
});
