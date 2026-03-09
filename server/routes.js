const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID: uuid } = require('crypto');
const db = require('./db');
const { generateToken, authMiddleware } = require('./auth');

const router = express.Router();

// ─── AUTH ─────────────────────────────────────────────
router.post('/auth/register', (req, res) => {
  const { email, password, name, phone, company } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = uuid();
  const hashed = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password, name, phone, company) VALUES (?,?,?,?,?,?)')
    .run(id, email, hashed, name, phone || null, company || 'Bilcoguard Limited');

  const user = db.prepare('SELECT id, email, name, phone, company, plan, created_at FROM users WHERE id = ?').get(id);
  res.status(201).json({ user, token: generateToken(user) });
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { password: _, ...safe } = user;
  res.json({ user: safe, token: generateToken(user) });
});

router.get('/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, phone, company, plan, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Stats
  const stats = db.prepare(`
    SELECT COUNT(*) as total_orders,
           COALESCE(SUM(volume), 0) as total_litres,
           COALESCE(SUM(total), 0) as total_spent
    FROM orders WHERE user_id = ?
  `).get(req.user.id);

  res.json({ user, stats });
});

// ─── PROFILE ──────────────────────────────────────────
router.put('/customer/profile', authMiddleware, (req, res) => {
  const { name, phone, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')
    .run(name.trim(), phone?.trim() || null, req.user.id);

  const user = db.prepare('SELECT id, email, name, phone, company, plan, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ─── FUEL PRICES ──────────────────────────────────────
router.get('/prices', (req, res) => {
  const prices = db.prepare('SELECT * FROM fuel_prices ORDER BY price_per_litre').all();
  res.json(prices);
});

// ─── VEHICLES ─────────────────────────────────────────
router.get('/vehicles', authMiddleware, (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

  // Add last fill info
  const enriched = vehicles.map(v => {
    const lastOrder = db.prepare(`
      SELECT delivery_date FROM orders
      WHERE vehicle_id = ? AND status = 'delivered'
      ORDER BY delivery_date DESC LIMIT 1
    `).get(v.id);
    return { ...v, last_fill: lastOrder?.delivery_date || null };
  });

  res.json(enriched);
});

router.post('/vehicles', authMiddleware, (req, res) => {
  const { name, plate, fuel_type, tank_capacity, icon } = req.body;
  if (!name || !plate) return res.status(400).json({ error: 'Name and plate required' });

  const id = uuid();
  db.prepare('INSERT INTO vehicles (id, user_id, name, plate, fuel_type, tank_capacity, icon) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.user.id, name, plate, fuel_type || 'diesel', tank_capacity || 80, icon || '🚙');

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  res.status(201).json(vehicle);
});

router.delete('/vehicles/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM vehicles WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Vehicle not found' });
  res.json({ success: true });
});

// ─── LOCATIONS ────────────────────────────────────────
router.get('/locations', authMiddleware, (req, res) => {
  const locs = db.prepare('SELECT * FROM locations WHERE user_id = ? ORDER BY is_default DESC, name').all(req.user.id);
  res.json(locs);
});

router.post('/locations', authMiddleware, (req, res) => {
  const { name, address, lat, lng, is_default } = req.body;
  if (!name || !address) return res.status(400).json({ error: 'Name and address required' });

  if (is_default) {
    db.prepare('UPDATE locations SET is_default = 0 WHERE user_id = ?').run(req.user.id);
  }

  const id = uuid();
  db.prepare('INSERT INTO locations (id, user_id, name, address, lat, lng, is_default) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.user.id, name, address, lat || null, lng || null, is_default ? 1 : 0);

  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
  res.status(201).json(loc);
});

// ─── ORDERS ───────────────────────────────────────────
router.get('/orders', authMiddleware, (req, res) => {
  const { status, limit } = req.query;
  let query = 'SELECT o.*, v.name as vehicle_name, v.plate as vehicle_plate, v.icon as vehicle_icon, l.name as location_name, l.address as location_address FROM orders o LEFT JOIN vehicles v ON o.vehicle_id = v.id LEFT JOIN locations l ON o.location_id = l.id WHERE o.user_id = ?';
  const params = [req.user.id];

  if (status) {
    query += ' AND o.status = ?';
    params.push(status);
  }

  query += ' ORDER BY o.created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  }

  const orders = db.prepare(query).all(...params);
  res.json(orders);
});

router.get('/orders/active', authMiddleware, (req, res) => {
  const active = db.prepare(`
    SELECT o.*, v.name as vehicle_name, v.plate as vehicle_plate, v.icon as vehicle_icon,
           l.name as location_name, l.address as location_address
    FROM orders o
    LEFT JOIN vehicles v ON o.vehicle_id = v.id
    LEFT JOIN locations l ON o.location_id = l.id
    WHERE o.user_id = ? AND o.status IN ('pending', 'confirmed', 'driver_assigned', 'en_route', 'arriving', 'fueling')
    ORDER BY o.created_at DESC
  `).all(req.user.id);
  res.json(active);
});

router.get('/orders/:id', authMiddleware, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, v.name as vehicle_name, v.plate as vehicle_plate, v.icon as vehicle_icon,
           l.name as location_name, l.address as location_address
    FROM orders o
    LEFT JOIN vehicles v ON o.vehicle_id = v.id
    LEFT JOIN locations l ON o.location_id = l.id
    WHERE o.id = ? AND o.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY timestamp').all(order.id);
  res.json({ ...order, events });
});

router.post('/orders', authMiddleware, (req, res) => {
  const { vehicle_id, location_id, fuel_type, volume, delivery_date, delivery_time } = req.body;

  if (!fuel_type || !volume || !delivery_date || !delivery_time) {
    return res.status(400).json({ error: 'fuel_type, volume, delivery_date, delivery_time required' });
  }

  // Get current price
  const fuelPrice = db.prepare('SELECT price_per_litre FROM fuel_prices WHERE fuel_type = ?').get(fuel_type);
  if (!fuelPrice) return res.status(400).json({ error: 'Invalid fuel type' });

  const price = fuelPrice.price_per_litre;
  const total = price * volume;
  const id = uuid();

  // Generate unique order number
  const lastOrder = db.prepare("SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1").get();
  let nextNum = 851;
  if (lastOrder) {
    const parts = lastOrder.order_number.split('-');
    nextNum = parseInt(parts[parts.length - 1]) + 1;
  }
  // Ensure uniqueness
  let orderNumber;
  let exists = true;
  while (exists) {
    orderNumber = `BG-2026-${String(nextNum).padStart(4, '0')}`;
    exists = !!db.prepare("SELECT 1 FROM orders WHERE order_number = ?").get(orderNumber);
    if (exists) nextNum++;
  }

  db.prepare(`
    INSERT INTO orders (id, order_number, user_id, vehicle_id, location_id, fuel_type, volume, price_per_litre, total, delivery_date, delivery_time, status, driver_name, driver_phone, driver_plate, progress, eta_minutes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, orderNumber, req.user.id, vehicle_id || null, location_id || null,
    fuel_type, volume, price, total, delivery_date, delivery_time,
    'pending', 'Joseph Mwanza', '+260966789012', 'ABT 4421', 0, null);

  // Create initial event
  db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), id, 'order_placed');

  // Admin notification — new order
  db.prepare('INSERT INTO admin_notifications (id, title, body, type, order_id) VALUES (?,?,?,?,?)')
    .run(uuid(), 'New Order Received', `${req.user.name || 'Customer'} placed a ${volume}L ${fuel_type} order (#${orderNumber})`, 'new_order', id);

  // Auto-assign driver after 3 seconds (simulated)
  setTimeout(() => {
    db.prepare("UPDATE orders SET status = 'confirmed', progress = 5 WHERE id = ?").run(id);
    db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), id, 'confirmed');
    db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
      .run(uuid(), req.user.id, 'Order Confirmed', `Your order #${orderNumber} has been confirmed and is being processed.`, 'order');

    setTimeout(() => {
      db.prepare("UPDATE orders SET status = 'driver_assigned', progress = 10, eta_minutes = 30 WHERE id = ?").run(id);
      db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), id, 'driver_assigned');
      db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
        .run(uuid(), req.user.id, 'Driver Assigned', `Joseph Mwanza has been assigned to deliver your ${volume}L ${fuel_type}. ETA: 30 min.`, 'delivery');

      setTimeout(() => {
        db.prepare("UPDATE orders SET status = 'en_route', progress = 25, eta_minutes = 22 WHERE id = ?").run(id);
        db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), id, 'en_route');
        db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
          .run(uuid(), req.user.id, 'Driver En Route', `Your driver is on the way! ETA: 22 minutes.`, 'delivery');
        db.prepare('INSERT INTO admin_notifications (id, title, body, type, order_id) VALUES (?,?,?,?,?)')
          .run(uuid(), 'Driver En Route', `Joseph Mwanza is en route for order #${orderNumber}`, 'status_update', id);
      }, 5000);
    }, 3000);
  }, 3000);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const notification = db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)');
  notification.run(uuid(), req.user.id, 'Order Placed', `Your ${volume}L ${fuel_type} order has been placed. Order #${orderNumber}`, 'order');

  res.status(201).json(order);
});

// ─── TRACKING (live progress simulation) ──────────────
router.get('/orders/:id/track', authMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Simulate progress advancement for active orders
  if (['en_route', 'arriving', 'fueling'].includes(order.status) && order.progress < 100) {
    const newProgress = Math.min(order.progress + Math.floor(Math.random() * 3) + 1, 100);
    const newEta = Math.max(0, Math.round((100 - newProgress) * 0.3));
    let newStatus = order.status;

    if (newProgress >= 80 && order.status === 'en_route') newStatus = 'arriving';
    if (newProgress >= 92 && order.status === 'arriving') newStatus = 'fueling';
    if (newProgress >= 100) newStatus = 'delivered';

    db.prepare('UPDATE orders SET progress = ?, eta_minutes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newProgress, newEta, newStatus, order.id);

    if (newStatus !== order.status) {
      db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), order.id, newStatus);
    }

    order.progress = newProgress;
    order.eta_minutes = newEta;
    order.status = newStatus;
  }

  const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY timestamp').all(order.id);

  // Simulated driver location along route
  const routePoints = [
    [-15.44, 28.29], [-15.438, 28.295], [-15.435, 28.30], [-15.432, 28.305],
    [-15.429, 28.31], [-15.426, 28.315], [-15.423, 28.318], [-15.420, 28.320],
    [-15.418, 28.322], [-15.4167, 28.3222]
  ];
  const idx = Math.min(Math.floor((order.progress / 100) * (routePoints.length - 1)), routePoints.length - 1);
  const driverLocation = { lat: routePoints[idx][0], lng: routePoints[idx][1] };

  res.json({
    ...order,
    events,
    driver_location: driverLocation,
    route: routePoints,
    speed_kmh: order.progress < 90 ? 35 + Math.floor(Math.random() * 15) : 0
  });
});

// ─── DRIVER LIVE LOCATION (for customer tracking) ─────
router.get('/orders/:id/driver-location', authMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!order.driver_id) return res.json({ driver_location: null });

  const loc = db.prepare('SELECT lat, lng, heading, speed, updated_at FROM driver_locations WHERE driver_id = ?').get(order.driver_id);
  if (!loc) return res.json({ driver_location: null });

  // Get destination coordinates
  const dest = db.prepare('SELECT lat, lng FROM locations WHERE id = ?').get(order.location_id);

  res.json({
    driver_location: { lat: loc.lat, lng: loc.lng, heading: loc.heading, speed: loc.speed },
    destination: dest ? { lat: dest.lat, lng: dest.lng } : null,
    updated_at: loc.updated_at,
    driver_name: order.driver_name,
    status: order.status,
    eta_minutes: order.eta_minutes
  });
});

// ─── NOTIFICATIONS ────────────────────────────────────
router.get('/notifications', authMiddleware, (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
  res.json(notifs);
});

router.put('/notifications/:id/read', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ─── DASHBOARD STATS ──────────────────────────────────
router.get('/dashboard', authMiddleware, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(volume), 0) as total_litres,
      COALESCE(SUM(total), 0) as total_spent,
      COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) as delivered_value
    FROM orders WHERE user_id = ?
  `).get(req.user.id);

  const recentOrders = db.prepare(`
    SELECT o.*, v.name as vehicle_name, v.icon as vehicle_icon
    FROM orders o LEFT JOIN vehicles v ON o.vehicle_id = v.id
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC LIMIT 5
  `).all(req.user.id);

  const activeOrders = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE user_id = ? AND status IN ('pending','confirmed','driver_assigned','en_route','arriving','fueling')
  `).get(req.user.id);

  const vehicleCount = db.prepare('SELECT COUNT(*) as count FROM vehicles WHERE user_id = ?').get(req.user.id);
  const prices = db.prepare('SELECT * FROM fuel_prices ORDER BY price_per_litre').all();
  const unreadNotifs = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id);

  res.json({
    stats,
    recent_orders: recentOrders,
    active_order_count: activeOrders.count,
    vehicle_count: vehicleCount.count,
    fuel_prices: prices,
    unread_notifications: unreadNotifs.count
  });
});

module.exports = router;
