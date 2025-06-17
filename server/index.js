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

// Middleware to parse JSON bodies
app.use(express.json());

// Enable CORS for all requests (adjust as needed for security in production)
app.use(cors());

// Middleware to protect routes (simplified for in-memory example)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('Authenticate Token Middleware: Received Token:', token ? 'YES' : 'NO');

    if (token == null) {
        console.log('Authentication Token Middleware: No token provided.');
        return res.status(401).json({ message: 'Authentication token required.' }); // No token
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Authentication Token Middleware: JWT verification failed:', err.message);
            return res.status(403).json({ message: 'Invalid or expired token.' }); // Invalid token
        }
        req.user = user;
        console.log('Authentication Token Middleware: Token verified. User:', req.user);
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
        
        const newUser = {
            id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
            username,
            password: hashedPassword,
            email,
            role,
            company,
            createdAt: new Date().toISOString(),
            verified: false // New user is initially unverified
        };

        // Add user to the main users array, but they are unverified
        users.push(newUser);
        saveData(); // Save the unverified user

        // Generate and send OTP
        const otp = generateOTP();
        const expiresAt = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes
        otpStore.set(newUser.email, { otp, expiresAt, userId: newUser.id }); // Store OTP with user's email and ID

        await sendOTPEmail(email, otp);

        console.log('User registered (unverified), OTP sent:', newUser); // DEBUG

        res.status(202).json({ 
            message: 'Registration successful! Please verify your email with the OTP sent to your email address.', 
            email: newUser.email, // Send email to frontend for OTP form
            requiresOtpVerification: true
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// OTP Verification Endpoint
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    const storedOtpData = otpStore.get(email);

    if (!storedOtpData) {
        return res.status(400).json({ message: 'Invalid or expired OTP. Please try registering again.' });
    }

    // Check if OTP matches and is not expired
    if (storedOtpData.otp === otp && Date.now() < storedOtpData.expiresAt) {
        const userIndex = users.findIndex(u => u.id === storedOtpData.userId);

        if (userIndex !== -1) {
            users[userIndex].verified = true; // Mark user as verified
            saveData();
            otpStore.delete(email); // Remove OTP from store
            return res.status(200).json({ message: 'Email verified successfully! You can now log in.' });
        } else {
            return res.status(404).json({ message: 'User not found for verification.' });
        }
    } else {
        return res.status(400).json({ message: 'Invalid or expired OTP. Please try registering again.' });
    }
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.verified) {
        return res.status(403).json({ message: 'Account not verified. Please check your email for OTP to verify.' });
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
    // Admins and Master Admins see all trips. Users only see their company's trips.
    const userRole = req.user.role;
    if (userRole === 'user') {
        // For regular users, filter trips by their company_id (driver_id matches their user ID)
        // This assumes a driver's ID is the user's ID. Adjust if driver_id is separate.
        const userTrips = trips.filter(trip => {
            const driver = drivers.find(d => d.id === trip.driver_id);
            return driver && driver.user_id === req.user.id; // Assuming drivers have a user_id linked to the user table
        });
        return res.json(userTrips);
    } else if (userRole === 'admin') {
        // Admins see trips related to their company (company_id in trip matches user's company_id)
        const adminTrips = trips.filter(trip => {
            const userCompanyId = users.find(u => u.id === req.user.id)?.company;
            const driverCompanyId = drivers.find(d => d.id === trip.driver_id)?.company;
            //console.log(`Trip driver company: ${driverCompanyId}, Admin company: ${userCompanyId}`);
            return driverCompanyId === userCompanyId;
        });
        return res.json(adminTrips);
    } else {
        // Master Admin sees all trips
        return res.json(trips);
    }
});

app.post('/api/trips', authenticateToken, checkRole(['master_admin', 'admin']), (req, res) => {
    const { 
        origin, origin_lat, origin_lng,
        destination, destination_lat, destination_lng,
        date, driver_id, customer_id, vehicle_id, status,
        estimated_travel_time, estimated_arrival_time, distance, price // Add distance and price
    } = req.body;

    // Basic validation
    if (!origin || !destination || !date || !driver_id || !customer_id || !vehicle_id || !status) {
        return res.status(400).json({ message: 'Please provide all required trip details.' });
    }

    const newTrip = {
        id: trips.length ? Math.max(...trips.map(t => t.id)) + 1 : 1,
        company_id: req.user.role === 'master_admin' ? null : req.user.id, // Master admin trips are not tied to a specific company_id
        origin, origin_lat: parseFloat(origin_lat), origin_lng: parseFloat(origin_lng),
        destination, destination_lat: parseFloat(destination_lat), destination_lng: parseFloat(destination_lng),
        date,
        driver_id: parseInt(driver_id),
        customer_id: parseInt(customer_id),
        vehicle_id: parseInt(vehicle_id),
        status,
        estimated_travel_time: estimated_travel_time || 'N/A',
        estimated_arrival_time: estimated_arrival_time || 'N/A',
        distance: distance || 'N/A', // Store distance
        price: price || 'N/A' // Store price
    };

    trips.push(newTrip);
    saveData();
    res.status(201).json(newTrip);
});

app.put('/api/trips/:id', authenticateToken, checkRole(['master_admin', 'admin']), (req, res) => {
    const tripId = parseInt(req.params.id);
    const tripIndex = trips.findIndex(t => t.id === tripId);

    if (tripIndex === -1) {
        return res.status(404).json({ message: 'Trip not found' });
    }

    // Only allow master_admin to edit master_admin's trips (company_id: null)
    // Only allow admin to edit trips within their company
    const targetTrip = trips[tripIndex];
    const userRole = req.user.role;
    const userCompany = users.find(u => u.id === req.user.id)?.company;
    const tripDriverCompany = drivers.find(d => d.id === targetTrip.driver_id)?.company;

    if (userRole === 'admin' && tripDriverCompany !== userCompany) {
        return res.status(403).json({ message: 'Unauthorized to update this trip.' });
    }
    if (userRole !== 'master_admin' && targetTrip.company_id === null) {
        return res.status(403).json({ message: 'Unauthorized to update master admin trips.' });
    }

    // Update only allowed fields
    const { 
        origin, origin_lat, origin_lng,
        destination, destination_lat, destination_lng,
        date, driver_id, customer_id, vehicle_id, status,
        estimated_travel_time, estimated_arrival_time, distance, price // Add distance and price
    } = req.body;

    // Only update if the field is provided in the request body
    if (origin !== undefined) trips[tripIndex].origin = origin;
    if (origin_lat !== undefined) trips[tripIndex].origin_lat = parseFloat(origin_lat);
    if (origin_lng !== undefined) trips[tripIndex].origin_lng = parseFloat(origin_lng);
    if (destination !== undefined) trips[tripIndex].destination = destination;
    if (destination_lat !== undefined) trips[tripIndex].destination_lat = parseFloat(destination_lat);
    if (destination_lng !== undefined) trips[tripIndex].destination_lng = parseFloat(destination_lng);
    if (date !== undefined) trips[tripIndex].date = date;
    if (driver_id !== undefined) trips[tripIndex].driver_id = parseInt(driver_id);
    if (customer_id !== undefined) trips[tripIndex].customer_id = parseInt(customer_id);
    if (vehicle_id !== undefined) trips[tripIndex].vehicle_id = parseInt(vehicle_id);
    if (status !== undefined) trips[tripIndex].status = status;
    if (estimated_travel_time !== undefined) trips[tripIndex].estimated_travel_time = estimated_travel_time;
    if (estimated_arrival_time !== undefined) trips[tripIndex].estimated_arrival_time = estimated_arrival_time;
    if (distance !== undefined) trips[tripIndex].distance = distance; // Update distance
    if (price !== undefined) trips[tripIndex].price = price; // Update price

    saveData();
    res.json(trips[tripIndex]);
});

app.delete('/api/trips/:id', authenticateToken, checkRole(['master_admin', 'admin']), (req, res) => {
    const tripId = parseInt(req.params.id);
    const tripIndex = trips.findIndex(t => t.id === tripId);

    if (tripIndex === -1) {
        return res.status(404).json({ message: 'Trip not found' });
    }

    // Only allow master_admin to delete master_admin's trips (company_id: null)
    // Only allow admin to delete trips within their company
    const targetTrip = trips[tripIndex];
    const userRole = req.user.role;
    const userCompany = users.find(u => u.id === req.user.id)?.company;
    const tripDriverCompany = drivers.find(d => d.id === targetTrip.driver_id)?.company;

    if (userRole === 'admin' && tripDriverCompany !== userCompany) {
        return res.status(403).json({ message: 'Unauthorized to delete this trip.' });
    }
    if (userRole !== 'master_admin' && targetTrip.company_id === null) {
        return res.status(403).json({ message: 'Unauthorized to delete master admin trips.' });
    }

    trips.splice(tripIndex, 1);
    saveData();
    res.status(204).send(); // No Content
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

        console.log(`[Report Debug] Monthly Report Request for month: ${month}`);
        console.log(`[Report Debug] Calculated Start Date: ${startDate.toISOString()}`);
        console.log(`[Report Debug] Calculated End Date: ${endDate.toISOString()}`);

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

        // Get expenses for the month
        const monthlyExpenses = expenses.filter(expense => {
            console.log(`[Report Debug] Raw expense date for filtering: ${expense.date}`);
            const expenseDate = new Date(expense.date);
            const isInRange = expenseDate >= startDate && expenseDate <= endDate;
            console.log(`[Report Debug] Processing expense: ${expense.date}, Amount: ${expense.amount}, Is Valid Date: ${!isNaN(expenseDate.getTime())}, In Range: ${isInRange}`);
            return isInRange;
        });

        monthlyExpenses.forEach(expense => {
            const dateStr = new Date(expense.date).toISOString().split('T')[0]; // Ensure valid date for this step
            dailyData[dateStr].expenses += parseFloat(expense.amount);
            console.log(`[Report Debug] Added expense amount: ${parseFloat(expense.amount)} to date: ${dateStr}. Current total for date: ${dailyData[dateStr].expenses}`);
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
        console.log(`[Report Debug] Final totalExpenses: ${reportData.totalExpenses}`);

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

        console.log(`[Report Debug] Weekly Report Request for week: ${week}`);
        console.log(`[Report Debug] Calculated Start Date (Weekly): ${startDate.toISOString()}`);
        console.log(`[Report Debug] Calculated End Date (Weekly): ${endDate.toISOString()}`);

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

        const weeklyExpenses = expenses.filter(expense => {
            console.log(`[Report Debug] Raw expense date for weekly filtering: ${expense.date}`);
            const expenseDate = new Date(expense.date);
            const isInRange = expenseDate >= startDate && expenseDate <= endDate;
            console.log(`[Report Debug] Processing weekly expense: ${expense.date}, Amount: ${expense.amount}, Is Valid Date: ${!isNaN(expenseDate.getTime())}, In Range: ${isInRange}`);
            return isInRange;
        });

        weeklyExpenses.forEach(expense => {
            const dateStr = new Date(expense.date).toISOString().split('T')[0];
            dailyData[dateStr].expenses += parseFloat(expense.amount);
            console.log(`[Report Debug] Added weekly expense amount: ${parseFloat(expense.amount)} to date: ${dateStr}. Current total for date: ${dailyData[dateStr].expenses}`);
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