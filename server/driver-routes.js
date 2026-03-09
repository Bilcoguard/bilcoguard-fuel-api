const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID: uuid } = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { SECRET } = require('./auth');

const router = express.Router();

// Driver auth middleware
function driverAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });
    req.driver = decoded;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// Driver login
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const driver = db.prepare('SELECT * FROM drivers WHERE email = ?').get(email);
  if (!driver || !bcrypt.compareSync(password, driver.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const { password: _, ...safe } = driver;
  const token = jwt.sign({ id: driver.id, email: driver.email, role: 'driver' }, SECRET, { expiresIn: '7d' });
  res.json({ driver: safe, token });
});

// Driver profile
router.get('/profile', driverAuth, (req, res) => {
  const driver = db.prepare('SELECT id, email, name, phone, plate, licence_number, rating, total_deliveries, status, created_at FROM drivers WHERE id = ?').get(req.driver.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  // Today's earnings
  const todayEarnings = db.prepare(`
    SELECT COALESCE(SUM(total * 0.15), 0) as amount FROM orders
    WHERE driver_id = ? AND status = 'delivered' AND DATE(updated_at) = DATE('now')
  `).get(req.driver.id);

  res.json({ ...driver, today_earnings: todayEarnings.amount });
});

// Update driver profile
router.put('/profile', driverAuth, (req, res) => {
  const { name, phone, licence_number } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  db.prepare('UPDATE drivers SET name = ?, phone = ?, licence_number = ? WHERE id = ?')
    .run(name.trim(), phone?.trim() || null, licence_number?.trim() || null, req.driver.id);

  const driver = db.prepare('SELECT id, email, name, phone, plate, licence_number, rating, total_deliveries, status, created_at FROM drivers WHERE id = ?').get(req.driver.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  // Today's earnings
  const todayEarnings = db.prepare(`
    SELECT COALESCE(SUM(total * 0.15), 0) as amount FROM orders
    WHERE driver_id = ? AND status = 'delivered' AND DATE(updated_at) = DATE('now')
  `).get(req.driver.id);

  res.json({ ...driver, today_earnings: todayEarnings.amount });
});

// Update driver status
router.put('/status', driverAuth, (req, res) => {
  const { status } = req.body;
  if (!['available', 'on_delivery', 'offline'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare('UPDATE drivers SET status = ? WHERE id = ?').run(status, req.driver.id);
  res.json({ success: true, status });
});

// Get available orders (pending, not yet assigned to this driver)
router.get('/orders/available', driverAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, l.name as location_name, l.address as location_address, l.lat, l.lng,
           u.name as customer_name, u.phone as customer_phone
    FROM orders o
    LEFT JOIN locations l ON o.location_id = l.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.status IN ('pending', 'confirmed') AND (o.driver_id IS NULL OR o.driver_id = '')
    ORDER BY o.created_at DESC
  `).all();
  res.json(orders);
});

// Get driver's orders
router.get('/orders/mine', driverAuth, (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT o.*, l.name as location_name, l.address as location_address, l.lat, l.lng,
           u.name as customer_name, u.phone as customer_phone
    FROM orders o
    LEFT JOIN locations l ON o.location_id = l.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.driver_id = ?
  `;
  const params = [req.driver.id];
  if (status) { query += ' AND o.status = ?'; params.push(status); }
  query += ' ORDER BY o.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get active delivery
router.get('/orders/active', driverAuth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, l.name as location_name, l.address as location_address, l.lat, l.lng,
           u.name as customer_name, u.phone as customer_phone
    FROM orders o
    LEFT JOIN locations l ON o.location_id = l.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.driver_id = ? AND o.status IN ('driver_assigned', 'en_route', 'arriving', 'fueling')
    ORDER BY o.created_at DESC LIMIT 1
  `).get(req.driver.id);
  res.json(order || null);
});

// Accept order
router.post('/orders/:id/accept', driverAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND status IN (\'pending\', \'confirmed\')').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found or already assigned' });

  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.driver.id);
  db.prepare(`
    UPDATE orders SET driver_id = ?, driver_name = ?, driver_phone = ?, driver_plate = ?,
    driver_rating = ?, status = 'driver_assigned', progress = 10, eta_minutes = 30, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.driver.id, driver.name, driver.phone, driver.plate, driver.rating, req.params.id);

  db.prepare('UPDATE drivers SET status = \'on_delivery\' WHERE id = ?').run(req.driver.id);
  db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), req.params.id, 'driver_assigned');

  // Notify customer
  db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
    .run(uuid(), order.user_id, 'Driver Assigned', `${driver.name} has been assigned to your order.`, 'delivery');

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Reject order
router.post('/orders/:id/reject', driverAuth, (req, res) => {
  // For now, just return success — order stays available for other drivers
  res.json({ success: true });
});

// Update order status (driver progressing through delivery)
router.put('/orders/:id/status', driverAuth, (req, res) => {
  const { status } = req.body;
  const validTransitions = {
    'driver_assigned': ['en_route'],
    'en_route': ['arriving'],
    'arriving': ['fueling'],
    'fueling': ['delivered']
  };

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND driver_id = ?').get(req.params.id, req.driver.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (!validTransitions[order.status]?.includes(status)) {
    return res.status(400).json({ error: `Cannot transition from ${order.status} to ${status}` });
  }

  const progressMap = { en_route: 25, arriving: 80, fueling: 92, delivered: 100 };
  const etaMap = { en_route: 22, arriving: 5, fueling: 2, delivered: 0 };

  db.prepare('UPDATE orders SET status = ?, progress = ?, eta_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, progressMap[status], etaMap[status], req.params.id);

  db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), req.params.id, status);

  const driver = db.prepare('SELECT name FROM drivers WHERE id = ?').get(req.driver.id);
  const driverName = driver ? driver.name : 'Your driver';

  // Customer notifications for each status
  if (status === 'en_route') {
    db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
      .run(uuid(), order.user_id, 'Driver En Route', `${driverName} is on the way with your ${order.volume}L ${order.fuel_type}. ETA: ${etaMap[status]} min.`, 'delivery');
    db.prepare('INSERT INTO admin_notifications (id, title, body, type, order_id) VALUES (?,?,?,?,?)')
      .run(uuid(), 'Driver En Route', `${driverName} started delivery for order #${order.order_number}`, 'status_update', req.params.id);
  }
  if (status === 'arriving') {
    db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
      .run(uuid(), order.user_id, 'Driver Arriving', `${driverName} is almost at your location! Please be ready.`, 'delivery');
    db.prepare('INSERT INTO admin_notifications (id, title, body, type, order_id) VALUES (?,?,?,?,?)')
      .run(uuid(), 'Driver Arriving', `${driverName} arriving at delivery location for order #${order.order_number}`, 'status_update', req.params.id);
  }
  if (status === 'fueling') {
    db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
      .run(uuid(), order.user_id, 'Fueling In Progress', `${driverName} is now fueling your vehicle with ${order.volume}L ${order.fuel_type}.`, 'delivery');
  }
  if (status === 'delivered') {
    db.prepare('UPDATE drivers SET status = \'available\', total_deliveries = total_deliveries + 1 WHERE id = ?').run(req.driver.id);
    db.prepare('INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)')
      .run(uuid(), order.user_id, 'Delivery Complete', `Your ${order.volume}L ${order.fuel_type} delivery is complete! Thank you for using Bilcoguard Fuel.`, 'success');
    // Driver notification
    const earning = (order.total * 0.15).toFixed(2);
    db.prepare('INSERT INTO driver_notifications (id, driver_id, title, body, type, order_id) VALUES (?,?,?,?,?,?)')
      .run(uuid(), req.driver.id, 'Delivery Completed', `You completed order #${order.order_number}. Earned K${earning}.`, 'earning', req.params.id);
    // Admin notification
    db.prepare('INSERT INTO admin_notifications (id, title, body, type, order_id) VALUES (?,?,?,?,?)')
      .run(uuid(), 'Delivery Completed', `${driverName} completed order #${order.order_number} (${order.volume}L ${order.fuel_type})`, 'completed', req.params.id);
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Earnings
router.get('/earnings', driverAuth, (req, res) => {
  const today = db.prepare(`
    SELECT COALESCE(SUM(total * 0.15), 0) as amount, COUNT(*) as deliveries FROM orders
    WHERE driver_id = ? AND status = 'delivered' AND DATE(updated_at) = DATE('now')
  `).get(req.driver.id);

  const thisWeek = db.prepare(`
    SELECT COALESCE(SUM(total * 0.15), 0) as amount, COUNT(*) as deliveries FROM orders
    WHERE driver_id = ? AND status = 'delivered' AND updated_at >= DATE('now', '-7 days')
  `).get(req.driver.id);

  const thisMonth = db.prepare(`
    SELECT COALESCE(SUM(total * 0.15), 0) as amount, COUNT(*) as deliveries FROM orders
    WHERE driver_id = ? AND status = 'delivered' AND updated_at >= DATE('now', 'start of month')
  `).get(req.driver.id);

  const recentDeliveries = db.prepare(`
    SELECT o.order_number, o.fuel_type, o.volume, o.total, (o.total * 0.15) as earning,
           o.updated_at, u.name as customer_name
    FROM orders o LEFT JOIN users u ON o.user_id = u.id
    WHERE o.driver_id = ? AND o.status = 'delivered'
    ORDER BY o.updated_at DESC LIMIT 20
  `).all(req.driver.id);

  res.json({
    today: { amount: today.amount, deliveries: today.deliveries },
    this_week: { amount: thisWeek.amount, deliveries: thisWeek.deliveries },
    this_month: { amount: thisMonth.amount, deliveries: thisMonth.deliveries },
    recent_deliveries: recentDeliveries
  });
});

// ─── DRIVER NOTIFICATIONS ────────────────────────────
router.get('/notifications', driverAuth, (req, res) => {
  const notifs = db.prepare('SELECT * FROM driver_notifications WHERE driver_id = ? ORDER BY created_at DESC LIMIT 30').all(req.driver.id);
  const unread = db.prepare('SELECT COUNT(*) as count FROM driver_notifications WHERE driver_id = ? AND read = 0').get(req.driver.id);
  res.json({ notifications: notifs, unread_count: unread.count });
});

router.put('/notifications/:id/read', driverAuth, (req, res) => {
  db.prepare('UPDATE driver_notifications SET read = 1 WHERE id = ? AND driver_id = ?').run(req.params.id, req.driver.id);
  res.json({ success: true });
});

router.put('/notifications/read-all', driverAuth, (req, res) => {
  db.prepare('UPDATE driver_notifications SET read = 1 WHERE driver_id = ?').run(req.driver.id);
  res.json({ success: true });
});

// ─── LIVE LOCATION ──────────────────────────────────
router.put('/location', driverAuth, (req, res) => {
  const { lat, lng, heading, speed } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });

  db.prepare(`
    INSERT INTO driver_locations (driver_id, lat, lng, heading, speed, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(driver_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, heading=excluded.heading, speed=excluded.speed, updated_at=CURRENT_TIMESTAMP
  `).run(req.driver.id, lat, lng, heading || 0, speed || 0);

  res.json({ success: true });
});

module.exports = router;
