const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID: uuid } = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { SECRET } = require('./auth');

const router = express.Router();

// Admin auth middleware
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') return res.status(403).json({ error: 'Not an admin' });
    req.admin = decoded;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// Admin login
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const { password: _, ...safe } = admin;
  const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, SECRET, { expiresIn: '7d' });
  res.json({ admin: safe, token });
});

// Dashboard stats
router.get('/dashboard', adminAuth, (req, res) => {
  const orderStats = db.prepare(`
    SELECT COUNT(*) as total_orders,
           COALESCE(SUM(total), 0) as total_revenue,
           COALESCE(SUM(volume), 0) as total_litres,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) as delivered_revenue,
           COALESCE(SUM(CASE WHEN status IN ('pending','confirmed','driver_assigned','en_route','arriving','fueling') THEN 1 ELSE 0 END), 0) as active_orders,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) as completed_orders
    FROM orders
  `).get();

  const todayStats = db.prepare(`
    SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue FROM orders
    WHERE DATE(created_at) = DATE('now')
  `).get();

  const customerCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const driverCount = db.prepare('SELECT COUNT(*) as count FROM drivers').get();
  const activeDrivers = db.prepare("SELECT COUNT(*) as count FROM drivers WHERE status = 'available'").get();
  const vehicleCount = db.prepare('SELECT COUNT(*) as count FROM vehicles').get();
  const prices = db.prepare('SELECT * FROM fuel_prices').all();

  const recentOrders = db.prepare(`
    SELECT o.*, u.name as customer_name, u.email as customer_email
    FROM orders o LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC LIMIT 10
  `).all();

  const monthlyRevenue = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(total) as revenue, COUNT(*) as orders
    FROM orders WHERE status = 'delivered'
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all();

  res.json({
    overview: orderStats,
    today: todayStats,
    customers: customerCount.count,
    drivers: { total: driverCount.count, active: activeDrivers.count },
    vehicles: vehicleCount.count,
    fuel_prices: prices,
    recent_orders: recentOrders,
    monthly_revenue: monthlyRevenue
  });
});

// All orders (with filters)
router.get('/orders', adminAuth, (req, res) => {
  const { status, driver_id, date_from, date_to, limit: lim } = req.query;
  let query = `
    SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
           l.name as location_name, l.address as location_address,
           v.name as vehicle_name, v.plate as vehicle_plate
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN locations l ON o.location_id = l.id
    LEFT JOIN vehicles v ON o.vehicle_id = v.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND o.status = ?'; params.push(status); }
  if (driver_id) { query += ' AND o.driver_id = ?'; params.push(driver_id); }
  if (date_from) { query += ' AND o.delivery_date >= ?'; params.push(date_from); }
  if (date_to) { query += ' AND o.delivery_date <= ?'; params.push(date_to); }
  query += ' ORDER BY o.created_at DESC';
  if (lim) { query += ' LIMIT ?'; params.push(parseInt(lim)); }
  res.json(db.prepare(query).all(...params));
});

// Update order (admin can reassign driver, change status, etc.)
router.put('/orders/:id', adminAuth, (req, res) => {
  const { status, driver_id, eta_minutes } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (status) {
    const progressMap = { pending: 0, confirmed: 5, driver_assigned: 10, en_route: 25, arriving: 80, fueling: 92, delivered: 100, cancelled: 0 };
    db.prepare('UPDATE orders SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, progressMap[status] ?? order.progress, req.params.id);
    db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), req.params.id, status);
  }
  if (driver_id) {
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driver_id);
    if (driver) {
      db.prepare('UPDATE orders SET driver_id = ?, driver_name = ?, driver_phone = ?, driver_plate = ?, driver_rating = ? WHERE id = ?')
        .run(driver_id, driver.name, driver.phone, driver.plate, driver.rating, req.params.id);
    }
  }
  if (eta_minutes !== undefined) {
    db.prepare('UPDATE orders SET eta_minutes = ? WHERE id = ?').run(eta_minutes, req.params.id);
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// All customers
router.get('/customers', adminAuth, (req, res) => {
  const customers = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.company, u.plan, u.created_at,
           COUNT(o.id) as order_count, COALESCE(SUM(o.total), 0) as total_spent, COALESCE(SUM(o.volume), 0) as total_litres
    FROM users u LEFT JOIN orders o ON u.id = o.user_id
    GROUP BY u.id ORDER BY total_spent DESC
  `).all();
  res.json(customers);
});

// All drivers
router.get('/drivers', adminAuth, (req, res) => {
  const drivers = db.prepare(`
    SELECT d.id, d.email, d.name, d.phone, d.plate, d.licence_number, d.rating, d.total_deliveries, d.status, d.created_at,
           COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_orders,
           COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total * 0.15 ELSE 0 END), 0) as total_earnings
    FROM drivers d LEFT JOIN orders o ON d.id = o.driver_id
    GROUP BY d.id ORDER BY d.total_deliveries DESC
  `).all();
  res.json(drivers);
});

// Update driver
router.put('/drivers/:id', adminAuth, (req, res) => {
  const { status, rating } = req.body;
  if (status) db.prepare('UPDATE drivers SET status = ? WHERE id = ?').run(status, req.params.id);
  if (rating) db.prepare('UPDATE drivers SET rating = ? WHERE id = ?').run(rating, req.params.id);
  const driver = db.prepare('SELECT id, email, name, phone, plate, licence_number, rating, total_deliveries, status FROM drivers WHERE id = ?').get(req.params.id);
  res.json(driver);
});

// All vehicles (across all users)
router.get('/vehicles', adminAuth, (req, res) => {
  const vehicles = db.prepare(`
    SELECT v.*, u.name as owner_name, u.company as owner_company
    FROM vehicles v LEFT JOIN users u ON v.user_id = u.id
    ORDER BY v.created_at DESC
  `).all();
  res.json(vehicles);
});

// Fuel prices - update
router.put('/prices/:id', adminAuth, (req, res) => {
  const { price_per_litre } = req.body;
  if (!price_per_litre) return res.status(400).json({ error: 'price_per_litre required' });
  db.prepare('UPDATE fuel_prices SET price_per_litre = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(price_per_litre, req.params.id);
  const price = db.prepare('SELECT * FROM fuel_prices WHERE id = ?').get(req.params.id);
  res.json(price);
});

// Finance overview
router.get('/finance', adminAuth, (req, res) => {
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total_revenue,
           COALESCE(SUM(total * 0.15), 0) as driver_payouts,
           COALESCE(SUM(total * 0.85), 0) as net_revenue
    FROM orders WHERE status = 'delivered'
  `).get();

  const dailyRevenue = db.prepare(`
    SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as orders
    FROM orders WHERE status = 'delivered' AND created_at >= DATE('now', '-30 days')
    GROUP BY date ORDER BY date
  `).all();

  const fuelBreakdown = db.prepare(`
    SELECT fuel_type, COUNT(*) as orders, SUM(volume) as litres, SUM(total) as revenue
    FROM orders WHERE status = 'delivered'
    GROUP BY fuel_type
  `).all();

  res.json({ ...revenue, daily_revenue: dailyRevenue, fuel_breakdown: fuelBreakdown });
});

// Dispatch - active orders overview
router.get('/dispatch', adminAuth, (req, res) => {
  const activeOrders = db.prepare(`
    SELECT o.*, u.name as customer_name, u.phone as customer_phone,
           l.name as location_name, l.address as location_address, l.lat, l.lng
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN locations l ON o.location_id = l.id
    WHERE o.status IN ('pending', 'confirmed', 'driver_assigned', 'en_route', 'arriving', 'fueling')
    ORDER BY o.created_at
  `).all();

  const availableDrivers = db.prepare("SELECT id, name, phone, plate, rating FROM drivers WHERE status = 'available'").all();

  res.json({ active_orders: activeOrders, available_drivers: availableDrivers });
});

// Assign driver to order (dispatch)
router.post('/dispatch/assign', adminAuth, (req, res) => {
  const { order_id, driver_id } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driver_id);
  if (!order || !driver) return res.status(404).json({ error: 'Order or driver not found' });

  db.prepare(`
    UPDATE orders SET driver_id = ?, driver_name = ?, driver_phone = ?, driver_plate = ?,
    driver_rating = ?, status = 'driver_assigned', progress = 10, eta_minutes = 30, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(driver_id, driver.name, driver.phone, driver.plate, driver.rating, order_id);

  db.prepare('UPDATE drivers SET status = \'on_delivery\' WHERE id = ?').run(driver_id);
  db.prepare('INSERT INTO order_events (id, order_id, event) VALUES (?,?,?)').run(uuid(), order_id, 'driver_assigned');

  res.json({ success: true });
});

module.exports = router;
