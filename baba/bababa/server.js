const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs'); // Will re-enable hashing later
const jwt = require('jsonwebtoken'); // Will re-enable JWT later

const app = express();
const port = process.env.PORT || 5500;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Universal Request Logger (MUST be the very first middleware)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
    console.log('Request Headers:', req.headers);
    next();
});

// Middleware - Order is crucial!
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); // Essential for parsing JSON request bodies
app.use(express.urlencoded({ extended: true })); // Essential for parsing URL-encoded request bodies

// Database connection (defined early but initialized after tables functions)
let db;

// Create tables functions
function createTables() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin TEXT,
            origin_lat REAL,
            origin_lng REAL,
            destination TEXT NOT NULL,
            destination_lat REAL,
            destination_lng REAL,
            date TEXT NOT NULL,
            driver_id INTEGER,
            customer_id INTEGER,
            vehicle_id INTEGER,
            status TEXT DEFAULT 'Scheduled',
            estimated_travel_time TEXT,
            estimated_arrival_time TEXT,
            FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            license TEXT NOT NULL,
            status TEXT DEFAULT 'Active',
            phone TEXT,
            email TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT NOT NULL,
            year INTEGER NOT NULL,
            plate_number TEXT NOT NULL,
            last_service TEXT,
            status TEXT DEFAULT 'Active'
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT NOT NULL,
            address TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            description TEXT
        )`);
    });
}

function createUsersTable() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )`);
}

// Initialize database connection
db = new sqlite3.Database('trucktrack.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to SQLite database');
        createTables();
        createUsersTable();
    }
});


// Auth middleware (Temporarily disabled - always calls next() for debugging)
function authenticateToken(req, res, next) {
    // const authHeader = req.headers['authorization'];
    // const token = authHeader && authHeader.split(' ')[1];
    // if (!token) return res.status(401).json({ error: 'No token provided' });
    // jwt.verify(token, JWT_SECRET, (err, user) => {
    //     if (err) return res.status(403).json({ error: 'Invalid token' });
    //     req.user = user;
    //     next();
    // });
    next(); // Allow all requests for now to debug body parsing
}

// --- PUBLIC AUTH ENDPOINTS (NO AUTHENTICATION REQUIRED) ---
// Register endpoint
app.post('/api/register', (req, res) => {
    console.log('Received POST request to /api/register');
    console.log('Request Body:', req.body); // Check if body is parsed now
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    // Store password in plaintext for now (will re-add hashing later)
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function(err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(409).json({ error: 'Username already exists' });
            }
            console.error('Database error during registration:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ success: true, message: 'Registration successful' });
    });
});

// Login endpoint
app.post('/api/login', (req, res) => {
    console.log('Received POST request to /api/login');
    console.log('Request Body:', req.body); // Check if body is parsed now
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        // Compare password in plaintext for now (will re-add hashing later)
        if (password !== user.password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // No JWT for now, just success
        res.json({ success: true, user: { id: user.id, username: user.username }, message: 'Login successful' });
    });
});

// --- PROTECTED API ENDPOINTS (AUTHENTICATION WILL BE RE-ENABLED LATER) ---

// GET endpoints
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
    const stats = {
        totalTrips: 0,
        activeDrivers: 0,
        totalVehicles: 0,
        totalCustomers: 0,
        totalExpenses: 0
    };

    db.get('SELECT COUNT(*) as count FROM trips', (err, row) => {
        if (err) {
            console.error('Error getting trip count:', err);
            return res.status(500).json({ error: 'Failed to get dashboard stats' });
        }
        stats.totalTrips = row.count;

        db.get('SELECT COUNT(*) as count FROM drivers WHERE status = "Active"', (err, row) => {
            if (err) {
                console.error('Error getting active drivers count:', err);
                return res.status(500).json({ error: 'Failed to get dashboard stats' });
            }
            stats.activeDrivers = row.count;

            db.get('SELECT COUNT(*) as count FROM vehicles', (err, row) => {
                if (err) {
                    console.error('Error getting vehicles count:', err);
                    return res.status(500).json({ error: 'Failed to get dashboard stats' });
                }
                stats.totalVehicles = row.count;

                db.get('SELECT COUNT(*) as count FROM customers', (err, row) => {
                    if (err) {
                        console.error('Error getting customers count:', err);
                        return res.status(500).json({ error: 'Failed to get dashboard stats' });
                    }
                    stats.totalCustomers = row.count;

                    db.get('SELECT SUM(amount) as total FROM expenses', (err, row) => {
                        if (err) {
                            console.error('Error getting expenses total:', err);
                            return res.status(500).json({ error: 'Failed to get dashboard stats' });
                        }
                        stats.totalExpenses = row.total || 0;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

app.get('/api/trips', authenticateToken, (req, res) => {
    console.log('Received GET request for /api/trips');
    const query = `
        SELECT
            t.id,
            t.origin,
            t.origin_lat,
            t.origin_lng,
            t.destination,
            t.destination_lat,
            t.destination_lng,
            t.date,
            t.status,
            t.estimated_travel_time,
            t.estimated_arrival_time,
            d.name AS driver_name,
            c.name AS customer_name,
            v.model AS vehicle_model,
            v.plate_number AS vehicle_plate_number
        FROM trips t
        LEFT JOIN drivers d ON t.driver_id = d.id
        LEFT JOIN customers c ON t.customer_id = c.id
        LEFT JOIN vehicles v ON t.vehicle_id = v.id
        ORDER BY t.date DESC
    `;
    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error getting trips:', err);
            return res.status(500).json({ error: 'Failed to get trips' });
        }
        console.log('Sending trips data:', rows);
        res.json(rows);
    });
});

app.get('/api/drivers', authenticateToken, (req, res) => {
    db.all('SELECT * FROM drivers ORDER BY name', (err, rows) => {
        if (err) {
            console.error('Error getting drivers:', err);
            return res.status(500).json({ error: 'Failed to get drivers' });
        }
        res.json(rows);
    });
});

app.get('/api/customers', authenticateToken, (req, res) => {
    db.all('SELECT * FROM customers ORDER BY name', (err, rows) => {
        if (err) {
            console.error('Error getting customers:', err);
            return res.status(500).json({ error: 'Failed to get customers' });
        }
        res.json(rows);
    });
});

app.get('/api/vehicles', authenticateToken, (req, res) => {
    db.all('SELECT * FROM vehicles ORDER BY model', (err, rows) => {
        if (err) {
            console.error('Error getting vehicles:', err);
            return res.status(500).json({ error: 'Failed to get vehicles' });
        }
        res.json(rows);
    });
});

app.get('/api/expenses', authenticateToken, (req, res) => {
    db.all('SELECT * FROM expenses ORDER BY date DESC', (err, rows) => {
        if (err) {
            console.error('Error getting expenses:', err);
            return res.status(500).json({ error: 'Failed to get expenses' });
        }
        res.json(rows);
    });
});

// POST endpoints
app.post('/api/trips', authenticateToken, (req, res) => {
    console.log('Received POST request for /api/trips');
    console.log('Request Body:', req.body);
    const { origin, origin_lat, origin_lng, destination, destination_lat, destination_lng, date, driver_id, customer_id, vehicle_id, status, estimated_travel_time, estimated_arrival_time } = req.body;

    if (!origin || !origin_lat || !origin_lng || !destination || !destination_lat || !destination_lng || !date || !driver_id || !customer_id || !vehicle_id) {
        return res.status(400).json({ error: 'Missing required trip fields (origin, destination, date, driver, customer, vehicle, and their coordinates are all required)' });
    }

    db.run(
        'INSERT INTO trips (origin, origin_lat, origin_lng, destination, destination_lat, destination_lng, date, driver_id, customer_id, vehicle_id, status, estimated_travel_time, estimated_arrival_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [origin, origin_lat, origin_lng, destination, destination_lat, destination_lng, date, driver_id, customer_id, vehicle_id, status || 'Pending', estimated_travel_time || null, estimated_arrival_time || null],
        function(err) {
            if (err) {
                console.error('Error adding trip:', err);
                return res.status(500).json({ error: 'Failed to add trip' });
            }
            console.log('Trip added to DB with ID:', this.lastID);
            res.status(201).json({ id: this.lastID, origin, origin_lat, origin_lng, destination, destination_lat, destination_lng, date, driver_id, customer_id, vehicle_id, status: status || 'Pending', estimated_travel_time: estimated_travel_time || null, estimated_arrival_time: estimated_arrival_time || null });
        }
    );
});

app.post('/api/drivers', authenticateToken, (req, res) => {
    const { name, license, status, phone, email } = req.body;
    
    if (!name || !license) {
        return res.status(400).json({ error: 'Name and license are required' });
    }
    
    const sql = 'INSERT INTO drivers (name, license, status, phone, email) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [name, license, status || 'Active', phone || '', email || ''], function(err) {
        if (err) {
            console.error('Error adding driver:', err);
            return res.status(500).json({ error: 'Failed to add driver' });
        }
        res.status(201).json({
            id: this.lastID,
            name,
            license,
            status: status || 'Active',
            phone,
            email,
            message: 'Driver added successfully'
        });
    });
});

app.post('/api/customers', authenticateToken, (req, res) => {
    const { name, email, phone, address } = req.body;
    
    if (!name || !phone || !address) {
        return res.status(400).json({ error: 'Name, phone, and address are required' });
    }
    
    const sql = 'INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)';
    db.run(sql, [name, email || '', phone, address], function(err) {
        if (err) {
            console.error('Error adding customer:', err);
            return res.status(500).json({ error: 'Failed to add customer' });
        }
        res.status(201).json({
            id: this.lastID,
            name,
            email,
            phone,
            address,
            message: 'Customer added successfully'
        });
    });
});

app.post('/api/vehicles', authenticateToken, (req, res) => {
    const { model, year, plate_number, last_service, status } = req.body;
    
    if (!model || !year || !plate_number) {
        return res.status(400).json({ error: 'Model, year, and plate number are required' });
    }
    
    const sql = 'INSERT INTO vehicles (model, year, plate_number, last_service, status) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [model, year, plate_number, last_service || null, status || 'Active'], function(err) {
        if (err) {
            console.error('Error adding vehicle:', err);
            return res.status(500).json({ error: 'Failed to add vehicle' });
        }
        res.status(201).json({
            id: this.lastID,
            model,
            year,
            plate_number,
            last_service,
            status: status || 'Active',
            message: 'Vehicle added successfully'
        });
    });
});

app.post('/api/expenses', authenticateToken, (req, res) => {
    const { type, amount, date, description } = req.body;
    
    if (!type || !amount || !date) {
        return res.status(400).json({ error: 'Type, amount, and date are required' });
    }
    
    const sql = 'INSERT INTO expenses (type, amount, date, description) VALUES (?, ?, ?, ?)';
    db.run(sql, [type, amount, date, description || ''], function(err) {
        if (err) {
            console.error('Error adding expense:', err);
            return res.status(500).json({ error: 'Failed to add expense' });
        }
        res.status(201).json({
            id: this.lastID,
            type,
            amount,
            date,
            description,
            message: 'Expense added successfully'
        });
    });
});

// DELETE endpoints
app.delete('/api/trips/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM trips WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Error deleting trip:', err);
            return res.status(500).json({ error: 'Failed to delete trip' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Trip not found' });
        }
        res.json({ message: 'Trip deleted successfully' });
    });
});

app.delete('/api/drivers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM drivers WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Error deleting driver:', err);
            return res.status(500).json({ error: 'Failed to delete driver' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        res.json({ message: 'Driver deleted successfully' });
    });
});

app.delete('/api/customers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM customers WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Error deleting customer:', err);
            return res.status(500).json({ error: 'Failed to delete customer' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json({ message: 'Customer deleted successfully' });
    });
});

app.delete('/api/vehicles/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM vehicles WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Error deleting vehicle:', err);
            return res.status(500).json({ error: 'Failed to delete vehicle' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        res.json({ message: 'Vehicle deleted successfully' });
    });
});

app.delete('/api/expenses/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Error deleting expense:', err);
            return res.status(500).json({ error: 'Failed to delete expense' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json({ message: 'Expense deleted successfully' });
    });
});

// PUT endpoints
app.put('/api/trips/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { origin, origin_lat, origin_lng, destination, destination_lat, destination_lng, date, driver_id, customer_id, vehicle_id, status, estimated_travel_time, estimated_arrival_time } = req.body;
    
    // Retrieve current trip data to merge with updated fields
    db.get('SELECT * FROM trips WHERE id = ?', [id], (err, trip) => {
        if (err) {
            console.error('Error fetching trip for update:', err);
            return res.status(500).json({ error: 'Failed to update trip' });
        }
        if (!trip) {
            return res.status(404).json({ error: 'Trip not found' });
        }

        const updatedTrip = {
            ...trip,
            origin: origin !== undefined ? origin : trip.origin,
            origin_lat: origin_lat !== undefined ? origin_lat : trip.origin_lat,
            origin_lng: origin_lng !== undefined ? origin_lng : trip.origin_lng,
            destination: destination !== undefined ? destination : trip.destination,
            destination_lat: destination_lat !== undefined ? destination_lat : trip.destination_lat,
            destination_lng: destination_lng !== undefined ? destination_lng : trip.destination_lng,
            date: date !== undefined ? date : trip.date,
            driver_id: driver_id !== undefined ? driver_id : trip.driver_id,
            customer_id: customer_id !== undefined ? customer_id : trip.customer_id,
            vehicle_id: vehicle_id !== undefined ? vehicle_id : trip.vehicle_id,
            status: status !== undefined ? status : trip.status,
            estimated_travel_time: estimated_travel_time !== undefined ? estimated_travel_time : trip.estimated_travel_time,
            estimated_arrival_time: estimated_arrival_time !== undefined ? estimated_arrival_time : trip.estimated_arrival_time
        };

        db.run(
            'UPDATE trips SET origin = ?, origin_lat = ?, origin_lng = ?, destination = ?, destination_lat = ?, destination_lng = ?, date = ?, driver_id = ?, customer_id = ?, vehicle_id = ?, status = ?, estimated_travel_time = ?, estimated_arrival_time = ? WHERE id = ?',
            [updatedTrip.origin, updatedTrip.origin_lat, updatedTrip.origin_lng, updatedTrip.destination, updatedTrip.destination_lat, updatedTrip.destination_lng, updatedTrip.date, updatedTrip.driver_id, updatedTrip.customer_id, updatedTrip.vehicle_id, updatedTrip.status, updatedTrip.estimated_travel_time, updatedTrip.estimated_arrival_time, id],
            function(err) {
                if (err) {
                    console.error('Error updating trip:', err);
                    return res.status(500).json({ error: 'Failed to update trip' });
                }
                res.json({ message: 'Trip updated successfully', changes: this.changes, trip: updatedTrip });
            }
        );
    });
});

app.put('/api/drivers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, license, status, phone, email } = req.body;

    db.get('SELECT * FROM drivers WHERE id = ?', [id], (err, driver) => {
        if (err) {
            console.error('Error fetching driver for update:', err);
            return res.status(500).json({ error: 'Failed to update driver' });
        }
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        const updatedDriver = {
            ...driver,
            name: name !== undefined ? name : driver.name,
            license: license !== undefined ? license : driver.license,
            status: status !== undefined ? status : driver.status,
            phone: phone !== undefined ? phone : driver.phone,
            email: email !== undefined ? email : driver.email
        };

        db.run(
            'UPDATE drivers SET name = ?, license = ?, status = ?, phone = ?, email = ? WHERE id = ?',
            [updatedDriver.name, updatedDriver.license, updatedDriver.status, updatedDriver.phone, updatedDriver.email, id],
            function(err) {
                if (err) {
                    console.error('Error updating driver:', err);
                    return res.status(500).json({ error: 'Failed to update driver' });
                }
                res.json({ message: 'Driver updated successfully', changes: this.changes, driver: updatedDriver });
            }
        );
    });
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;

    db.get('SELECT * FROM customers WHERE id = ?', [id], (err, customer) => {
        if (err) {
            console.error('Error fetching customer for update:', err);
            return res.status(500).json({ error: 'Failed to update customer' });
        }
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const updatedCustomer = {
            ...customer,
            name: name !== undefined ? name : customer.name,
            email: email !== undefined ? email : customer.email,
            phone: phone !== undefined ? phone : customer.phone,
            address: address !== undefined ? address : customer.address
        };

        db.run(
            'UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?',
            [updatedCustomer.name, updatedCustomer.email, updatedCustomer.phone, updatedCustomer.address, id],
            function(err) {
                if (err) {
                    console.error('Error updating customer:', err);
                    return res.status(500).json({ error: 'Failed to update customer' });
                }
                res.json({ message: 'Customer updated successfully', changes: this.changes, customer: updatedCustomer });
            }
        );
    });
});

app.put('/api/vehicles/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { model, year, plate_number, last_service, status } = req.body;

    db.get('SELECT * FROM vehicles WHERE id = ?', [id], (err, vehicle) => {
        if (err) {
            console.error('Error fetching vehicle for update:', err);
            return res.status(500).json({ error: 'Failed to update vehicle' });
        }
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        const updatedVehicle = {
            ...vehicle,
            model: model !== undefined ? model : vehicle.model,
            year: year !== undefined ? year : vehicle.year,
            plate_number: plate_number !== undefined ? plate_number : vehicle.plate_number,
            last_service: last_service !== undefined ? last_service : vehicle.last_service,
            status: status !== undefined ? status : vehicle.status
        };

        db.run(
            'UPDATE vehicles SET model = ?, year = ?, plate_number = ?, last_service = ?, status = ? WHERE id = ?',
            [updatedVehicle.model, updatedVehicle.year, updatedVehicle.plate_number, updatedVehicle.last_service, updatedVehicle.status, id],
            function(err) {
                if (err) {
                    console.error('Error updating vehicle:', err);
                    return res.status(500).json({ error: 'Failed to update vehicle' });
                }
                res.json({ message: 'Vehicle updated successfully', changes: this.changes, vehicle: updatedVehicle });
            }
        );
    });
});

app.put('/api/expenses/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { type, amount, date, description } = req.body;

    db.get('SELECT * FROM expenses WHERE id = ?', [id], (err, expense) => {
        if (err) {
            console.error('Error fetching expense for update:', err);
            return res.status(500).json({ error: 'Failed to update expense' });
        }
        if (!expense) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        const updatedExpense = {
            ...expense,
            type: type !== undefined ? type : expense.type,
            amount: amount !== undefined ? amount : expense.amount,
            date: date !== undefined ? date : expense.date,
            description: description !== undefined ? description : expense.description
        };

        db.run(
            'UPDATE expenses SET type = ?, amount = ?, date = ?, description = ? WHERE id = ?',
            [updatedExpense.type, updatedExpense.amount, updatedExpense.date, updatedExpense.description, id],
            function(err) {
                if (err) {
                    console.error('Error updating expense:', err);
                    return res.status(500).json({ error: 'Failed to update expense' });
                }
                res.json({ message: 'Expense updated successfully', changes: this.changes, expense: updatedExpense });
            }
        );
    });
});

// Serve static files (ensure this is at the end of your routes)
app.use(express.static(path.join(__dirname)));

// Serve specific HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth.html'));
});

app.get('/truck.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'truck.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});