// Common utilities for the application
// This file can be extended with shared functions

// Format date to Indonesian locale
function formatDateID(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

// Format time to HH:MM
function formatTimeShort(time) {
    if (!time) return '-';
    return time.substring(0, 5);
}

// Show alert message
function showAlertMessage(message, type, containerId = 'alert') {
    const alertBox = document.getElementById(containerId);
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 4000);
}

// Get API URL dynamically
function getApiUrl() {
    return window.location.origin + '/api';
}

// Get auth token
function getToken() {
    return localStorage.getItem('token');
}

// Get current user
function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}');
    } catch (e) {
        return {};
    }
}

// Logout function
function performLogout() {
    localStorage.clear();
    window.location.replace('/');
}
