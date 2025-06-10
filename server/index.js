const express = require('express');
const path = require('path');
const cors = require('cors'); // Required if your frontend and backend are on different domains/ports
const bcrypt = require('bcrypt'); // For password hashing
const jwt = require('jsonwebtoken'); // For authentication tokens
const fs = require('fs'); // Add fs module for file system operations

const app = express();
const PORT = process.env.PORT || 5500; // Render will provide a PORT environment variable

const DATA_FILE = path.join(__dirname, 'data.json'); // Define the path to your data file

// --- Persistent Data Stores (Quick Fix for in-memory data) ---
let users = [];
let trips = [];
let drivers = [];
let customers = [];
let vehicles = [];
let expenses = [];

// Function to load data from file
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            users = data.users || [];
            trips = data.trips || [];
            drivers = data.drivers || [];
            customers = data.customers || [];
            vehicles = data.vehicles || [];
            expenses = data.expenses || [];
            console.log('Data loaded from data.json');
        } else {
            console.log('data.json not found, initializing with empty data.');
            saveData(); // Create the file if it doesn't exist with initial empty data
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Function to save data to file
function saveData() {
    try {
        const data = { users, trips, drivers, customers, vehicles, expenses };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('Data saved to data.json');
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Load data when server starts
loadData();

// JWT Secret (Use a strong, long, and secret key in production environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Middleware to parse JSON bodies
app.use(express.json());

// Enable CORS for all requests (adjust as needed for security in production)
app.use(cors());

// Middleware to protect routes (simplified for in-memory example)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Authentication token required.' }); // No token
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token.' }); // Invalid token
        }
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
        saveData(); // Save data after a new user is registered
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

// Dashboard Stats API
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
    const totalTrips = trips.length;
    const activeTrips = trips.filter(trip => trip.status === 'Active' || trip.status === 'Pending').length;
    const totalExpenses = expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
    const totalDrivers = drivers.length;
    res.json({ totalTrips, activeTrips, totalExpenses, totalDrivers });
});

// Trips API
app.get('/api/trips', authenticateToken, (req, res) => {
    // In a real app, filter by user/driver if applicable
    res.json(trips);
});

app.post('/api/trips', authenticateToken, (req, res) => {
    const newTrip = { id: trips.length ? Math.max(...trips.map(t => t.id)) + 1 : 1, ...req.body };
    trips.push(newTrip);
    saveData(); // Save data after adding a new trip
    res.status(201).json(newTrip);
});

app.put('/api/trips/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = trips.findIndex(t => String(t.id) === String(id));
    if (index > -1) {
        trips[index] = { ...trips[index], ...req.body, id: Number(id) };
        saveData(); // Save data after updating a trip
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
        saveData(); // Save data after deleting a trip
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
    saveData(); // Save data after adding a new driver
    res.status(201).json(newDriver);
});

app.put('/api/drivers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = drivers.findIndex(d => String(d.id) === String(id));
    if (index > -1) {
        drivers[index] = { ...drivers[index], ...req.body, id: Number(id) };
        saveData(); // Save data after updating a driver
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
        saveData(); // Save data after deleting a driver
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
    saveData(); // Save data after adding a new customer
    res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = customers.findIndex(c => String(c.id) === String(id));
    if (index > -1) {
        customers[index] = { ...customers[index], ...req.body, id: Number(id) };
        saveData(); // Save data after updating a customer
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
        saveData(); // Save data after deleting a customer
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
    saveData(); // Save data after adding a new vehicle
    res.status(201).json(newVehicle);
});

app.put('/api/vehicles/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = vehicles.findIndex(v => String(v.id) === String(id));
    if (index > -1) {
        vehicles[index] = { ...vehicles[index], ...req.body, id: Number(id) };
        saveData(); // Save data after updating a vehicle
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
        saveData(); // Save data after deleting a vehicle
        res.status(204).send(); // No Content
    } else {
        res.status(404).json({ message: 'Vehicle not found' });
    }
});

// Expenses API
app.get('/api/expenses', authenticateToken, (req, res) => {
    res.json(expenses);
});

app.post('/api/expenses', authenticateToken, (req, res) => {
    const newExpense = { id: expenses.length ? Math.max(...expenses.map(e => e.id)) + 1 : 1, ...req.body };
    expenses.push(newExpense);
    saveData(); // Save data after adding a new expense
    res.status(201).json(newExpense);
});

// Catch-all for undefined API routes (should come before static file serving and main HTML fallback)
app.use('/api', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
});

// Serve static frontend files (should come after all API routes)
app.use(express.static(path.join(__dirname, '..', 'baba', 'bababa')));

// Catch-all to serve your main HTML file for any other frontend routes (should be last)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'baba', 'bababa', 'truck.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 