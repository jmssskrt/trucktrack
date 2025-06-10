const express = require('express');
const path = require('path');
const cors = require('cors'); // Required if your frontend and backend are on different domains/ports
const bcrypt = require('bcrypt'); // For password hashing
const jwt = require('jsonwebtoken'); // For authentication tokens

const app = express();
const PORT = process.env.PORT || 5500; // Render will provide a PORT environment variable

// --- In-memory Data Stores (Replace with a real database in production) ---
let users = [];
let trips = [];
let drivers = [];
let customers = [];
let vehicles = [];

// Dummy initial data for demonstration
users.push({ id: 1, username: 'test', password: '$2b$10$T.sP9K5d1V6Z7Y8I9J0X.uP9E5R8S7T.t.c.E.f.h.G.x.y.z.A.B.C', email: 'test@example.com' }); // Password: 'password'
drivers.push({ id: 1, name: 'Mang Banong', license: 'DRV001', phone: '09123456789', email: 'mang.banong@example.com', status: 'Active' });
drivers.push({ id: 2, name: 'Aling Nena', license: 'DRV002', phone: '09987654321', email: 'aling.nena@example.com', status: 'Active' });
customers.push({ id: 1, name: 'James', email: 'james@example.com', phone: '09000000001', address: '123 Main St' });
vehicles.push({ id: 1, model: 'Nissan Terra', year: 2022, plate_number: 'NPL888', last_service: '2024-01-01', status: 'Active' });

// JWT Secret (Use a strong, long, and secret key in production environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Middleware to parse JSON bodies
app.use(express.json());

// Enable CORS for all requests (adjust as needed for security in production)
app.use(cors());

// Serve static frontend files
// This assumes your 'baba/bababa' directory is in the same parent directory as your 'server' directory
app.use(express.static(path.join(__dirname, '..', 'baba', 'bababa')));

// --- API Endpoints ---

// Middleware to protect routes (simplified for in-memory example)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // No token

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Invalid token
        req.user = user;
        next();
    });
}

// Register Endpoint
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (users.find(u => u.username === username)) {
        return res.status(409).json({ message: 'Username already exists' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1, username, password: hashedPassword };
        users.push(newUser);
        res.status(201).json({ message: 'Registration successful. Please login.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    try {
        if (await bcrypt.compare(password, user.password)) {
            const accessToken = jwt.sign({ username: user.username, id: user.id }, JWT_SECRET, { expiresIn: '1h' });
            res.json({ message: 'Login successful!', token: accessToken });
        } else {
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// Trips API
app.get('/api/trips', authenticateToken, (req, res) => {
    // In a real app, filter by user/driver if applicable
    res.json(trips);
});

app.post('/api/trips', authenticateToken, (req, res) => {
    const newTrip = { id: trips.length ? Math.max(...trips.map(t => t.id)) + 1 : 1, ...req.body };
    trips.push(newTrip);
    res.status(201).json(newTrip);
});

app.put('/api/trips/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = trips.findIndex(t => String(t.id) === String(id));
    if (index > -1) {
        trips[index] = { ...trips[index], ...req.body, id: Number(id) };
        res.json(trips[index]);
    } else {
        res.status(404).json({ message: 'Trip not found' });
    }
});

app.delete('/api/trips/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const initialLength = trips.length;
    trips = trips.filter(t => String(t.id) !== String(id));
    if (trips.length < initialLength) {
        res.status(204).send(); // No Content
    } else {
        res.status(404).json({ message: 'Trip not found' });
    }
});

// Drivers API
app.get('/api/drivers', authenticateToken, (req, res) => {
    res.json(drivers);
});

app.post('/api/drivers', authenticateToken, (req, res) => {
    const newDriver = { id: drivers.length ? Math.max(...drivers.map(d => d.id)) + 1 : 1, ...req.body };
    drivers.push(newDriver);
    res.status(201).json(newDriver);
});

app.put('/api/drivers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = drivers.findIndex(d => String(d.id) === String(id));
    if (index > -1) {
        drivers[index] = { ...drivers[index], ...req.body, id: Number(id) };
        res.json(drivers[index]);
    } else {
        res.status(404).json({ message: 'Driver not found' });
    }
});

app.delete('/api/drivers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const initialLength = drivers.length;
    drivers = drivers.filter(d => String(d.id) !== String(id));
    if (drivers.length < initialLength) {
        res.status(204).send(); // No Content
    } else {
        res.status(404).json({ message: 'Driver not found' });
    }
});

// Customers API
app.get('/api/customers', authenticateToken, (req, res) => {
    res.json(customers);
});

app.post('/api/customers', authenticateToken, (req, res) => {
    const newCustomer = { id: customers.length ? Math.max(...customers.map(c => c.id)) + 1 : 1, ...req.body };
    customers.push(newCustomer);
    res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = customers.findIndex(c => String(c.id) === String(id));
    if (index > -1) {
        customers[index] = { ...customers[index], ...req.body, id: Number(id) };
        res.json(customers[index]);
    } else {
        res.status(404).json({ message: 'Customer not found' });
    }
});

app.delete('/api/customers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const initialLength = customers.length;
    customers = customers.filter(c => String(c.id) !== String(id));
    if (customers.length < initialLength) {
        res.status(204).send(); // No Content
    } else {
        res.status(404).json({ message: 'Customer not found' });
    }
});

// Vehicles API
app.get('/api/vehicles', authenticateToken, (req, res) => {
    res.json(vehicles);
});

app.post('/api/vehicles', authenticateToken, (req, res) => {
    const newVehicle = { id: vehicles.length ? Math.max(...vehicles.map(v => v.id)) + 1 : 1, ...req.body };
    vehicles.push(newVehicle);
    res.status(201).json(newVehicle);
});

app.put('/api/vehicles/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = vehicles.findIndex(v => String(v.id) === String(id));
    if (index > -1) {
        vehicles[index] = { ...vehicles[index], ...req.body, id: Number(id) };
        res.json(vehicles[index]);
    } else {
        res.status(404).json({ message: 'Vehicle not found' });
    }
});

app.delete('/api/vehicles/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const initialLength = vehicles.length;
    vehicles = vehicles.filter(v => String(v.id) !== String(id));
    if (vehicles.length < initialLength) {
        res.status(204).send(); // No Content
    } else {
        res.status(404).json({ message: 'Vehicle not found' });
    }
});

// Catch-all to serve your main HTML file for any other frontend routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'baba', 'bababa', 'truck.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 