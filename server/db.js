const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { randomUUID: uuid } = require('crypto');

// Use /tmp for cloud deployments, local path otherwise
const dbPath = process.env.DB_PATH || path.join(process.env.RAILWAY_ENVIRONMENT ? '/tmp' : __dirname, '..', 'fuel.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    company TEXT DEFAULT 'Bilcoguard Limited',
    plan TEXT DEFAULT 'premium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    plate TEXT NOT NULL,
    fuel_type TEXT NOT NULL DEFAULT 'diesel',
    tank_capacity INTEGER DEFAULT 80,
    icon TEXT DEFAULT '🚙',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL,
    lng REAL,
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fuel_prices (
    id TEXT PRIMARY KEY,
    fuel_type TEXT UNIQUE NOT NULL,
    price_per_litre REAL NOT NULL,
    icon TEXT DEFAULT '🟡',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    vehicle_id TEXT REFERENCES vehicles(id),
    location_id TEXT REFERENCES locations(id),
    fuel_type TEXT NOT NULL,
    volume INTEGER NOT NULL,
    price_per_litre REAL NOT NULL,
    total REAL NOT NULL,
    delivery_date TEXT NOT NULL,
    delivery_time TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    driver_id TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    driver_plate TEXT,
    driver_rating REAL DEFAULT 4.9,
    progress INTEGER DEFAULT 0,
    eta_minutes INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    event TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    meta TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    plate TEXT,
    licence_number TEXT,
    vehicle_id TEXT,
    rating REAL DEFAULT 4.8,
    total_deliveries INTEGER DEFAULT 0,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Seed Data ───────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  console.log('🌱 Seeding database...');

  // Demo user
  const userId = uuid();
  const hashedPw = bcrypt.hashSync('bilcoguard2026', 10);
  db.prepare(`
    INSERT INTO users (id, email, password, name, phone, company, plan)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, 'peter@bilcoguard.com', hashedPw, 'Peter Ndhlovu', '+260977123456', 'Bilcoguard Limited', 'premium');

  // Vehicles
  const vehicles = [
    { name: 'Toyota Hilux', plate: 'BAH 1234', fuel: 'diesel', tank: 80, icon: '🚙' },
    { name: 'Land Cruiser 300', plate: 'ABZ 5678', fuel: 'petrol', tank: 110, icon: '🚗' },
    { name: 'CAT 320 Excavator', plate: 'FLEET-01', fuel: 'diesel', tank: 350, icon: '🚜' },
    { name: 'Isuzu FTR Truck', plate: 'BAC 9012', fuel: 'diesel', tank: 200, icon: '🚛' },
  ];
  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (id, user_id, name, plate, fuel_type, tank_capacity, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const vehicleIds = [];
  for (const v of vehicles) {
    const vid = uuid();
    vehicleIds.push(vid);
    insertVehicle.run(vid, userId, v.name, v.plate, v.fuel, v.tank, v.icon);
  }

  // Locations
  const locations = [
    { name: 'Bilcoguard Head Office', address: 'Plot 2847, Leopards Hill Road, Lusaka', lat: -15.4167, lng: 28.3222, def: 1 },
    { name: 'Bilcoguard Warehouse', address: 'Industrial Area, Kafue Road, Lusaka', lat: -15.4400, lng: 28.2900, def: 0 },
    { name: 'Mine Site — EL 42197', address: 'Mkushi District, Central Province', lat: -13.6200, lng: 29.3900, def: 0 },
  ];
  const insertLoc = db.prepare(`
    INSERT INTO locations (id, user_id, name, address, lat, lng, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const locIds = [];
  for (const l of locations) {
    const lid = uuid();
    locIds.push(lid);
    insertLoc.run(lid, userId, l.name, l.address, l.lat, l.lng, l.def);
  }

  // Fuel prices
  const prices = [
    { type: 'diesel', price: 28.50, icon: '🟡' },
    { type: 'petrol', price: 30.20, icon: '🟢' },
    { type: 'premium', price: 33.80, icon: '🔵' },
  ];
  const insertPrice = db.prepare(`
    INSERT INTO fuel_prices (id, fuel_type, price_per_litre, icon)
    VALUES (?, ?, ?, ?)
  `);
  for (const p of prices) {
    insertPrice.run(uuid(), p.type, p.price, p.icon);
  }

  // Sample completed orders
  const sampleOrders = [
    { fuel: 'diesel', vol: 200, price: 28.50, date: '2026-03-05', time: '10:00', status: 'delivered', vIdx: 0, lIdx: 0 },
    { fuel: 'petrol', vol: 80, price: 30.20, date: '2026-02-28', time: '14:00', status: 'delivered', vIdx: 1, lIdx: 0 },
    { fuel: 'diesel', vol: 350, price: 28.50, date: '2026-02-20', time: '08:00', status: 'delivered', vIdx: 2, lIdx: 2 },
    { fuel: 'diesel', vol: 120, price: 28.50, date: '2026-03-08', time: '14:00', status: 'en_route', vIdx: 0, lIdx: 0 },
  ];
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, order_number, user_id, vehicle_id, location_id, fuel_type, volume, price_per_litre, total, delivery_date, delivery_time, status, driver_name, driver_phone, driver_plate, progress, eta_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO order_events (id, order_id, event, timestamp)
    VALUES (?, ?, ?, ?)
  `);

  let orderNum = 847;
  for (const o of sampleOrders) {
    const oid = uuid();
    const onum = `BG-2026-${String(orderNum++).padStart(4, '0')}`;
    const total = o.vol * o.price;
    const prog = o.status === 'delivered' ? 100 : o.status === 'en_route' ? 45 : 0;
    const eta = o.status === 'en_route' ? 22 : null;

    insertOrder.run(oid, onum, userId, vehicleIds[o.vIdx], locIds[o.lIdx],
      o.fuel, o.vol, o.price, total, o.date, o.time, o.status,
      'Joseph Mwanza', '+260966789012', 'ABT 4421', prog, eta);

    // Add events
    const events = ['order_placed', 'driver_assigned'];
    if (o.status === 'en_route' || o.status === 'delivered') events.push('en_route');
    if (o.status === 'delivered') events.push('arriving', 'fueling', 'completed');

    for (const ev of events) {
      insertEvent.run(uuid(), oid, ev, o.date + 'T13:' + String(30 + events.indexOf(ev) * 5).padStart(2, '0') + ':00');
    }
  }

  // Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, title, body, type)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertNotif.run(uuid(), userId, 'Delivery En Route', 'Joseph Mwanza is on the way with your 120L Diesel order.', 'delivery');
  insertNotif.run(uuid(), userId, 'Price Update', 'Diesel prices updated to K28.50/L effective today.', 'info');
  insertNotif.run(uuid(), userId, 'Order Delivered', 'Your 200L Diesel delivery to Bilcoguard HQ is complete.', 'success');

  // Demo drivers
  const driverPw = bcrypt.hashSync('driver2026', 10);
  const driverId1 = uuid();
  const driverId2 = uuid();
  db.prepare('INSERT INTO drivers (id, email, password, name, phone, plate, licence_number, rating, total_deliveries, status) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(driverId1, 'driver@bilcoguard.com', driverPw, 'Joseph Mwanza', '+260966789012', 'ABT 4421', 'DL-2024-1234', 4.9, 156, 'available');
  db.prepare('INSERT INTO drivers (id, email, password, name, phone, plate, licence_number, rating, total_deliveries, status) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(driverId2, 'driver2@bilcoguard.com', driverPw, 'Moses Banda', '+260977654321', 'ABT 5567', 'DL-2023-5678', 4.7, 89, 'available');

  // Update existing orders with driver_id
  db.prepare("UPDATE orders SET driver_id = ? WHERE driver_name = 'Joseph Mwanza'").run(driverId1);

  // Admin user
  const adminPw = bcrypt.hashSync('admin2026', 10);
  db.prepare('INSERT INTO admins (id, email, password, name, role) VALUES (?,?,?,?,?)')
    .run(uuid(), 'admin@bilcoguard.com', adminPw, 'Peter Ndhlovu', 'super_admin');

  console.log('✅ Database seeded successfully');
}

module.exports = db;
