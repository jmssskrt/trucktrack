const API_BASE_URL = 'https://trucktrack-jl6v.onrender.com';

// Google Maps related variables (Declared at the top)
let trackingMap;
let trackingMarker;
let geocoder;
let directionsService;
let directionsRenderer;
const DEFAULT_MAP_CENTER = { lat: 14.5995, lng: 120.9842 }; // Manila coordinates
let mapSelectionPurpose = null; // To store 'origin' or 'destination'

// Role-based access control
const ROLE_ACCESS = {
    master_admin: ['dashboard', 'trips', 'expenses', 'drivers', 'vehicles', 'customers', 'tracking', 'reports', 'admin_management'],
    admin: ['dashboard', 'trips', 'expenses', 'drivers', 'vehicles', 'customers', 'tracking', 'reports'],
    user: ['tracking']
};

// Error handling function
function handleApiError(error, message) {
    console.error(message, error);
    if (error.response) {
        console.error('API Error Response Status:', error.response.status);
        error.response.text().then(text => console.error('API Error Response Body:', text));
    }
    if (error.message.includes('Failed to fetch')) {
        showNotification('Server is not running or unreachable.', 'error');
    } else {
        showNotification(message + ': ' + error.message, 'error');
    }
}

// Navigation functions
function showSection(sectionId) {
    const userRole = getUserRole();
    if (!ROLE_ACCESS[userRole].includes(sectionId)) {
        showNotification('You do not have access to this section.', 'error');
        return;
    }

    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    // Show selected section
    document.getElementById(sectionId).style.display = 'block';
    
    // Update active navigation button
    document.querySelectorAll('.nav-button').forEach(button => {
        button.classList.remove('active');
    });
    const navBtn = document.getElementById(`${sectionId}NavBtn`);
    if (navBtn) {
        navBtn.classList.add('active');
    }
    
    // Load section data
    if (sectionId === 'dashboard') {
        loadDashboardStats();
        loadTripsChart();
    } else if (sectionId === 'trips') {
        loadDrivers();
        loadCustomers();
        loadVehicles();
        updateTripsTable();
    } else if (sectionId === 'expenses') {
        updateExpensesTable();
    } else if (sectionId === 'drivers') {
        updateDriversTable();
    } else if (sectionId === 'vehicles') {
        updateVehiclesTable();
    } else if (sectionId === 'customers') {
        updateCustomersTable();
    } else if (sectionId === 'tracking') {
        initTrackingMap();
        updateActiveTripsList();
    } else if (sectionId === 'reports') {
        // loadReports(); // Remove or replace this line
        // Optionally, you can call generateReport() or leave it empty
    } else if (sectionId === 'admin_management') {
        loadAdminManagement();
    }
}

// Update navigation buttons based on role
function updateNavigationButtons() {
    const userRole = getUserRole();
    const allowedSections = ROLE_ACCESS[userRole];
    
    document.querySelectorAll('.nav-button').forEach(button => {
        const sectionId = button.id.replace('NavBtn', '');
        // Always show the logout button
        if (button.id === 'logoutBtn') {
            button.style.display = 'block';
        } else if (button.id === 'reportsNavBtn' && (userRole === 'admin' || userRole === 'master_admin')) {
            button.style.display = 'block';
        } else if (button.id === 'adminManagementNavBtn' && userRole !== 'master_admin') {
            button.style.display = 'none';
        } else if (!allowedSections.includes(sectionId)) {
            button.style.display = 'none';
        } else {
            button.style.display = 'block';
        }
    });
}

// Get user role from token
function getUserRole() {
    const token = getToken();
    if (!token) return null;
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.role;
    } catch (error) {
        console.error('Error parsing token:', error);
        return null;
    }
}

// Dashboard functions
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch dashboard stats');
        }
        const stats = await response.json();
        
        // Update dashboard stats
        document.getElementById('totalTrips').textContent = stats.totalTrips || 0;
        document.getElementById('activeTrips').textContent = stats.activeTrips || 0;
        document.getElementById('totalExpenses').textContent = `₱${(stats.totalExpenses || 0).toFixed(2)}`;
        document.getElementById('totalDrivers').textContent = stats.totalDrivers || 0;
    } catch (error) {
        handleApiError(error, 'Error loading dashboard stats');
    }
}

async function loadTripsChart() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/trips`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch trips data');
        }
        const trips = await response.json();
        
        // Get the chart context
        const ctx = document.getElementById('tripsChart').getContext('2d');
        
        // Check if there's an existing chart and destroy it
        if (window.tripsChart instanceof Chart) {
            window.tripsChart.destroy();
        }

        // If no trips, show empty state
        if (!trips || trips.length === 0) {
            window.tripsChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#e0e0e0']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
            return;
        }

        // Count trips by status
        const statusCounts = trips.reduce((acc, trip) => {
            acc[trip.status] = (acc[trip.status] || 0) + 1;
            return acc;
        }, {});
        
        // Create new chart
        window.tripsChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: [
                        '#3498db', // Blue for Pending/Scheduled
                        '#2ecc71', // Green for Active
                        '#e74c3c'  // Red for Completed
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading trips chart:', error);
        showNotification('Error loading trips chart', 'error');
    }
}

// Trip Management functions
async function loadDrivers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/drivers`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch drivers');
        }
        const drivers = await response.json();
        
        const select = document.getElementById('tripDriver');
        if (select) {
            select.innerHTML = '<option value="">Select Driver</option>';
            drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = `${driver.name} (${driver.license})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading drivers:', error);
        showNotification('Error loading drivers: ' + error.message, 'error');
    }
}

async function loadCustomers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch customers');
        }
        const customers = await response.json();
        
        const select = document.getElementById('tripCustomer');
        if (select) {
            select.innerHTML = '<option value="">Select Customer</option>';
            customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.id;
                option.textContent = `${customer.name} (${customer.phone})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading customers:', error);
        showNotification('Error loading customers: ' + error.message, 'error');
    }
}

async function loadVehicles() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch vehicles');
        }
        const vehicles = await response.json();
        
        const select = document.getElementById('tripVehicle');
        if (select) {
            select.innerHTML = '<option value="">Select Vehicle</option>';
            vehicles.forEach(vehicle => {
                const option = document.createElement('option');
                option.value = vehicle.id;
                option.textContent = `${vehicle.model} (${vehicle.plate_number})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading vehicles:', error);
        showNotification('Error loading vehicles: ' + error.message, 'error');
    }
}

// Function to initialize the map in the Trip Tracking section
function initTrackingMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return; // Exit if element doesn't exist

    if (!trackingMap) {
        // Initialize Google Maps services here, where 'google' is guaranteed to be defined
        geocoder = new google.maps.Geocoder();
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer();

        trackingMap = new google.maps.Map(mapContainer, {
            center: DEFAULT_MAP_CENTER,
            zoom: 8
        });
        directionsRenderer.setMap(trackingMap);

        trackingMap.addListener('click', (e) => {
            placeTrackingMarkerAndGeocode(e.latLng);
        });

        // Add Confirm Selection button to map controls
        const mapControls = document.querySelector('#tracking .map-controls');
        if (mapControls && !document.getElementById('confirmMapSelectionBtn')) {
            const confirmBtn = document.createElement('button');
            confirmBtn.id = 'confirmMapSelectionBtn';
            confirmBtn.className = 'btn-primary';
            confirmBtn.textContent = 'Confirm Selection';
            confirmBtn.style.marginTop = '10px';
            confirmBtn.addEventListener('click', populateTripFormWithMapSelection);
            mapControls.appendChild(confirmBtn);
        }
    }
}

async function placeTrackingMarkerAndGeocode(latLng) {
    // Clear existing marker if any
    if (trackingMarker) {
        trackingMarker.setMap(null);
    }

    trackingMarker = new google.maps.Marker({
        position: latLng,
        map: trackingMap,
    });

    geocoder.geocode({ 'location': latLng }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const address = results[0].formatted_address;
            showNotification(`Location selected: ${address}. Click "Confirm Selection" to use it.`, 'info');
            trackingMarker.address = address; // Store address with marker
            trackingMarker.latLng = latLng; // Store latLng with marker
        } else {
            showNotification('Geocoder failed due to: ' + status, 'error');
        }
    });
}

function populateTripFormWithMapSelection() {
    if (!trackingMarker || !trackingMarker.address || !trackingMarker.latLng || !mapSelectionPurpose) {
        showNotification('No location selected on map.', 'error');
        return;
    }

    if (mapSelectionPurpose === 'origin') {
        const tripOriginInput = document.getElementById('tripOrigin');
        if (tripOriginInput) {
            tripOriginInput.value = trackingMarker.address;
            tripOriginInput.dataset.lat = trackingMarker.latLng.lat();
            tripOriginInput.dataset.lng = trackingMarker.latLng.lng();
        }
    } else if (mapSelectionPurpose === 'destination') {
        const tripDestinationInput = document.getElementById('tripDestination');
        if (tripDestinationInput) {
            tripDestinationInput.value = trackingMarker.address;
            tripDestinationInput.dataset.lat = trackingMarker.latLng.lat();
            tripDestinationInput.dataset.lng = trackingMarker.latLng.lng();
        }
    }

    // Attempt to calculate ETA if both origin, destination and tripDate are available
    const originLat = parseFloat(document.getElementById('tripOrigin')?.dataset.lat);
    const originLng = parseFloat(document.getElementById('tripOrigin')?.dataset.lng);
    const destinationLat = parseFloat(document.getElementById('tripDestination')?.dataset.lat);
    const destinationLng = parseFloat(document.getElementById('tripDestination')?.dataset.lng);
    const tripDate = document.getElementById('tripDate')?.value;

    if (originLat && originLng && destinationLat && destinationLng && tripDate) {
        const originLatLng = new google.maps.LatLng(originLat, originLng);
        const destinationLatLng = new google.maps.LatLng(destinationLat, destinationLng);
        calculateETA(originLatLng, destinationLatLng, tripDate);
    }

    showNotification(`${mapSelectionPurpose === 'origin' ? 'Origin' : 'Destination'} updated from map selection.`, 'success');
    mapSelectionPurpose = null; // Reset purpose
    // Optionally switch back to trip management tab
    showSection('trips');
}

async function calculateETA(originLatLng, destinationLatLng, tripDate) {
    if (!originLatLng || !destinationLatLng || !tripDate) {
        console.warn("Missing origin, destination, or trip date for ETA calculation.");
        document.getElementById('tripTravelTime').value = '';
        document.getElementById('tripETA').value = '';
        return;
    }

    try {
        const request = {
            origin: originLatLng,
            destination: destinationLatLng,
            travelMode: google.maps.TravelMode.DRIVING
        };

        const response = await directionsService.route(request);

        if (response.status === 'OK') {
            const route = response.routes[0].legs[0];
            const durationInSeconds = route.duration.value;
            const travelTimeText = route.duration.text;

            document.getElementById('tripTravelTime').value = travelTimeText;

            // Calculate Estimated Arrival Time
            const dateParts = tripDate.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
            const day = parseInt(dateParts[2]);

            // Assuming a default start time for calculation (e.g., 9:00 AM)
            const startTime = new Date(year, month, day, 9, 0, 0); // 9 AM on the trip date
            const arrivalTime = new Date(startTime.getTime() + durationInSeconds * 1000);

            const arrivalTimeFormatted = arrivalTime.toLocaleString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: true,
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            document.getElementById('tripETA').value = arrivalTimeFormatted;
        } else {
            throw new Error('Directions request failed: ' + response.status);
        }
    } catch (error) {
        console.error('Error calculating ETA:', error);
        showNotification('Error calculating ETA: ' + error.message, 'error');
        document.getElementById('tripTravelTime').value = 'N/A';
        document.getElementById('tripETA').value = 'N/A';
    }
}

async function addTrip() {
    const origin = document.getElementById('tripOrigin')?.value;
    const origin_lat = document.getElementById('tripOrigin')?.dataset.lat;
    const origin_lng = document.getElementById('tripOrigin')?.dataset.lng;
    const destination = document.getElementById('tripDestination')?.value;
    const destination_lat = document.getElementById('tripDestination')?.dataset.lat;
    const destination_lng = document.getElementById('tripDestination')?.dataset.lng;
    const date = document.getElementById('tripDate')?.value;
    const driver_id = document.getElementById('tripDriver')?.value;
    const customer_id = document.getElementById('tripCustomer')?.value;
    const vehicle_id = document.getElementById('tripVehicle')?.value;
    const status = document.getElementById('tripStatus')?.value;
    const estimated_travel_time = document.getElementById('tripTravelTime')?.value;
    const estimated_arrival_time = document.getElementById('tripETA')?.value;

    if (!origin || !destination || !date || !driver_id || !customer_id || !vehicle_id || !status) {
        showNotification('Please fill all required trip fields.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/trips`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ 
                origin, origin_lat, origin_lng, 
                destination, destination_lat, destination_lng, 
                date, driver_id, customer_id, vehicle_id, status,
                estimated_travel_time, estimated_arrival_time
            })
        });

        if (!response.ok) {
            throw new Error('Failed to add trip');
        }

        const result = await response.json();
        showNotification('Trip added successfully!', 'success');
        document.getElementById('tripForm').reset();
        document.getElementById('tripTravelTime').value = ''; // Clear after submission
        document.getElementById('tripETA').value = ''; // Clear after submission
        updateTripsTable();
        updateActiveTripsList(); // Refresh active trips
    } catch (error) {
        handleApiError(error, 'Error adding trip');
    }
}

async function getTrips() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/trips`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch trips');
        }
        return await response.json();
    } catch (error) {
        handleApiError(error, 'Error fetching trips');
        return [];
    }
}

async function updateTripsTable() {
    const trips = await getTrips();
    const tableBody = document.querySelector('#tripsTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const drivers = await getDrivers();
    const customers = await getCustomers();
    const vehicles = await getVehicles();

    console.log('Fetched Drivers:', drivers);
    console.log('Fetched Customers:', customers);
    console.log('Fetched Vehicles:', vehicles);

    trips.forEach(trip => {
        console.log('Processing Trip:', trip);
        const row = tableBody.insertRow();
        row.insertCell().textContent = trip.origin; // Origin
        row.insertCell().textContent = trip.destination; // Destination
        makeEditable(row.insertCell(), trip.date, async (newValue) => {
            await updateTrip(trip.id, { date: newValue });
            updateTripsTable();
        });
        // Find and display driver name
        const driverName = drivers.find(d => d.id === trip.driver_id)?.name || 'N/A';
        makeEditable(row.insertCell(), driverName, async (newValue) => {
            const driver = drivers.find(d => d.name === newValue);
            if (driver) {
                await updateTrip(trip.id, { driver_id: driver.id });
                updateTripsTable();
            } else {
                showNotification('Driver not found.', 'error');
            }
        });
        // Find and display customer name
        const customerName = customers.find(c => c.id === trip.customer_id)?.name || 'N/A';
        makeEditable(row.insertCell(), customerName, async (newValue) => {
            const customer = customers.find(c => c.name === newValue);
            if (customer) {
                await updateTrip(trip.id, { customer_id: customer.id });
                updateTripsTable();
            } else {
                showNotification('Customer not found.', 'error');
            }
        });
        // Find and display vehicle model
        const vehicleModel = vehicles.find(v => v.id === trip.vehicle_id)?.model || 'N/A';
        makeEditable(row.insertCell(), vehicleModel, async (newValue) => {
            const vehicle = vehicles.find(v => v.model === newValue);
            if (vehicle) {
                await updateTrip(trip.id, { vehicle_id: vehicle.id });
                updateTripsTable();
            } else {
                showNotification('Vehicle not found.', 'error');
            }
        });
        makeEditable(row.insertCell(), trip.status, async (newValue) => {
            await updateTrip(trip.id, { status: newValue });
            updateTripsTable();
        }, true, ['Pending', 'Active', 'Completed']);
        
        makeEditable(row.insertCell(), trip.estimated_travel_time || 'N/A', async (newValue) => {
            await updateTrip(trip.id, { estimated_travel_time: newValue });
            updateTripsTable();
        });
        makeEditable(row.insertCell(), trip.estimated_arrival_time || 'N/A', async (newValue) => {
            await updateTrip(trip.id, { estimated_arrival_time: newValue });
            updateTripsTable();
        });

        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteTrip(trip.id);
        actionsCell.appendChild(deleteBtn);
    });
}

async function updateTrip(id, data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/trips/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error('Failed to update trip');
        }
        showNotification('Trip updated successfully!', 'success');
    } catch (error) {
        handleApiError(error, 'Error updating trip');
    }
}

async function deleteTrip(id) {
    if (!confirm('Are you sure you want to delete this trip?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/trips/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to delete trip');
        }
        showNotification('Trip deleted successfully!', 'success');
        updateTripsTable();
        updateActiveTripsList(); // Refresh active trips
    } catch (error) {
        handleApiError(error, 'Error deleting trip');
    }
}

// Expense Management functions
async function addExpense() {
    const type = document.getElementById('expenseType')?.value;
    const amount = document.getElementById('expenseAmount')?.value;
    const date = document.getElementById('expenseDate')?.value;
    const description = document.getElementById('expenseDescription')?.value;

    if (!type || !amount || !date) {
        showNotification('Please fill all required expense fields.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/expenses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ type, amount, date, description })
        });

        if (!response.ok) {
            throw new Error('Failed to add expense');
        }

        const result = await response.json();
        showNotification('Expense added successfully!', 'success');
        document.getElementById('expenseForm').reset();
        updateExpensesTable();
    } catch (error) {
        handleApiError(error, 'Error adding expense');
    }
}

async function getExpenses() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/expenses`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch expenses');
        }
        return await response.json();
    } catch (error) {
        handleApiError(error, 'Error fetching expenses');
        return [];
    }
}

async function updateExpensesTable() {
    const expenses = await getExpenses();
    const tableBody = document.querySelector('#expensesTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    expenses.forEach(expense => {
        const row = tableBody.insertRow();
        makeEditable(row.insertCell(), expense.type, async (newValue) => {
            await updateExpense(expense.id, { type: newValue });
            updateExpensesTable();
        });
        makeEditable(row.insertCell(), expense.amount, async (newValue) => {
            await updateExpense(expense.id, { amount: newValue });
            updateExpensesTable();
        });
        makeEditable(row.insertCell(), expense.date, async (newValue) => {
            await updateExpense(expense.id, { date: newValue });
            updateExpensesTable();
        });
        makeEditable(row.insertCell(), expense.description, async (newValue) => {
            await updateExpense(expense.id, { description: newValue });
            updateExpensesTable();
        });
        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteExpense(expense.id);
        actionsCell.appendChild(deleteBtn);
    });
}

async function updateExpense(id, data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error('Failed to update expense');
        }
        showNotification('Expense updated successfully!', 'success');
    } catch (error) {
        handleApiError(error, 'Error updating expense');
    }
}

async function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to delete expense');
        }
        showNotification('Expense deleted successfully!', 'success');
        updateExpensesTable();
    } catch (error) {
        handleApiError(error, 'Error deleting expense');
    }
}

// Driver Management functions
async function addDriver() {
    const name = document.getElementById('driverName')?.value;
    const license = document.getElementById('driverLicense')?.value;
    const phone = document.getElementById('driverPhone')?.value;
    const email = document.getElementById('driverEmail')?.value;
    const status = document.getElementById('driverStatus')?.value;

    if (!name || !license || !phone || !status) {
        showNotification('Please fill all required driver fields.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/drivers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ name, license, phone, email, status })
        });

        if (!response.ok) {
            throw new Error('Failed to add driver');
        }

        const result = await response.json();
        showNotification('Driver added successfully!', 'success');
        document.getElementById('driverForm').reset();
        updateDriversTable();
        loadDrivers(); // Refresh driver dropdown in trip management
    } catch (error) {
        handleApiError(error, 'Error adding driver');
    }
}

async function getDrivers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/drivers`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch drivers');
        }
        return await response.json();
    } catch (error) {
        handleApiError(error, 'Error fetching drivers');
        return [];
    }
}

async function updateDriversTable() {
    const drivers = await getDrivers();
    const tableBody = document.querySelector('#driversTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    drivers.forEach(driver => {
        const row = tableBody.insertRow();
        makeEditable(row.insertCell(), driver.name, async (newValue) => {
            await updateDriver(driver.id, { name: newValue });
            updateDriversTable();
            loadDrivers(); // Refresh dropdown
        });
        makeEditable(row.insertCell(), driver.license, async (newValue) => {
            await updateDriver(driver.id, { license: newValue });
            updateDriversTable();
        });
        makeEditable(row.insertCell(), driver.phone, async (newValue) => {
            await updateDriver(driver.id, { phone: newValue });
            updateDriversTable();
        });
        makeEditable(row.insertCell(), driver.email, async (newValue) => {
            await updateDriver(driver.id, { email: newValue });
            updateDriversTable();
        });
        makeEditable(row.insertCell(), driver.status, async (newValue) => {
            await updateDriver(driver.id, { status: newValue });
            updateDriversTable();
        }, true, ['Active', 'Inactive']);
        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteDriver(driver.id);
        actionsCell.appendChild(deleteBtn);
    });
}

async function updateDriver(id, data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/drivers/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error('Failed to update driver');
        }
        showNotification('Driver updated successfully!', 'success');
    } catch (error) {
        handleApiError(error, 'Error updating driver');
    }
}

async function deleteDriver(id) {
    if (!confirm('Are you sure you want to delete this driver?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/drivers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to delete driver');
        }
        showNotification('Driver deleted successfully!', 'success');
        updateDriversTable();
        loadDrivers(); // Refresh driver dropdown in trip management
    } catch (error) {
        handleApiError(error, 'Error deleting driver');
    }
}

// Vehicle Management functions
async function addVehicle() {
    const model = document.getElementById('vehicleModel')?.value;
    const year = document.getElementById('vehicleYear')?.value;
    const plate_number = document.getElementById('vehiclePlate')?.value;
    const last_service = document.getElementById('vehicleLastService')?.value;
    const status = document.getElementById('vehicleStatus')?.value;

    if (!model || !year || !plate_number || !status) {
        showNotification('Please fill all required vehicle fields.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ model, year, plate_number, last_service, status })
        });

        if (!response.ok) {
            throw new Error('Failed to add vehicle');
        }

        const result = await response.json();
        showNotification('Vehicle added successfully!', 'success');
        document.getElementById('vehicleForm').reset();
        updateVehiclesTable();
        loadVehicles(); // Refresh vehicle dropdown in trip management
    } catch (error) {
        handleApiError(error, 'Error adding vehicle');
    }
}

async function getVehicles() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch vehicles');
        }
        return await response.json();
    } catch (error) {
        handleApiError(error, 'Error fetching vehicles');
        return [];
    }
}

async function updateVehiclesTable() {
    const vehicles = await getVehicles();
    const tableBody = document.querySelector('#vehiclesTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    vehicles.forEach(vehicle => {
        const row = tableBody.insertRow();
        makeEditable(row.insertCell(), vehicle.model, async (newValue) => {
            await updateVehicle(vehicle.id, { model: newValue });
            updateVehiclesTable();
            loadVehicles(); // Refresh dropdown
        });
        makeEditable(row.insertCell(), vehicle.year, async (newValue) => {
            await updateVehicle(vehicle.id, { year: newValue });
            updateVehiclesTable();
        });
        makeEditable(row.insertCell(), vehicle.plate_number, async (newValue) => {
            await updateVehicle(vehicle.id, { plate_number: newValue });
            updateVehiclesTable();
        });
        makeEditable(row.insertCell(), vehicle.last_service, async (newValue) => {
            await updateVehicle(vehicle.id, { last_service: newValue });
            updateVehiclesTable();
        });
        makeEditable(row.insertCell(), vehicle.status, async (newValue) => {
            await updateVehicle(vehicle.id, { status: newValue });
            updateVehiclesTable();
        }, true, ['Active', 'Maintenance', 'Inactive']);
        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteVehicle(vehicle.id);
        actionsCell.appendChild(deleteBtn);
    });
}

async function updateVehicle(id, data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/vehicles/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error('Failed to update vehicle');
        }
        showNotification('Vehicle updated successfully!', 'success');
    } catch (error) {
        handleApiError(error, 'Error updating vehicle');
    }
}

async function deleteVehicle(id) {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/vehicles/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to delete vehicle');
        }
        showNotification('Vehicle deleted successfully!', 'success');
        updateVehiclesTable();
        loadVehicles(); // Refresh vehicle dropdown in trip management
    } catch (error) {
        handleApiError(error, 'Error deleting vehicle');
    }
}

// Customer Management functions
async function addCustomer() {
    const name = document.getElementById('customerName')?.value;
    const email = document.getElementById('customerEmail')?.value;
    const phone = document.getElementById('customerPhone')?.value;
    const address = document.getElementById('customerAddress')?.value;

    if (!name || !phone || !address) {
        showNotification('Please fill all required customer fields.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ name, email, phone, address })
        });

        if (!response.ok) {
            throw new Error('Failed to add customer');
        }

        const result = await response.json();
        showNotification('Customer added successfully!', 'success');
        document.getElementById('customerForm').reset();
        updateCustomersTable();
        loadCustomers(); // Refresh customer dropdown in trip management
    } catch (error) {
        handleApiError(error, 'Error adding customer');
    }
}

async function getCustomers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch customers');
        }
        return await response.json();
    } catch (error) {
        handleApiError(error, 'Error fetching customers');
        return [];
    }
}

async function updateCustomersTable() {
    const customers = await getCustomers();
    const tableBody = document.querySelector('#customersTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    customers.forEach(customer => {
        const row = tableBody.insertRow();
        makeEditable(row.insertCell(), customer.name, async (newValue) => {
            await updateCustomer(customer.id, { name: newValue });
            updateCustomersTable();
            loadCustomers(); // Refresh dropdown
        });
        makeEditable(row.insertCell(), customer.email, async (newValue) => {
            await updateCustomer(customer.id, { email: newValue });
            updateCustomersTable();
        });
        makeEditable(row.insertCell(), customer.phone, async (newValue) => {
            await updateCustomer(customer.id, { phone: newValue });
            updateCustomersTable();
        });
        makeEditable(row.insertCell(), customer.address, async (newValue) => {
            await updateCustomer(customer.id, { address: newValue });
            updateCustomersTable();
        });
        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteCustomer(customer.id);
        actionsCell.appendChild(deleteBtn);
    });
}

async function updateCustomer(id, data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/customers/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error('Failed to update customer');
        }
        showNotification('Customer updated successfully!', 'success');
    } catch (error) {
        handleApiError(error, 'Error updating customer');
    }
}

async function deleteCustomer(id) {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/customers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) {
            throw new Error('Failed to delete customer');
        }
        showNotification('Customer deleted successfully!', 'success');
        updateCustomersTable();
        loadCustomers(); // Refresh customer dropdown in trip management
    } catch (error) {
        handleApiError(error, 'Error deleting customer');
    }
}

// Trip Tracking functions
async function updateActiveTripsList() {
    const activeTripsList = document.getElementById('activeTripsList');
    if (!activeTripsList) return;
    activeTripsList.innerHTML = '';

    const trips = await getTrips();
    const drivers = await getDrivers(); // Fetch drivers for lookup
    const customers = await getCustomers(); // Fetch customers for lookup
    const activeTrips = trips.filter(trip => trip.status === 'Active' || trip.status === 'Pending');

    if (activeTrips.length === 0) {
        activeTripsList.innerHTML = '<p>No active or pending trips.</p>';
        return;
    }

    activeTrips.forEach(trip => {
        const driver = drivers.find(d => d.id === trip.driver_id);
        const customer = customers.find(c => c.id === trip.customer_id);

        const tripDiv = document.createElement('div');
        tripDiv.className = 'trip-item';
        tripDiv.innerHTML = `
            <h3>${trip.origin} to ${trip.destination}</h3>
            <p><strong>Date:</strong> ${trip.date}</p>
            <p><strong>Driver:</strong> ${driver ? driver.name : 'N/A'}</p>
            <p><strong>Status:</strong> ${trip.status}</p>
            <p><strong>Est. Travel Time:</strong> ${trip.estimated_travel_time || 'N/A'}</p>
            <p><strong>Est. Arrival:</strong> ${trip.estimated_arrival_time || 'N/A'}</p>
            <button onclick="viewTripOnMap(${trip.id})">View on Map</button>
        `;
        activeTripsList.appendChild(tripDiv);
    });
}

// Authentication related functions
function logout() {
    clearToken();
    hideLogoutBtn();
    showLogin();
    showNotification('Logged out successfully.', 'info');
}

function showLogin() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('main-app').style.display = 'none';
    hideLogoutBtn();
}

function showRegister() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('main-app').style.display = 'none';
    hideLogoutBtn();
}

function hideAuth() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('main-app').style.display = 'grid'; // Assuming main-app uses grid
    showLogoutBtn();
}

function showLogoutBtn() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'block';
    }
}

function hideLogoutBtn() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'none';
    }
}

function isLoggedIn() {
    return getToken() !== null;
}

function setToken(token) {
    localStorage.setItem('authToken', token);
}

function getToken() {
    return localStorage.getItem('authToken');
}

function clearToken() {
    localStorage.removeItem('authToken');
}

// Notification system
function showNotification(message, type = 'info') {
    const notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        console.warn('Notification container not found.');
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <span class="delete-notification" onclick="this.parentElement.remove()">×</span>
    `;
    notificationContainer.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Inline editing helper function
function makeEditable(cell, initialValue, onSave, isSelect = false, options = []) {
    cell.innerHTML = ''; // Clear cell content
    const displaySpan = document.createElement('span');
    displaySpan.textContent = initialValue;
    cell.appendChild(displaySpan);

    let inputElement;

    cell.addEventListener('click', () => {
        if (cell.querySelector('input') || cell.querySelector('select')) {
            return; // Already in edit mode
        }

        // Create input/select element based on type
        if (isSelect) {
            inputElement = document.createElement('select');
            options.forEach(optionText => {
                const option = document.createElement('option');
                option.value = optionText;
                option.textContent = optionText;
                if (optionText === initialValue) {
                    option.selected = true;
                }
                inputElement.appendChild(option);
            });
        } else {
            inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.value = initialValue;
        }

        cell.innerHTML = '';
        cell.appendChild(inputElement);
        inputElement.focus();

        const saveChanges = async () => {
            const newValue = inputElement.value;
            if (newValue !== initialValue) {
                await onSave(newValue);
            }
            displaySpan.textContent = newValue;
            cell.innerHTML = '';
            cell.appendChild(displaySpan);
        };

        inputElement.addEventListener('blur', saveChanges);
        inputElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                inputElement.blur();
            }
        });
    });
}

async function loginUser() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username) {
        showNotification('Please enter your username.', 'error');
        return;
    }
    if (!password) {
        showNotification('Please enter your password.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.message || 'Login failed');
            } catch (jsonError) {
                console.error('Login failed: Response was not valid JSON. Full response:', errorText);
                throw new Error('Login failed: Unexpected server response.');
            }
        }

        const data = await response.json();
        setToken(data.token);
        hideAuth();
        updateNavigationButtons(); // Update navigation based on role
        showSection('dashboard');
        showNotification('Login successful!', 'success');
    } catch (error) {
        handleApiError(error, 'Login failed');
    }
}

async function registerUser() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const email = document.getElementById('registerEmail').value;
    const company = document.getElementById('registerCompany').value;
    const role = document.getElementById('registerRole').value;
    const key = document.getElementById('registerKey').value;

    if (password !== confirmPassword) {
        showNotification('Passwords do not match.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email, company, role, key })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Registration failed');
        }

        // Show OTP verification form
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('otp-verification-form').style.display = 'block';
        showNotification('OTP sent to your email. Please verify to complete registration.', 'info');

    } catch (error) {
        handleApiError(error, 'Registration failed');
    }
}

// Add OTP verification function
async function verifyOTP() {
    const username = document.getElementById('registerUsername').value;
    const otp = document.getElementById('otpInput').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, otp })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'OTP verification failed');
        }

        showNotification('Registration successful! Please login.', 'success');
        showLogin();
    } catch (error) {
        handleApiError(error, 'OTP verification failed');
    }
}

// Add event listener for OTP verification form
document.getElementById('otp-verification-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    verifyOTP();
});

// Event listeners for initial page load and tab changes
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners for navigation buttons
    document.getElementById('dashboardNavBtn')?.addEventListener('click', () => showSection('dashboard'));
    document.getElementById('tripsNavBtn')?.addEventListener('click', () => showSection('trips'));
    document.getElementById('expensesNavBtn')?.addEventListener('click', () => showSection('expenses'));
    document.getElementById('driversNavBtn')?.addEventListener('click', () => showSection('drivers'));
    document.getElementById('vehiclesNavBtn')?.addEventListener('click', () => showSection('vehicles'));
    document.getElementById('customersNavBtn')?.addEventListener('click', () => showSection('customers'));
    document.getElementById('trackingNavBtn')?.addEventListener('click', () => showSection('tracking'));
    document.getElementById('reportsNavBtn')?.addEventListener('click', () => showSection('reports'));
    document.getElementById('adminManagementNavBtn')?.addEventListener('click', () => showSection('admin_management'));

    // Attach submit event listeners for forms
    document.getElementById('tripForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        addTrip();
    });
    document.getElementById('expenseForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        addExpense();
    });
    document.getElementById('driverForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        addDriver();
    });
    document.getElementById('vehicleForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        addVehicle();
    });
    document.getElementById('customerForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        addCustomer();
    });

    // Attach submit event listeners for auth forms
    document.getElementById('login-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        loginUser();
    });
    document.getElementById('register-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        registerUser();
    });

    // Attach click event listener for logout button
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Event listeners for map selection buttons
    document.getElementById('selectOriginOnMapBtn')?.addEventListener('click', () => {
        mapSelectionPurpose = 'origin';
        showSection('tracking');
        showNotification('Select origin on the map and click "Confirm Selection".', 'info');
    });

    document.getElementById('selectDestinationOnMapBtn')?.addEventListener('click', () => {
        mapSelectionPurpose = 'destination';
        showSection('tracking');
        showNotification('Select destination on the map and click "Confirm Selection".', 'info');
    });

    // Event listener for tripDate change to recalculate ETA
    document.getElementById('tripDate')?.addEventListener('change', () => {
        const originLat = parseFloat(document.getElementById('tripOrigin')?.dataset.lat);
        const originLng = parseFloat(document.getElementById('tripOrigin')?.dataset.lng);
        const destinationLat = parseFloat(document.getElementById('tripDestination')?.dataset.lat);
        const destinationLng = parseFloat(document.getElementById('tripDestination')?.dataset.lng);
        const tripDate = document.getElementById('tripDate')?.value;

        if (originLat && originLng && destinationLat && destinationLng && tripDate) {
            const originLatLng = new google.maps.LatLng(originLat, originLng);
            const destinationLatLng = new google.maps.LatLng(destinationLat, destinationLng);
            calculateETA(originLatLng, destinationLatLng, tripDate);
        }
    });

    // Initial section display based on authentication status
    if (isLoggedIn()) {
        showSection('dashboard');
        showLogoutBtn();
    } else {
        showLogin();
    }

    // Ensure the key input is shown for admin/master admin roles
    setupRoleKeyInput();
});

// Report Generation Functions
async function generateReport() {
    const reportType = document.getElementById('reportType').value;
    const reportMonth = document.getElementById('reportMonth').value;
    const reportWeek = document.getElementById('reportWeek').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/reports/${reportType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                month: reportType === 'monthly' ? reportMonth : null,
                week: reportType === 'weekly' ? reportWeek : null
            })
        });

        if (!response.ok) {
            throw new Error('Failed to generate report');
        }

        const reportData = await response.json();
        displayReport(reportData);
    } catch (error) {
        handleApiError(error, 'Error generating report');
    }
}

function displayReport(data) {
    const summaryDiv = document.getElementById('reportSummary');
    const chartDiv = document.getElementById('reportChart');
    const detailsDiv = document.getElementById('reportDetails');

    // Display summary
    summaryDiv.innerHTML = `
        <h3>Summary</h3>
        <p>Total Trips: ${data.totalTrips}</p>
        <p>Total Revenue: ₱${data.totalRevenue.toFixed(2)}</p>
        <p>Total Expenses: ₱${data.totalExpenses.toFixed(2)}</p>
        <p>Net Profit: ₱${(data.totalRevenue - data.totalExpenses).toFixed(2)}</p>
    `;

    // Create chart
    const ctx = document.createElement('canvas');
    chartDiv.innerHTML = '';
    chartDiv.appendChild(ctx);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.dates,
            datasets: [{
                label: 'Revenue',
                data: data.revenue,
                backgroundColor: '#2ecc71'
            }, {
                label: 'Expenses',
                data: data.expenses,
                backgroundColor: '#e74c3c'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Display detailed breakdown
    detailsDiv.innerHTML = `
        <h3>Detailed Breakdown</h3>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Trips</th>
                    <th>Revenue</th>
                    <th>Expenses</th>
                    <th>Profit</th>
                </tr>
            </thead>
            <tbody>
                ${data.details.map(detail => `
                    <tr>
                        <td>${detail.date}</td>
                        <td>${detail.trips}</td>
                        <td>₱${detail.revenue.toFixed(2)}</td>
                        <td>₱${detail.expenses.toFixed(2)}</td>
                        <td>₱${(detail.revenue - detail.expenses).toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function printReport() {
    const printWindow = window.open('', '_blank');
    const reportContent = document.getElementById('reportContent').innerHTML;
    
    printWindow.document.write(`
        <html>
            <head>
                <title>TruckTrack Report</title>
                <style>
                    body { font-family: Arial, sans-serif; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f5f5f5; }
                </style>
            </head>
            <body>
                <h1>TruckTrack Report</h1>
                ${reportContent}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

// Admin Management Functions
async function loadAdminManagement() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch admin users');
        }

        const users = await response.json();
        const tableBody = document.getElementById('adminTableBody');
        tableBody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                <td>
                    <button onclick="removeAdmin(${user.id})" class="delete-btn">Remove</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        handleApiError(error, 'Error loading admin users');
    }
}

async function removeAdmin(userId) {
    if (!confirm('Are you sure you want to remove this admin?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Failed to remove admin');
        }

        showNotification('Admin removed successfully', 'success');
        loadAdminManagement();
    } catch (error) {
        handleApiError(error, 'Error removing admin');
    }
}

function showAddAdminForm() {
    // Show registration form with admin role pre-selected
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('registerRole').value = 'admin';
    document.getElementById('registerKey').style.display = 'block';
    document.getElementById('registerKey').required = true;
    showRegister();
}

// Add event listeners for report type change
document.getElementById('reportType')?.addEventListener('change', function() {
    const monthInput = document.getElementById('reportMonth');
    const weekInput = document.getElementById('reportWeek');
    
    if (this.value === 'monthly') {
        monthInput.style.display = 'block';
        weekInput.style.display = 'none';
    } else {
        monthInput.style.display = 'none';
        weekInput.style.display = 'block';
    }
});

// Ensure the key input is shown for admin/master admin roles
function setupRoleKeyInput() {
    const roleSelect = document.getElementById('registerRole');
    const keyInput = document.getElementById('registerKey');
    if (!roleSelect || !keyInput) return;
    roleSelect.addEventListener('change', function() {
        if (this.value === 'admin' || this.value === 'master_admin') {
            keyInput.style.display = 'block';
            keyInput.required = true;
        } else {
            keyInput.style.display = 'none';
            keyInput.required = false;
        }
    });
}