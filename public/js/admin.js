const API_URL = window.location.origin + '/api';

// Cek auth
const token = localStorage.getItem('token');
const userData = JSON.parse(localStorage.getItem('user') || '{}');

if (!token) {
    window.location.replace('/');
    throw new Error('No token');
}

// Initialize Socket.io
const socket = io();
socket.on('connect', () => {
    console.log('Admin connected to real-time server');
    socket.emit('join-admin', { userId: userData.id });
});

socket.on('new-attendance', (data) => {
    showAlert(`🔔 Notifikasi: ${data.nama} (${data.status})`, 'success');
    if (document.getElementById('tab-dashboard').style.display !== 'none') {
        loadStats();
    }
    if (document.getElementById('tab-izin').style.display !== 'none') {
        loadIzinRequests();
    }
});

// ============ SOCKET EVENTS FOR LOGIN MANAGEMENT ============
socket.on('device-logged-out', (data) => {
    if (data.userId) {
        showAlert(`📱 Device login revoked for user ID: ${data.userId}`, 'info');
        // Refresh device sessions list if active
        if (document.getElementById('tab-device').style.display !== 'none') {
            loadDeviceSessions();
        }
    }
});

socket.on('login-blocked', (data) => {
    showAlert(`⛔ Login blocked for ${data.username} - Reason: ${data.reason}`, 'warning');
});

// ============ SINGLE DEVICE LOGIN SYSTEM ============
// Generate unique device ID
const DEVICE_ID = localStorage.getItem('device_id') || generateDeviceId();
localStorage.setItem('device_id', DEVICE_ID);

function generateDeviceId() {
    return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Send device info on every request
function getDeviceInfo() {
    return {
        device_id: DEVICE_ID,
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        screen_resolution: `${screen.width}x${screen.height}`,
        timestamp: new Date().toISOString()
    };
}

// ============ MODIFIED AUTH CHECK ============
// Check if current device is authorized
async function checkDeviceAuthorization() {
    try {
        const res = await fetch(`${API_URL}/auth/check-device`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                device_id: DEVICE_ID,
                user_id: userData.id
            })
        });

        const data = await res.json();
        if (!data.success) {
            localStorage.clear();
            window.location.replace('/?error=' + encodeURIComponent(data.message));
            return false;
        }
        return true;
    } catch (err) {
        console.error('Device check failed:', err);
        return true; // Fallback to allow if server error
    }
}

// Check auth on load
checkDeviceAuthorization();

if (userData.role !== 'admin' && userData.role !== 'superadmin') {
    window.location.replace('/');
}

// Variabel global
let currentQRCode = null;
let currentEditUserId = null;

// Init
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Admin page loaded');
    console.log('Device ID:', DEVICE_ID);

    // Load semua data
    await loadKelasOptions();
    await loadMapelOptions();

    // Show default tab
    showTab('tab-dashboard');

    // Load users
    loadUsers();

    // Event listener untuk form edit
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await saveEdit();
        });
    }

    // Event listener untuk form register
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await handleRegister();
        });
    }

    // Event listener untuk form session
    const sessionForm = document.getElementById('sessionForm');
    if (sessionForm) {
        sessionForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await handleCreateSession();
        });
    }
});

// ==================== FORMAT TANGGAL/WAKTU ====================
function formatTanggal(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

function formatWaktu(timeString) {
    if (!timeString) return '-';
    return timeString.substring(0, 5);
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ==================== TAB NAVIGATION ====================
function showTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });

    // Show target tab
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.style.display = 'block';

    // Load users if tab-users
    if (tabId === 'tab-users') loadUsers();

    // Update navigation buttons
    const tabMapping = {
        'tab-manage': 'manage',
        'tab-qr': 'qr',
        'tab-sessions': 'sessions',
        'tab-report': 'report',
        'tab-alpha': 'alpha',
        'tab-izin': 'izin',
        'tab-dashboard': 'dashboard',
        'tab-device': 'device',
        'tab-users': 'users'
    };

    Object.keys(tabMapping).forEach(id => {
        const btn = document.getElementById(`nav-${tabMapping[id]}`);
        if (btn) {
            btn.classList.remove('active-tab');
            btn.style.borderBottom = 'none';
        }
    });

    const activeBtn = document.getElementById(`nav-${tabMapping[tabId]}`);
    if (activeBtn) {
        activeBtn.classList.add('active-tab');
        activeBtn.style.borderBottom = '2px solid var(--primary)';
    }

    // Load data for the tab
    if (tabId === 'tab-dashboard') {
        loadDashboardOverview();
    } else if (tabId === 'tab-manage') {
        loadUsers();
    } else if (tabId === 'tab-qr') {
        // Clear any existing notifications
        const existingNotification = document.querySelector('.qr-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
    } else if (tabId === 'tab-sessions') {
        loadSessions();
    } else if (tabId === 'tab-report') {
        loadReport();
    } else if (tabId === 'tab-alpha') {
        loadSessionsForAlpha();
    } else if (tabId === 'tab-izin') {
        loadIzinRequests();
    } else if (tabId === 'tab-device') {
        loadDeviceSessions();
    }
}

// ==================== LOAD DASHBOARD OVERVIEW ====================
async function loadDashboardOverview() {
    try {
        const res = await fetch(`${API_URL}/admin/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            const stats = data.data;
            document.getElementById('adminTotalStudents').textContent = stats.totalStudents;
            document.getElementById('adminTodayPresent').textContent = stats.presentToday;
            document.getElementById('adminTodayIzin').textContent = stats.izinToday;
            document.getElementById('adminTodayAlpha').textContent = stats.alphaToday;

            // Update Live Feed
            const feed = document.getElementById('liveAttendanceFeed');
            if (stats.liveFeed && stats.liveFeed.length > 0) {
                feed.innerHTML = stats.liveFeed.map(item => `
                    <div class="feed-item" style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; gap:10px; align-items:center;">
                        <div style="width:10px; height:10px; border-radius:50%; background:${item.status === 'Hadir' ? '#27ae60' : '#f1c40f'};"></div>
                        <div style="flex:1;">
                            <strong>${item.nama}</strong> <span style="color:var(--text-dim); font-size:0.8rem;">(${item.kelas})</span><br>
                            <small style="color:var(--text-dim)">${item.mapel || 'Izin/Sakit'} - ${item.jam_absen}</small>
                        </div>
                        <span style="font-size:0.8rem; color:var(--text-dim)">${item.status}</span>
                    </div>
                `).join('');
            } else {
                feed.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:20px;">Belum ada aktivitas hari ini</p>';
            }

            // Update Current Sessions
            loadActiveSessionsForDashboard();
        }
    } catch (err) {
        console.error('Error load dashboard:', err);
    }
}

async function loadActiveSessionsForDashboard() {
    const container = document.getElementById('currentActiveSessions');
    try {
        const res = await fetch(`${API_URL}/common/sessions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const active = (data.data || []).filter(s => s.aktif);
            if (active.length > 0) {
                container.innerHTML = active.map(s => `
                    <div style="padding:10px; border-radius:8px; background:rgba(255,255,255,0.02); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${s.mapel_nama}</strong><br>
                            <small style="color:var(--text-dim)">${s.kelas} | ${s.jam_mulai} - ${s.jam_selesai}</small>
                        </div>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <span style="color:var(--success); font-weight:bold;">${s.attendance_count || 0} Hadir</span>
                            <button onclick="deleteSession(${s.id}, '${s.mapel_nama}')" 
                                    class="btn btn-danger" 
                                    style="padding:3px 8px; font-size:0.7rem;"
                                    title="Hapus sesi">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:20px;">Tidak ada sesi aktif</p>';
            }
        }
    } catch (err) {
        console.error('Error load active sessions for dashboard:', err);
    }
}

// ==================== LOAD KELAS ====================
async function loadKelasOptions() {
    try {
        const res = await fetch(`${API_URL}/common/classes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        if (data.success) {
            const kelasList = data.data || [];
            let optionsHTML = '<option value="">Pilih Kelas</option>';
            kelasList.forEach(k => {
                optionsHTML += `<option value="${k}">${k}</option>`;
            });

            // Update semua dropdown kelas
            const selects = ['regKelas', 'filterKelas', 'kelasSelect', 'reportKelas', 'editKelas', 'deviceKelasFilter'];
            selects.forEach(id => {
                const select = document.getElementById(id);
                if (select) {
                    if (id === 'filterKelas' || id === 'reportKelas' || id === 'deviceKelasFilter') {
                        select.innerHTML = '<option value="">Semua Kelas</option>' +
                            optionsHTML.replace('<option value="">Pilih Kelas</option>', '');
                    } else {
                        select.innerHTML = optionsHTML;
                    }
                }
            });
        }
    } catch (err) {
        showAlert('Gagal memuat data kelas', 'error');
    }
}

// ==================== LOAD MAPEL ====================
async function loadMapelOptions() {
    try {
        const res = await fetch(`${API_URL}/common/mapel`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!data.success) {
            console.error('Failed to load mapel:', data.message);
            return;
        }

        const mapelList = data.data || [];
        let optionsHTML = '<option value="">Pilih Mapel</option>';
        mapelList.forEach(m => {
            optionsHTML += `<option value="${m.id}">${m.nama}</option>`;
        });

        // Update semua dropdown mapel
        const mapelSelect = document.getElementById('mapelSelect');
        const reportMapel = document.getElementById('reportMapel');

        if (mapelSelect) mapelSelect.innerHTML = optionsHTML;
        if (reportMapel) reportMapel.innerHTML = '<option value="">Semua Mapel</option>' + optionsHTML.replace('<option value="">Pilih Mapel</option>', '');

        // Untuk alpha session, load sessions juga
        await loadSessionsForAlpha();

    } catch (err) {
        console.error('Error loading mapel:', err);
        showAlert('Gagal memuat data mapel', 'error');
    }
}

// ==================== LOAD SESSIONS FOR ALPHA ====================
async function loadSessionsForAlpha() {
    try {
        const res = await fetch(`${API_URL}/common/sessions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (data.success && data.data) {
            const select = document.getElementById('alphaSessionSelect');
            if (select) {
                select.innerHTML = '<option value="">Pilih sesi untuk melihat alpha</option>' +
                    data.data.map(s => `<option value="${s.id}">${s.mapel_nama} - ${s.kelas} (${formatTanggal(s.tanggal)} ${formatWaktu(s.jam_mulai)})</option>`).join('');
            }
        }
    } catch (err) {
        console.error('Error loading sessions:', err);
    }
}

// ==================== LOAD USERS ====================
async function loadUsers() {
    const kelas = document.getElementById('filterKelas')?.value || '';
    let url = `${API_URL}/admin/users`;
    if (kelas) url += `?kelas=${encodeURIComponent(kelas)}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        const tbody = document.getElementById('usersTable');

        if (!tbody) return;

        if (data.success && data.data.length > 0) {
            tbody.innerHTML = data.data.map(u => `
                <tr>
                    <td>
                        <div style="font-weight:600; color:var(--primary);">${u.nama}</div>
                        <div style="font-size:0.85rem; color:var(--text-muted);">${u.nisn} • ${u.kelas || '-'}</div>
                        <div style="font-size:0.75rem; color:var(--accent); text-transform:uppercase;">${u.role}</div>
                        ${u.device_status ? `
                            <div style="margin-top:5px; font-size:0.7rem; display:flex; align-items:center; gap:5px;">
                                <span style="color:${u.device_status === 'online' ? '#27ae60' : '#e74c3c'}">
                                    <i class="fas fa-mobile-alt"></i> ${u.device_status === 'online' ? 'Device Aktif' : 'Tidak Aktif'}
                                </span>
                            </div>
                        ` : ''}
                    </td>
                    <td>
                        <div style="display:flex;gap:5px;flex-wrap:wrap;">
                            <button onclick="viewUser(${u.id})" class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.75rem; display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-eye"></i> <span>Detail</span>
                            </button>
                            <button onclick="editUser(${u.id})" class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.75rem; color: var(--secondary); display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-edit"></i> <span>Edit</span>
                            </button>
                            <button onclick="resetDeviceLock(${u.id}, '${u.nama}')" class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.75rem; color: var(--accent); display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-unlock"></i> <span>Unlock</span>
                            </button>
                            <button onclick="manageUserDevice(${u.id}, '${u.nama}')" class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.75rem; color: var(--warning); display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-mobile-alt"></i> <span>Device</span>
                            </button>
                            <button onclick="deleteUser(${u.id}, '${u.nama}')" class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.75rem; color: var(--danger); display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-trash"></i> <span>Hapus</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Tidak ada data</td></tr>';
        }
    } catch (err) {
        showAlert('Gagal memuat data siswa', 'error');
    }
}

// ==================== MANAGE USER DEVICE ====================
async function manageUserDevice(userId, userName) {
    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/device-sessions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!data.success) {
            showAlert(data.message, 'error');
            return;
        }

        const deviceSessions = data.data || [];

        let html = `
            <h2 style="color: var(--warning);"><i class="fas fa-mobile-alt"></i> Device Login Management</h2>
            <p><strong>User:</strong> ${userName}</p>
            <div style="margin: 20px 0;">
                <button onclick="forceLogoutAllDevices(${userId}, '${userName}')" class="btn btn-danger" style="margin-right:10px;">
                    <i class="fas fa-sign-out-alt"></i> Logout Semua Device
                </button>
                <button onclick="resetLoginAttempts(${userId}, '${userName}')" class="btn btn-warning">
                    <i class="fas fa-redo"></i> Reset Login Attempts
                </button>
            </div>
            
            <h3>Active Device Sessions</h3>
        `;

        if (deviceSessions.length > 0) {
            html += `
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Device ID</th>
                                <th>Browser/OS</th>
                                <th>Login Time</th>
                                <th>Last Activity</th>
                                <th>IP Address</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${deviceSessions.map((device, index) => `
                                <tr>
                                    <td><code>${device.device_id || 'N/A'}</code></td>
                                    <td>
                                        <div style="font-size:0.8rem;">
                                            ${device.user_agent ? device.user_agent.substring(0, 50) + '...' : 'Unknown'}
                                        </div>
                                    </td>
                                    <td>${formatDateTime(device.login_time)}</td>
                                    <td>${formatDateTime(device.last_activity)}</td>
                                    <td>${device.ip_address || 'N/A'}</td>
                                    <td>
                                        <button onclick="forceLogoutDevice('${device.device_id}', ${userId})" 
                                                class="btn btn-sm btn-danger" 
                                                style="padding: 3px 8px; font-size: 0.7rem;">
                                            <i class="fas fa-sign-out-alt"></i> Logout
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            html += '<p style="text-align:center; color:var(--text-dim); padding:20px;">Tidak ada device aktif</p>';
        }

        // Show in modal
        const modal = document.getElementById('deviceModal');
        const content = document.getElementById('deviceModalContent');

        if (modal && content) {
            content.innerHTML = html;
            modal.style.display = 'flex';
        }

    } catch (err) {
        console.error('Error loading device sessions:', err);
        showAlert('Gagal memuat data device', 'error');
    }
}

// ==================== DEVICE MANAGEMENT FUNCTIONS ====================
async function forceLogoutAllDevices(userId, userName) {
    if (!confirm(`Yakin ingin logout semua device untuk ${userName}?\n\nUser harus login ulang di device yang diinginkan.`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/force-logout-all`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reason: 'Admin forced logout',
                admin_id: userData.id,
                admin_name: userData.nama
            })
        });

        const data = await res.json();
        if (data.success) {
            showAlert(`✅ Semua device untuk ${userName} telah di-logout!`, 'success');
            // Refresh device sessions list
            manageUserDevice(userId, userName);
            // Emit socket event
            socket.emit('admin-force-logout', { userId, admin: userData.nama });
        } else {
            showAlert(data.message, 'error');
        }
    } catch (err) {
        console.error('Error force logout:', err);
        showAlert('Gagal logout semua device', 'error');
    }
}

async function forceLogoutDevice(deviceId, userId) {
    if (!confirm('Yakin ingin logout device ini?')) return;

    try {
        const res = await fetch(`${API_URL}/admin/devices/${deviceId}/force-logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                reason: 'Admin forced device logout',
                admin_id: userData.id
            })
        });

        const data = await res.json();
        if (data.success) {
            showAlert('✅ Device berhasil di-logout!', 'success');
            // Refresh device sessions list
            if (userId) {
                const userName = prompt('Masukkan nama user untuk refresh data:') || 'User';
                manageUserDevice(userId, userName);
            }
            // Emit socket event
            socket.emit('device-logged-out', { deviceId, userId, admin: userData.nama });
        } else {
            showAlert(data.message, 'error');
        }
    } catch (err) {
        console.error('Error force logout device:', err);
        showAlert('Gagal logout device', 'error');
    }
}

async function resetLoginAttempts(userId, userName) {
    if (!confirm(`Reset login attempts untuk ${userName}?\n\nIni akan mengizinkan user login kembali jika diblokir.`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/reset-login-attempts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admin_id: userData.id,
                admin_name: userData.nama
            })
        });

        const data = await res.json();
        if (data.success) {
            showAlert(`✅ Login attempts untuk ${userName} telah direset!`, 'success');
            socket.emit('login-reset', { userId, userName });
        } else {
            showAlert(data.message, 'error');
        }
    } catch (err) {
        console.error('Error reset login attempts:', err);
        showAlert('Gagal reset login attempts', 'error');
    }
}

// ==================== LOAD ALL DEVICE SESSIONS ====================
async function loadDeviceSessions() {
    const kelas = document.getElementById('deviceKelasFilter')?.value || '';
    const status = document.getElementById('deviceStatusFilter')?.value || '';

    let url = `${API_URL}/admin/device-sessions?`;
    if (kelas) url += `kelas=${encodeURIComponent(kelas)}&`;
    if (status) url += `status=${status}&`;

    const container = document.getElementById('deviceSessionsTable');
    if (!container) return;

    container.innerHTML = '<tr><td colspan="7" style="text-align:center;">Memuat...</td></tr>';

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (data.success && data.data) {
            if (data.data.length === 0) {
                container.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Tidak ada data device</td></tr>';
                return;
            }

            container.innerHTML = data.data.map(device => `
                <tr>
                    <td>
                        <div style="font-weight:600;">${device.nama}</div>
                        <div style="font-size:0.8rem; color:var(--text-dim);">${device.nisn} • ${device.kelas}</div>
                        <div style="font-size:0.7rem; color:${device.role === 'student' ? 'var(--primary)' : 'var(--accent)'}">
                            ${device.role === 'student' ? 'Siswa' : device.role === 'teacher' ? 'Guru' : 'Admin'}
                        </div>
                    </td>
                    <td>
                        <code style="font-size:0.7rem; background:rgba(255,255,255,0.05); padding:2px 5px; border-radius:3px;">
                            ${device.device_id?.substring(0, 15)}...
                        </code>
                    </td>
                    <td>
                        <div style="font-size:0.8rem;">
                            ${device.user_agent ? getBrowserInfo(device.user_agent) : 'Unknown'}
                        </div>
                        <div style="font-size:0.7rem; color:var(--text-dim);">
                            ${device.platform || 'Unknown OS'}
                        </div>
                    </td>
                    <td>${formatDateTime(device.last_activity)}</td>
                    <td>${device.ip_address || 'N/A'}</td>
                    <td>
                        <span class="badge ${device.is_active ? 'badge-success' : 'badge-danger'}" style="font-size:0.75rem;">
                            ${device.is_active ? 'Online' : 'Offline'}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button onclick="forceLogoutDevice('${device.device_id}', ${device.user_id})" 
                                    class="btn btn-danger btn-sm" 
                                    style="padding:3px 8px; font-size:0.7rem;"
                                    title="Logout Device">
                                <i class="fas fa-sign-out-alt"></i>
                            </button>
                            <button onclick="viewDeviceDetails('${device.device_id}')" 
                                    class="btn btn-secondary btn-sm" 
                                    style="padding:3px 8px; font-size:0.7rem;"
                                    title="Detail Device">
                                <i class="fas fa-info-circle"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } else {
            container.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#e74c3c;">${data.message || 'Gagal memuat'}</td></tr>`;
        }
    } catch (err) {
        console.error('Error load device sessions:', err);
        container.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#e74c3c;">Terjadi kesalahan sistem</td></tr>';
    }
}

function getBrowserInfo(userAgent) {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Browser';
}

async function viewDeviceDetails(deviceId) {
    try {
        const res = await fetch(`${API_URL}/admin/devices/${deviceId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!data.success) {
            showAlert(data.message, 'error');
            return;
        }

        const device = data.data;

        let html = `
            <h3><i class="fas fa-mobile-alt"></i> Device Details</h3>
            <div class="detail-grid">
                <div><strong>Device ID:</strong></div><div><code>${device.device_id}</code></div>
                <div><strong>User:</strong></div><div>${device.nama} (${device.nisn})</div>
                <div><strong>Kelas:</strong></div><div>${device.kelas}</div>
                <div><strong>IP Address:</strong></div><div>${device.ip_address || 'N/A'}</div>
                <div><strong>Browser:</strong></div><div>${device.user_agent || 'Unknown'}</div>
                <div><strong>Platform:</strong></div><div>${device.platform || 'Unknown'}</div>
                <div><strong>Login Time:</strong></div><div>${formatDateTime(device.login_time)}</div>
                <div><strong>Last Activity:</strong></div><div>${formatDateTime(device.last_activity)}</div>
                <div><strong>Status:</strong></div><div class="${device.is_active ? 'status active' : 'status inactive'}">
                    ${device.is_active ? 'Online' : 'Offline'}
                </div>
            </div>
            <div class="modal-actions" style="margin-top:20px;">
                <button onclick="forceLogoutDevice('${device.device_id}', ${device.user_id})" class="btn btn-danger">
                    <i class="fas fa-sign-out-alt"></i> Force Logout
                </button>
                <button onclick="closeModal('deviceDetailModal')" class="btn btn-secondary">Tutup</button>
            </div>
        `;

        // Show in modal
        const modal = document.getElementById('deviceDetailModal');
        const content = document.getElementById('deviceDetailModalContent');

        if (modal && content) {
            content.innerHTML = html;
            modal.style.display = 'flex';
        }

    } catch (err) {
        console.error('Error viewing device details:', err);
        showAlert('Gagal memuat detail device', 'error');
    }
}


async function viewUser(id) {
    try {
        const res = await fetch(`${API_URL}/admin/users/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!data.success) {
            showAlert(data.message, 'error');
            return;
        }

        const u = data.data;
        const modalContent = document.getElementById('studentModalContent');

        modalContent.innerHTML = `
            <h2>👤 Detail Pengguna</h2>
            <div class="detail-grid">
                <div><strong>NISN:</strong></div><div>${u.nisn}</div>
                <div><strong>Nama:</strong></div><div>${u.nama}</div>
                <div><strong>Kelas:</strong></div><div>${u.kelas || '-'}</div>
                <div><strong>Email:</strong></div><div>${u.email || '-'}</div>
                <div><strong>Telepon:</strong></div><div>${u.telepon || '-'}</div>
                <div><strong>Role:</strong></div><div>${getRoleDisplay(u.role)}</div>
                <div><strong>Status:</strong></div><div class="status ${u.is_active ? 'active' : 'inactive'}">
                    ${u.is_active ? 'Aktif' : 'Nonaktif'}
                </div>
                <div><strong>Device Status:</strong></div><div class="${u.device_status === 'online' ? 'status active' : 'status inactive'}">
                    ${u.device_status === 'online' ? 'Device Aktif' : 'Tidak Ada Device'}
                </div>
                ${u.login_attempts ? `<div><strong>Login Attempts:</strong></div><div>${u.login_attempts}</div>` : ''}
                <div><strong>Dibuat:</strong></div><div>${formatTanggal(u.created_at)}</div>
            </div>
            <div class="modal-actions">
                <button onclick="editUser(${u.id})" class="btn-edit">
                    ✏️ Edit Data
                </button>
                <button onclick="manageUserDevice(${u.id}, '${u.nama}')" class="btn btn-warning">
                    📱 Kelola Device
                </button>
                <button onclick="closeModal('studentModal')" class="btn-secondary">
                    ✕ Tutup
                </button>
            </div>
        `;

        openModal('studentModal');

    } catch (err) {
        showAlert('Gagal memuat data siswa', 'error');
    }
}


async function editUser(id) {
    try {
        const res = await fetch(`${API_URL}/admin/users/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!data.success) {
            showAlert(data.message, 'error');
            return;
        }

        const u = data.data;
        currentEditUserId = id;


        closeModal('studentModal');


        document.getElementById('editId').value = u.id;
        document.getElementById('editNisn').value = u.nisn || '';
        document.getElementById('editNama').value = u.nama || '';
        document.getElementById('editEmail').value = u.email || '';
        document.getElementById('editTelepon').value = u.telepon || '';
        document.getElementById('editStatus').value = u.is_active ? '1' : '0';
        document.getElementById('editRole').value = u.role || 'student';


        if (!document.getElementById('editDeviceRestriction')) {
            const deviceRestrictionHTML = `
                <div class="form-group">
                    <label>Device Restriction</label>
                    <select id="editDeviceRestriction">
                        <option value="1" ${u.device_restriction === 1 ? 'selected' : ''}>Single Device (Default)</option>
                        <option value="0" ${u.device_restriction === 0 ? 'selected' : ''}>Multi Device (Testing Only)</option>
                    </select>
                </div>
            `;

            const editRoleElement = document.getElementById('editRole');
            if (editRoleElement && editRoleElement.parentElement) {
                const parentDiv = editRoleElement.parentElement.parentElement;
                if (parentDiv) {
                    const newDiv = document.createElement('div');
                    newDiv.className = 'grid-2';
                    newDiv.innerHTML = deviceRestrictionHTML;
                    parentDiv.appendChild(newDiv);
                }
            }
        }


        await loadEditKelasOptions(u.kelas || '');

        openModal('editModal');

    } catch (err) {
        console.error('Error editing user:', err);
        showAlert('Gagal memuat data untuk edit', 'error');
    }
}


async function loadEditKelasOptions(currentKelas = '') {
    try {
        const res = await fetch(`${API_URL}/common/classes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        const kelasSelect = document.getElementById('editKelas');

        if (data.success && kelasSelect) {
            const kelasList = data.data || [];
            let optionsHTML = '<option value="">Pilih Kelas</option>';

            kelasList.forEach(k => {
                const selected = k === currentKelas ? 'selected' : '';
                optionsHTML += `<option value="${k}" ${selected}>${k}</option>`;
            });

            kelasSelect.innerHTML = optionsHTML;
        }
    } catch (err) {
        console.error('Error loading kelas options:', err);
    }
}


async function saveEdit() {
    const id = document.getElementById('editId').value;
    const nisn = document.getElementById('editNisn').value.trim();
    const nama = document.getElementById('editNama').value.trim();
    const kelas = document.getElementById('editKelas').value;
    const email = document.getElementById('editEmail').value.trim();
    const telepon = document.getElementById('editTelepon').value.trim();
    const status = document.getElementById('editStatus').value;
    const role = document.getElementById('editRole').value;
    const deviceRestriction = document.getElementById('editDeviceRestriction')?.value || '1';

    // Validasi
    if (!nisn) {
        showAlert('NISN wajib diisi!', 'error');
        return;
    }

    if (!nama) {
        showAlert('Nama wajib diisi!', 'error');
        return;
    }

    if (!kelas) {
        showAlert('Kelas wajib diisi!', 'error');
        return;
    }

    if (!role) {
        showAlert('Role wajib diisi!', 'error');
        return;
    }

    const btn = document.querySelector('#editForm button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {

        const payload = {
            nisn: nisn,
            nama: nama,
            kelas: kelas,
            email: email || null,
            telepon: telepon || null,
            is_active: parseInt(status),
            role: role,
            device_restriction: parseInt(deviceRestriction)
        };

        console.log('Sending payload:', payload);

        const res = await fetch(`${API_URL}/admin/users/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log('Response:', data);

        if (data.success) {
            showAlert('✅ Data berhasil diperbarui!', 'success');
            closeModal('editModal');
            loadUsers();


            const detailModal = document.getElementById('studentModal');
            if (detailModal && detailModal.style.display === 'block') {
                viewUser(id);
            }
        } else {
            showAlert(data.message || 'Gagal menyimpan perubahan', 'error');
        }
    } catch (err) {
        console.error('Error saving edit:', err);
        showAlert('Gagal menyimpan perubahan: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ==================== REGISTER SISWA ====================
async function handleRegister() {
    const nisn = document.getElementById('regNisn')?.value.trim();
    const nama = document.getElementById('regNama')?.value.trim();
    const kelas = document.getElementById('regKelas')?.value;
    const password = document.getElementById('regPassword')?.value;
    const email = document.getElementById('regEmail')?.value.trim();
    const telepon = document.getElementById('regTelepon')?.value.trim();

    if (!nisn || !nama || !kelas || !password) {
        showAlert('NISN, Nama, Kelas, dan Password wajib diisi!', 'error');
        return;
    }

    const btn = document.querySelector('#registerForm button');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Mendaftarkan...';

    try {
        const res = await fetch(`${API_URL}/admin/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                nisn,
                nama,
                kelas,
                password,
                email: email || null,
                telepon: telepon || null,
                role: 'student',
                device_restriction: 1
            })
        });

        const data = await res.json();

        if (data.success) {
            showAlert('✅ Siswa berhasil didaftarkan!', 'success');
            document.getElementById('registerForm').reset();
            loadUsers();
        } else {
            showAlert(data.message, 'error');
        }
    } catch (err) {
        console.error('Error register:', err);
        showAlert('Gagal mendaftarkan siswa', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}


async function handleCreateSession() {
    const mapel_id = document.getElementById('mapelSelect')?.value;
    const kelas = document.getElementById('kelasSelect')?.value;
    const jam_mulai = document.getElementById('startTime')?.value;
    const jam_selesai = document.getElementById('endTime')?.value;

    if (!mapel_id || !kelas || !jam_mulai || !jam_selesai) {
        showAlert('Semua field wajib diisi!', 'error');
        return;
    }



    const timeStart = jam_mulai.split(':').map(Number);
    const timeEnd = jam_selesai.split(':').map(Number);
    const minutesStart = timeStart[0] * 60 + timeStart[1];
    const minutesEnd = timeEnd[0] * 60 + timeEnd[1];



    let isOvernight = false;
    if (minutesStart >= minutesEnd) {
        isOvernight = true;
        console.log(`Info: Session spans across midnight (${jam_mulai} to ${jam_selesai})`);


    }



    const btn = document.querySelector('#sessionForm button');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Membuat...';

    try {
        const res = await fetch(`${API_URL}/common/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                mapel_id,
                kelas,
                jam_mulai,
                jam_selesai,
                created_by: userData.id,
                created_by_role: userData.role
            })
        });

        const data = await res.json();

        if (data.success) {
            currentQRCode = data.data.kode_qr;
            document.getElementById('sessionCode').value = currentQRCode;

            // Generate QR
            const qrDiv = document.getElementById('qrcode');
            qrDiv.innerHTML = '';

            new QRCode(qrDiv, {
                text: currentQRCode,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            qrDiv.style.display = 'flex';
            document.getElementById('downloadBtn').style.display = 'block';
            showAlert('✅ QR Code berhasil dibuat dan disinkronkan!', 'success');

            // Emit event ke socket.io untuk beri tahu semua user
            socket.emit('new-session-created', {
                session_id: data.data.id,
                kode_qr: currentQRCode,
                mapel_nama: data.data.mapel_nama || 'Mata Pelajaran',
                kelas: data.data.kelas,
                created_by: userData.nama || 'Admin'
            });

            // Refresh daftar sesi aktif
            loadSessions();
            loadActiveSessionsForDashboard();

        } else {
            showAlert(data.message, 'error');
        }
    } catch (err) {
        console.error('Error create session:', err);
        showAlert('Gagal membuat sesi', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ==================== DOWNLOAD QR ====================
function downloadQR() {
    const canvas = document.querySelector('#qrcode canvas');
    if (canvas && currentQRCode) {
        const link = document.createElement('a');
        link.download = `qr-${currentQRCode}-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showAlert('✅ QR Code berhasil diunduh!', 'success');
    } else {
        showAlert('Tidak ada QR Code untuk diunduh', 'error');
    }
}

// ==================== LOAD SESSIONS ====================
async function loadSessions() {
    try {
        const res = await fetch(`${API_URL}/common/sessions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        const container = document.getElementById('sessionsList');

        if (!container) return;

        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(s => `
                <div class="session-item" id="session-${s.id}">
                    <div style="flex: 1;">
                        <strong>${s.mapel_nama}</strong> - ${s.kelas}<br>
                        <small>${formatTanggal(s.tanggal)} | ${formatWaktu(s.jam_mulai)} - ${formatWaktu(s.jam_selesai)}</small>
                        <div style="margin-top: 5px; font-size: 0.85rem; color: var(--text-dim);">
                            <i class="fas fa-user"></i> Dibuat oleh: ${s.created_by_name || 'System'}
                        </div>
                    </div>
                    <span class="session-status ${s.aktif ? 'active' : 'inactive'}">
                        ${s.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                    <div class="session-actions">
                        <button onclick="viewSession(${s.id})">📋 Detail</button>
                        <button onclick="toggleSession(${s.id}, ${s.aktif ? 0 : 1})" class="${s.aktif ? 'btn-danger' : 'btn-success'}">
                            ${s.aktif ? '⏸️ Nonaktifkan' : '▶️ Aktifkan'}
                        </button>
                        <button onclick="confirmDeleteSession(${s.id}, '${s.mapel_nama}', '${s.kelas}')" 
                                class="btn-delete" 
                                style="background: rgba(231, 76, 60, 0.1); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.2);">
                            🗑️ Hapus
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Tidak ada sesi</p>';
        }
    } catch (err) {
        showAlert('Gagal memuat sesi', 'error');
    }
}

// ==================== CONFIRM DELETE SESSION ====================
async function confirmDeleteSession(id, mapelNama, kelas) {
    // Tampilkan modal konfirmasi custom
    const modalHTML = `
        <div id="deleteSessionModal" class="modal" style="display: flex;">
            <div class="modal-content" style="max-width: 400px;">
                <h3 style="color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i> Konfirmasi Hapus</h3>
                <p>Apakah Anda yakin ingin menghapus sesi ini?</p>
                <p><strong>${mapelNama} - ${kelas}</strong></p>
                <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px;">
                    <button onclick="deleteSession(${id})" class="btn btn-danger" style="flex: 1;">
                        <i class="fas fa-trash"></i> Ya, Hapus
                    </button>
                    <button onclick="closeDeleteModal()" class="btn btn-secondary" style="flex: 1;">
                        <i class="fas fa-times"></i> Batal
                    </button>
                </div>
            </div>
        </div>
    `;

    // Tambahkan modal ke body
    const existingModal = document.getElementById('deleteSessionModal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteSessionModal');
    if (modal) modal.remove();
}

// ==================== DELETE SESSION ====================
async function deleteSession(id) {
    try {
        closeDeleteModal();

        const res = await fetch(`${API_URL}/common/sessions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        if (data.success) {
            showAlert('✅ Sesi berhasil dihapus!', 'success');

            // Hapus dari tampilan tanpa reload
            const sessionElement = document.getElementById(`session-${id}`);
            if (sessionElement) {
                sessionElement.style.transition = 'opacity 0.3s';
                sessionElement.style.opacity = '0';
                setTimeout(() => {
                    sessionElement.remove();
                    // Jika tidak ada sesi lagi, tampilkan pesan
                    const container = document.getElementById('sessionsList');
                    if (container.children.length === 0) {
                        container.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Tidak ada sesi</p>';
                    }
                }, 300);
            }

            // Refresh dashboard
            loadActiveSessionsForDashboard();

            // Emit socket event untuk hapus session dari client lain
            socket.emit('session-deleted', { session_id: id });

        } else {
            showAlert(data.message || 'Gagal menghapus sesi', 'error');
        }
    } catch (err) {
        console.error('Error deleting session:', err);
        showAlert('Gagal menghapus sesi: ' + err.message, 'error');
    }
}

// ==================== VIEW SESSION DETAIL ====================
async function viewSession(id) {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailModalContent');

    if (modal && content) {
        modal.style.display = 'block';
        content.innerHTML = '<p style="text-align:center;padding:20px;">⏳ Memuat data...</p>';
    }

    try {
        const res = await fetch(`${API_URL}/common/sessions/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!data.success) {
            content.innerHTML = `<p style="color:#e74c3c;text-align:center;">${data.message}</p>`;
            return;
        }

        const s = data.data;

        let html = `
            <h2>${s.mapel_nama}</h2>
            <div class="detail-grid">
                <div><strong>Kelas</strong></div><div>: ${s.kelas}</div>
                <div><strong>Tanggal</strong></div><div>: ${formatTanggal(s.tanggal)}</div>
                <div><strong>Waktu</strong></div><div>: ${formatWaktu(s.jam_mulai)} - ${formatWaktu(s.jam_selesai)}</div>
                <div><strong>Guru</strong></div><div>: ${s.teacher_name || '-'}</div>
                <div><strong>Dibuat oleh</strong></div><div>: ${s.created_by_name || 'System'}</div>
                <div><strong>Status</strong></div><div class="status ${s.aktif ? 'active' : 'inactive'}">${s.aktif ? 'Aktif' : 'Nonaktif'}</div>
                <div><strong>Kode QR</strong></div><div>: <code style="background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 3px;">${s.kode_qr}</code></div>
            </div>
            
            <h3>Daftar Hadir (${s.attendance_list?.length || 0})</h3>
            <div class="attendance-list">
                <table>
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>NISN</th>
                            <th>Nama</th>
                            <th>Waktu</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (s.attendance_list && s.attendance_list.length > 0) {
            html += s.attendance_list.map((a, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${a.nisn}</td>
                    <td>${a.nama}</td>
                    <td>${formatWaktu(a.jam_absen)}</td>
                    <td><span class="attendance-status ${a.status}">${a.status ? a.status.toUpperCase() : '-'}</span></td>
                </tr>
            `).join('');
        } else {
            html += '<tr><td colspan="5" style="text-align:center;padding:20px;">Belum ada yang absen</td></tr>';
        }

        html += `
                    </tbody>
                </table>
            </div>
            <div class="modal-actions">
                ${s.aktif ? `
                <button onclick="toggleSession(${s.id}, 0)" class="btn-danger">
                    ⛔ Nonaktifkan Sesi
                </button>
                ` : `
                <button onclick="toggleSession(${s.id}, 1)" class="btn-success">
                    ✅ Aktifkan Sesi
                </button>
                `}
                <button onclick="confirmDeleteSession(${s.id}, '${s.mapel_nama}', '${s.kelas}')" class="btn-delete">
                    🗑️ Hapus Sesi
                </button>
            </div>
        `;

        if (content) content.innerHTML = html;

    } catch (err) {
        console.error('Error viewing session:', err);
        if (content) content.innerHTML = '<p style="color:#e74c3c;text-align:center;">Gagal memuat detail sesi</p>';
    }
}

// ==================== TOGGLE SESSION ====================
async function toggleSession(id, aktif) {
    const action = aktif ? 'mengaktifkan' : 'menonaktifkan';
    if (!confirm(`Yakin ingin ${action} sesi ini?`)) return;

    try {
        const res = await fetch(`${API_URL}/common/sessions/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ aktif: aktif })
        });

        const data = await res.json();

        if (data.success) {
            showAlert(aktif ? '✅ Sesi diaktifkan!' : '✅ Sesi dinonaktifkan!', 'success');
            loadSessions();
            loadActiveSessionsForDashboard();

            // Emit socket event untuk sinkronisasi status
            socket.emit('session-status-changed', {
                session_id: id,
                aktif: aktif
            });

            // Refresh modal jika terbuka
            const modal = document.getElementById('detailModal');
            if (modal && modal.style.display === 'block') {
                viewSession(id);
            }
        } else {
            showAlert(data.message || 'Gagal mengubah status', 'error');
        }
    } catch (err) {
        showAlert('Gagal mengubah status sesi', 'error');
    }
}

// ==================== DELETE USER ====================
async function deleteUser(id, nama) {
    if (!confirm(`APAKAH ANDA YAKIN?\n\nData pengguna "${nama || 'ini'}" akan dihapus permanen dari sistem.`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        if (data.success) {
            showAlert('✅ Pengguna berhasil dihapus!', 'success');
            loadUsers();
        } else {
            showAlert(data.message || 'Gagal menghapus pengguna', 'error');
        }
    } catch (err) {
        showAlert('Gagal menghapus pengguna', 'error');
    }
}

// ==================== LOAD REPORT ====================
async function loadReport() {
    const kelas = document.getElementById('reportKelas')?.value || '';
    const mapel_id = document.getElementById('reportMapel')?.value || '';
    const tanggal = document.getElementById('reportTanggal')?.value || '';

    let url = `${API_URL}/common/admin/report?`;
    if (kelas) url += `kelas=${encodeURIComponent(kelas)}&`;
    if (mapel_id) url += `mapel_id=${mapel_id}&`;
    if (tanggal) url += `tanggal=${tanggal}&`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        const tbody = document.getElementById('reportTable');

        if (!tbody) return;

        if (data.success && data.data.length > 0) {
            tbody.innerHTML = data.data.map(r => `
                <tr>
                    <td>${r.nama}</td>
                    <td>${r.nisn}</td>
                    <td>${r.kelas}</td>
                    <td>${r.mapel}</td>
                    <td>${r.tanggal}</td>
                    <td>${r.jam_absen}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Tidak ada data</td></tr>';
        }
    } catch (err) {
        showAlert('Gagal memuat laporan', 'error');
    }
}

// ==================== EXPORT EXCEL ====================
async function exportData(format) {
    const kelas = document.getElementById('reportKelas')?.value || '';
    const mapel_id = document.getElementById('reportMapel')?.value || '';
    const tanggal = document.getElementById('reportTanggal')?.value || '';

    let url = `${API_URL}/admin/report/export?format=${format}&`;
    if (kelas) url += `kelas=${encodeURIComponent(kelas)}&`;
    if (mapel_id) url += `mapel_id=${mapel_id}&`;
    if (tanggal) url += `tanggal=${tanggal}&`;

    window.open(url, '_blank');
}

// ==================== LOAD ALPHA REPORT ====================
async function loadAlphaReport() {
    const sessionId = document.getElementById('alphaSessionSelect')?.value;
    const container = document.getElementById('alphaReport');

    if (!sessionId) {
        if (container) container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Pilih sesi terlebih dahulu</p>';
        return;
    }

    if (container) container.innerHTML = '<p style="text-align:center;padding:20px;">⏳ Memuat data...</p>';

    try {
        const res = await fetch(`${API_URL}/common/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<p style="color:#e74c3c;text-align:center;">${data.message}</p>`;
            return;
        }

        const session = data.data;
        const attendedNisns = (session.attendance_list || []).map(a => a.nisn);

        const studentsRes = await fetch(`${API_URL}/admin/users?kelas=${encodeURIComponent(session.kelas)}&role=student`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const studentsData = await studentsRes.json();
        if (!studentsData.success) {
            container.innerHTML = `<p style="color:#e74c3c;text-align:center;">Gagal memuat data siswa</p>`;
            return;
        }

        const alphaStudents = studentsData.data.filter(s => !attendedNisns.includes(s.nisn));

        let html = `
            <div class="session-info">
                <strong>${session.mapel_nama}</strong> - ${session.kelas}<br>
                <small>${formatTanggal(session.tanggal)} | ${formatWaktu(session.jam_mulai)} - ${formatWaktu(session.jam_selesai)}</small>
            </div>
            <h3 style="color:#e74c3c;margin:15px 0;">⚠️ Siswa Alpha: ${alphaStudents.length} orang</h3>
        `;

        if (alphaStudents.length > 0) {
            html += `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>NISN</th>
                                <th>Nama</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${alphaStudents.map((s, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${s.nisn}</td>
                                    <td>${s.nama}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            html += '<p style="color:#27ae60;text-align:center;padding:20px;">✅ Semua siswa hadir!</p>';
        }

        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading alpha report:', err);
        if (container) container.innerHTML = '<p style="color:#e74c3c;text-align:center;">Gagal memuat laporan alpha</p>';
    }
}

// ==================== LOAD IZIN REQUESTS ====================
async function loadIzinRequests() {
    const tbody = document.getElementById('izinRequestsTable');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Memuat...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/admin/izin`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (data.success && data.data) {
            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Tidak ada permohonan izin</td></tr>';
                return;
            }

            tbody.innerHTML = data.data.map(item => {
                let approvalBadge = '<span class="badge" style="background:rgba(255,255,255,0.1)">PENDING</span>';
                if (item.is_approved === 1) approvalBadge = '<span class="badge badge-success">DISETUJUI</span>';
                if (item.is_approved === -1) approvalBadge = '<span class="badge badge-danger">DITOLAK</span>';

                return `
                    <tr>
                        <td>
                            <strong>${item.nama}</strong><br>
                            <small style="color:var(--text-dim)">${item.nisn} | ${item.kelas}</small>
                        </td>
                        <td><span class="badge ${item.status === 'Sakit' ? 'badge-danger' : 'badge-warning'}">${item.status}</span></td>
                        <td>${approvalBadge}</td>
                        <td>${item.keterangan || '-'}</td>
                        <td>${formatTanggal(item.tanggal)}<br><small>${item.jam_absen}</small></td>
                        <td>
                            <div style="display:flex; gap:5px;">
                                <button onclick="setIzinRequestStatus(${item.id}, 1)" class="btn btn-success" style="padding:5px 10px;" title="Setujui">
                                    <i class="fas fa-check"></i>
                                </button>
                                <button onclick="setIzinRequestStatus(${item.id}, -1)" class="btn btn-danger" style="padding:5px 10px;" title="Tolak">
                                    <i class="fas fa-times"></i>
                                </button>
                                <button onclick="deleteIzinRequest(${item.id})" class="btn btn-secondary" style="padding:5px 10px; background:rgba(231, 76, 60, 0.2); color:#e74c3c; border-color:rgba(231, 76, 60, 0.2);" title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#e74c3c;">${data.message || 'Gagal memuat'}</td></tr>`;
        }
    } catch (err) {
        console.error('Error load izin:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#e74c3c;">Terjadi kesalahan sistem</td></tr>';
    }
}

// ==================== RESET PASSWORD ====================
async function resetPassword(id) {
    const newPass = prompt('Masukkan password baru (minimal 6 karakter):');
    if (!newPass) return;

    if (newPass.length < 6) {
        showAlert('Password minimal 6 karakter!', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/admin/users/${id}/reset-password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password: newPass })
        });

        const data = await res.json();

        if (data.success) {
            showAlert('✅ Password berhasil direset!', 'success');
        } else {
            showAlert(data.message || 'Gagal reset password', 'error');
        }
    } catch (err) {
        showAlert('Gagal reset password', 'error');
    }
}

async function resetDeviceLock(id, nama) {
    if (!confirm(`Reset device lock untuk ${nama}?\n\nUser akan bisa login dari perangkat baru setelah reset.`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/users/${id}/reset-device`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (data.success) {
            showAlert('✅ Device lock berhasil direset!', 'success');
            loadUsers(); // Refresh user list
        } else {
            showAlert(data.message || 'Gagal reset device lock', 'error');
        }
    } catch (err) {
        console.error('Reset device lock error:', err);
        showAlert('Gagal reset device lock', 'error');
    }
}

// ==================== MODAL FUNCTIONS ====================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modals = ['studentModal', 'editModal', 'detailModal', 'deleteSessionModal', 'deviceModal', 'deviceDetailModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target == modal) {
            modal.style.display = "none";
        }
    });
};

// ==================== UTILITIES ====================
function logout() {
    if (confirm('Yakin ingin logout?')) {
        // Notify server about logout
        fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                device_id: DEVICE_ID,
                user_id: userData.id
            })
        }).catch(() => {
            // Ignore errors on logout
        });

        localStorage.clear();
        window.location.replace('/');
    }
}

function showAlert(msg, type) {
    const alert = document.getElementById('alert');
    if (!alert) return;

    alert.className = `alert alert-${type}`;
    alert.textContent = msg;
    alert.style.display = 'block';

    setTimeout(() => {
        alert.style.display = 'none';
    }, 4000);
}

function getRoleDisplay(role) {
    switch (role) {
        case 'student': return 'Siswa';
        case 'teacher': return 'Guru';
        case 'admin': return 'Admin';
        case 'super_admin': return 'Super Admin';
        default: return role;
    }
}

async function runAutoAlpha() {
    if (!confirm('Tandai semua siswa yang tidak absen hari ini sebagai "Alpha"? Tindakan ini sebaiknya dilakukan setelah jam sekolah selesai.')) return;

    try {
        const response = await fetch(`${API_URL}/admin/auto-alpha`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();

        if (data.success) {
            showAlert(`✅ ${data.message}`, 'success');
            if (typeof loadStats === 'function') loadStats();
        } else {
            showAlert(data.message || 'Gagal menjalankan Auto-Alpha', 'error');
        }
    } catch (e) {
        console.error('Auto-Alpha error:', e);
        showAlert('Terjadi kesalahan sistem', 'error');
    }
}

// ==================== IZIN MANAGEMENT ====================
async function setIzinRequestStatus(id, status) {
    const action = status === 1 ? 'menyetujui' : 'menolak';
    if (!confirm(`Yakin ingin ${action} permohonan izin ini?`)) return;

    try {
        const response = await fetch(`${API_URL}/admin/izin/${id}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        const data = await response.json();

        if (data.success) {
            showAlert(`✅ ${data.message}`, 'success');
            loadIzinRequests();
            if (typeof loadStats === 'function') loadStats();
        } else {
            showAlert(data.message || 'Gagal update status', 'error');
        }
    } catch (e) {
        console.error('Update izin error:', e);
        showAlert('Terjadi kesalahan sistem', 'error');
    }
}

async function deleteIzinRequest(id) {
    if (!confirm('Hapus permohonan izin ini? Data dan file lampiran akan dihapus permanen.')) return;

    try {
        const response = await fetch(`${API_URL}/admin/izin/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            showAlert('✅ Permohonan izin berhasil dihapus', 'success');
            loadIzinRequests();
            if (typeof loadStats === 'function') loadStats();
        } else {
            showAlert(data.message || 'Gagal menghapus izin', 'error');
        }
    } catch (e) {
    }
}

// ==================== USER MANAGEMENT (SUPERADMIN) ====================

// Show/Hide Kelas Field based on Role
function toggleKelasField(role) {
    const field = document.getElementById('kelasField');
    const select = document.querySelector('select[name="kelas"]');
    if (role === 'student' && field && select) {
        field.style.display = 'block';
        select.required = true;
    } else if (field && select) {
        field.style.display = 'none';
        select.required = false;
        select.value = '';
    }
}

// Load Users List
async function loadUsers() {
    // Only for superadmin
    if (userData.role !== 'superadmin') return;

    // Show nav button
    const navBtn = document.getElementById('nav-users');
    if (navBtn) navBtn.style.display = 'inline-block';

    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            tbody.innerHTML = result.data.map(user => `
                <tr>
                    <td>${user.nisn}</td>
                    <td>${user.nama}</td>
                    <td><span class="badge ${getRoleBadgeClass(user.role)}">${user.role}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})" ${user.role === 'superadmin' ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">${result.message}</td></tr>`;
        }
    } catch (e) {
        console.error('Load users error:', e);
    }
}

function getRoleBadgeClass(role) {
    switch (role) {
        case 'superadmin': return 'badge-warning'; // Goldish
        case 'admin': return 'badge-primary';
        case 'teacher': return 'badge-info';
        case 'student': return 'badge-secondary';
        default: return 'badge-secondary';
    }
}

// Create User Modal
function showCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    if (modal) {
        modal.style.display = 'block';
        toggleKelasField('student'); // Default
        loadKelasOptionsForUserModal();
    } else {
        console.error('Modal createUserModal not found!');
        alert('Modal error: createUserModal not found');
    }
}

function closeCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('createUserForm');
    if (form) form.reset();
}

async function loadKelasOptionsForUserModal() {
    try {
        // Reuse common classes endpoint
        const response = await fetch(`${API_URL}/common/classes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const select = document.querySelector('select[name="kelas"]');
            if (select) {
                select.innerHTML = '<option value="">Pilih Kelas...</option>' +
                    data.data.map(c => `<option value="${c}">${c}</option>`).join('');
            }
        }
    } catch (e) {
        console.error('Load class options error:', e);
    }
}

async function handleCreateUser(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (result.success) {
            showAlert('✅ User berhasil dibuat', 'success');
            closeCreateUserModal();
            loadUsers();
        } else {
            showAlert(result.message || 'Gagal membuat user', 'error');
        }
    } catch (err) {
        console.error('Create user error:', err);
        showAlert('Terjadi kesalahan sistem', 'error');
    }
}

async function deleteUser(id) {
    if (!confirm('Yakin ingin menghapus user ini?')) return;

    try {
        const response = await fetch(`${API_URL}/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            showAlert('✅ User berhasil dihapus', 'success');
            loadUsers();
        } else {
            showAlert(result.message || 'Gagal menghapus user', 'error');
        }
    } catch (err) {
        console.error('Delete user error:', err);
        showAlert('Terjadi kesalahan sistem', 'error');
    }
}

// ==================== USER MANAGEMENT (SUPERADMIN) ====================

// Show/Hide Kelas Field based on Role
function toggleKelasField(role) {
    const field = document.getElementById('kelasField');
    const select = document.querySelector('select[name="kelas"]');
    if (role === 'student' && field && select) {
        field.style.display = 'block';
        select.required = true;
    } else if (field && select) {
        field.style.display = 'none';
        select.required = false;
        select.value = '';
    }
}

// Load Users List
async function loadUsers() {
    // Only for superadmin
    if (userData.role !== 'superadmin') return;

    // Show nav button
    const navBtn = document.getElementById('nav-users');
    if (navBtn) navBtn.style.display = 'inline-block';

    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            tbody.innerHTML = result.data.map(user => `
                <tr>
                    <td>${user.nisn}</td>
                    <td>${user.nama}</td>
                    <td><span class="badge ${getRoleBadgeClass(user.role)}">${user.role}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})" ${user.role === 'superadmin' ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">${result.message}</td></tr>`;
        }
    } catch (e) {
        console.error('Load users error:', e);
    }
}

function getRoleBadgeClass(role) {
    switch (role) {
        case 'superadmin': return 'badge-warning'; // Goldish
        case 'admin': return 'badge-primary';
        case 'teacher': return 'badge-info';
        case 'student': return 'badge-secondary';
        default: return 'badge-secondary';
    }
}

// Create User Modal
function showCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    if (modal) {
        modal.style.display = 'block';
        toggleKelasField('student'); // Default
        loadKelasOptionsForUserModal();
    }
}

function closeCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    if (modal) modal.style.display = 'none';
    document.getElementById('createUserForm').reset();
}

async function loadKelasOptionsForUserModal() {
    try {
        // Reuse common classes endpoint
        const response = await fetch(`${API_URL}/common/classes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const select = document.querySelector('select[name="kelas"]');
            if (select) {
                select.innerHTML = '<option value="">Pilih Kelas...</option>' +
                    data.data.map(c => `<option value="${c}">${c}</option>`).join('');
            }
        }
    } catch (e) {
        console.error('Load class options error:', e);
    }
}

async function handleCreateUser(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (result.success) {
            showAlert('✅ User berhasil dibuat', 'success');
            closeCreateUserModal();
            loadUsers();
        } else {
            showAlert(result.message || 'Gagal membuat user', 'error');
        }
    } catch (err) {
        console.error('Create user error:', err);
        showAlert('Terjadi kesalahan sistem', 'error');
    }
}

async function deleteUser(id) {
    if (!confirm('Yakin ingin menghapus user ini?')) return;

    try {
        const response = await fetch(`${API_URL}/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            showAlert('✅ User berhasil dihapus', 'success');
            loadUsers();
        } else {
            showAlert(result.message || 'Gagal menghapus user', 'error');
        }
    } catch (err) {
        console.error('Delete user error:', err);
        showAlert('Terjadi kesalahan sistem', 'error');
    }
}