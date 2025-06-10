    // auth.js
    const API_BASE_URL = 'http://127.0.0.1:5500/api';
    const AUTH_API_BASE_URL = 'http://127.0.0.1:5500'; // For login/register without /api prefix
function showLogin() {
    document.getElementById('loginFormContainer').style.display = '';
    document.getElementById('registerFormContainer').style.display = 'none';
}
function showRegister() {
    document.getElementById('loginFormContainer').style.display = 'none';
    document.getElementById('registerFormContainer').style.display = '';
}
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'notification ' + type;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}
function setToken(token) {
    localStorage.setItem('token', token);
}
function isLoggedIn() {
    return !!localStorage.getItem('token');
}
// Redirect to dashboard if already logged in
if (isLoggedIn()) {
    window.location.href = 'truck.html';
}
document.getElementById('showRegister').onclick = (e) => { e.preventDefault(); showRegister(); };
document.getElementById('showLogin').onclick = (e) => { e.preventDefault(); showLogin(); };
document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            setToken(data.token);
            showNotification('Login successful', 'success');
            setTimeout(() => window.location.href = 'truck.html', 1000);
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (err) {
        showNotification('Login failed', 'error');
    }
};
document.getElementById('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification('Registration successful! Please log in.', 'success');
            showLogin();
        } else {
            showNotification(data.error || 'Registration failed', 'error');
        }
    } catch (err) {
        showNotification('Registration failed', 'error');
    }
};
showLogin();

document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
}); 