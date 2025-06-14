const express = require('express');
const path = require('path');
const cors = require('cors'); // Required if your frontend and backend are on different domains/ports
const bcrypt = require('bcrypt'); // For password hashing
const jwt = require('jsonwebtoken'); // For authentication tokens
const fs = require('fs'); // Add fs module for file system operations
const nodemailer = require('nodemailer'); // Add this at the top with other requires
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5500; // Render will provide a PORT environment variable

const DATA_FILE = path.join(__dirname, 'data.json'); // Define the path to your data file

// Constants for role keys
const MASTER_ADMIN_KEY = '000111';
const ADMIN_KEY = '111000';

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Function to generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Function to send OTP email
async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP for TruckTrack Registration',
        text: `Your OTP for registration is: ${otp}. This OTP will expire in 10 minutes.`
    };
    await transporter.sendMail(mailOptions);
}

// --- Persistent Data Stores (Quick Fix for in-memory data) ---
let users = [];
let trips = [];
let drivers = [];
let customers = [];
let vehicles = [];
let expenses = [];
let otpStore = new Map(); // Store OTPs temporarily

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
    const { username, password, email, role, key, company } = req.body;

    if (users.find(u => u.username === username)) {
        return res.status(409).json({ message: 'Username already exists' });
    }

    // Validate role and key
    if (role === 'master_admin' && key !== MASTER_ADMIN_KEY) {
        return res.status(403).json({ message: 'Invalid master admin key' });
    }
    if (role === 'admin' && key !== ADMIN_KEY) {
        return res.status(403).json({ message: 'Invalid admin key' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        
        // Store OTP temporarily
        otpStore.set(username, {
            otp,
            role,
            hashedPassword,
            email,
            company,
            timestamp: Date.now()
        });

        // Send OTP email
        await sendOTPEmail(email, otp);

        console.log('OTP registration stored:', otpStore.get(username)); // DEBUG

        res.status(200).json({ message: 'OTP sent to your email. Please verify to complete registration.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// OTP Verification Endpoint
app.post('/api/verify-otp', async (req, res) => {
    const { username, otp } = req.body;
    const storedData = otpStore.get(username);

    if (!storedData) {
        return res.status(400).json({ message: 'No pending registration found' });
    }

    // Check if OTP is expired (10 minutes)
    if (Date.now() - storedData.timestamp > 10 * 60 * 1000) {
        otpStore.delete(username);
        return res.status(400).json({ message: 'OTP expired' });
    }

    if (storedData.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP' });
    }

    try {
        const newUser = {
            id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
            username,
            password: storedData.hashedPassword,
            email: storedData.email,
            role: storedData.role,
            company: storedData.company,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        otpStore.delete(username);
        saveData();

        console.log('User registered:', newUser); // DEBUG

        res.status(201).json({ message: 'Registration successful. Please login.' });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ message: 'Server error during verification.' });
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
            const accessToken = jwt.sign(
                { 
                    username: user.username, 
                    id: user.id,
                    role: user.role 
                }, 
                JWT_SECRET, 
                { expiresIn: '1h' }
            );
            res.json({ 
                message: 'Login successful!', 
                token: accessToken,
                role: user.role
            });
        } else {
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// Middleware to check user role
function checkRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
}

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
    const user = req.user;
    const trip = req.body;
    trip.company = user.company;
    // Ensure driver_id, customer_id, and vehicle_id are included if present in req.body
    const newTrip = { 
        id: trips.length ? Math.max(...trips.map(t => t.id)) + 1 : 1, 
        ...trip, 
        driver_id: req.body.driver_id ? Number(req.body.driver_id) : undefined, // Store as number
        customer_id: req.body.customer_id ? Number(req.body.customer_id) : undefined, // Store as number
        vehicle_id: req.body.vehicle_id ? Number(req.body.vehicle_id) : undefined, // Store as number
        company: user.company
    };
    trips.push(newTrip);
    saveData(); // Save data after adding a new trip
    res.status(201).json(newTrip);
});

app.put('/api/trips/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const index = trips.findIndex(t => String(t.id) === String(id));
    if (index > -1) {
        trips[index] = { 
            ...trips[index], 
            ...req.body, 
            id: Number(id), 
            driver_id: req.body.driver_id ? Number(req.body.driver_id) : trips[index].driver_id, // Update if provided
            customer_id: req.body.customer_id ? Number(req.body.customer_id) : trips[index].customer_id, // Update if provided
            vehicle_id: req.body.vehicle_id ? Number(req.body.vehicle_id) : trips[index].vehicle_id, // Update if provided
            company: req.body.company || trips[index].company
        };
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

// Report Generation Endpoints
app.post('/api/reports/monthly', authenticateToken, checkRole(['master_admin', 'admin']), async (req, res) => {
    const { month } = req.body;
    let company = req.user.company;
    let filteredTrips = trips;
    if (req.user.role === 'admin') {
        filteredTrips = trips.filter(trip => trip.company === company);
    }
    try {
        const [year, monthNum] = month.split('-');
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum, 0);

        const monthlyTrips = filteredTrips.filter(trip => {
            const tripDate = new Date(trip.date);
            return tripDate >= startDate && tripDate <= endDate;
        });

        const dailyData = {};
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            dailyData[dateStr] = {
                trips: 0,
                revenue: 0,
                expenses: 0
            };
        }

        monthlyTrips.forEach(trip => {
            const dateStr = trip.date.split('T')[0];
            dailyData[dateStr].trips++;
            // Add revenue calculation based on your business logic
            dailyData[dateStr].revenue += trip.revenue || 0;
        });

        // Get expenses for the month
        const monthlyExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= startDate && expenseDate <= endDate;
        });

        monthlyExpenses.forEach(expense => {
            const dateStr = expense.date.split('T')[0];
            dailyData[dateStr].expenses += parseFloat(expense.amount);
        });

        const reportData = {
            totalTrips: monthlyTrips.length,
            totalRevenue: Object.values(dailyData).reduce((sum, day) => sum + day.revenue, 0),
            totalExpenses: Object.values(dailyData).reduce((sum, day) => sum + day.expenses, 0),
            dates: Object.keys(dailyData),
            revenue: Object.values(dailyData).map(day => day.revenue),
            expenses: Object.values(dailyData).map(day => day.expenses),
            details: Object.entries(dailyData).map(([date, data]) => ({
                date,
                trips: data.trips,
                revenue: data.revenue,
                expenses: data.expenses
            }))
        };

        res.json(reportData);
    } catch (error) {
        console.error('Error generating monthly report:', error);
        res.status(500).json({ message: 'Error generating report' });
    }
});

app.post('/api/reports/weekly', authenticateToken, checkRole(['master_admin', 'admin']), async (req, res) => {
    const { week } = req.body;
    try {
        const [year, weekNum] = week.split('-W');
        const startDate = new Date(year, 0, 1 + (weekNum - 1) * 7);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        const weeklyTrips = trips.filter(trip => {
            const tripDate = new Date(trip.date);
            return tripDate >= startDate && tripDate <= endDate;
        });

        const dailyData = {};
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            dailyData[dateStr] = {
                trips: 0,
                revenue: 0,
                expenses: 0
            };
        }

        weeklyTrips.forEach(trip => {
            const dateStr = trip.date.split('T')[0];
            dailyData[dateStr].trips++;
            dailyData[dateStr].revenue += trip.revenue || 0;
        });

        const weeklyExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= startDate && expenseDate <= endDate;
        });

        weeklyExpenses.forEach(expense => {
            const dateStr = expense.date.split('T')[0];
            dailyData[dateStr].expenses += parseFloat(expense.amount);
        });

        const reportData = {
            totalTrips: weeklyTrips.length,
            totalRevenue: Object.values(dailyData).reduce((sum, day) => sum + day.revenue, 0),
            totalExpenses: Object.values(dailyData).reduce((sum, day) => sum + day.expenses, 0),
            dates: Object.keys(dailyData),
            revenue: Object.values(dailyData).map(day => day.revenue),
            expenses: Object.values(dailyData).map(day => day.expenses),
            details: Object.entries(dailyData).map(([date, data]) => ({
                date,
                trips: data.trips,
                revenue: data.revenue,
                expenses: data.expenses
            }))
        };

        res.json(reportData);
    } catch (error) {
        console.error('Error generating weekly report:', error);
        res.status(500).json({ message: 'Error generating report' });
    }
});

// Admin Management Endpoints
app.get('/api/admin/users', authenticateToken, checkRole(['master_admin']), (req, res) => {
    const adminUsers = users.filter(user => user.role === 'admin' || user.role === 'master_admin');
    console.log('Admin users returned:', adminUsers); // DEBUG
    res.json(adminUsers);
});

app.delete('/api/admin/users/:id', authenticateToken, checkRole(['master_admin']), (req, res) => {
    const userId = parseInt(req.params.id);
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
    }

    const user = users[userIndex];
    if (user.role === 'master_admin') {
        return res.status(403).json({ message: 'Cannot remove master admin' });
    }

    users.splice(userIndex, 1);
    saveData();
    // On removal, set their trips' driver/admin to 'unassigned' or null
    trips.forEach(trip => {
        if (trip.driver_id === userId) {
            trip.driver_id = null;
        }
    });
    res.json({ message: 'Admin removed successfully' });
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