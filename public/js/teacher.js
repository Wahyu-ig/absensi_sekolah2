const API_URL = window.location.origin + '/api';

// Check auth
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');
if (!token || !user || user.role !== 'teacher') {
    window.location.replace('/');
}

// Initialize Socket.io
const socket = io();
socket.on('connect', () => {
    console.log('Teacher connected to real-time server');
    socket.emit('join-admin');
});

socket.on('new-attendance', (data) => {
    showToast(`🔔 ${data.nama} baru saja ${data.status.toLowerCase()}`, 'success');
    if (document.getElementById('historySection').style.display !== 'none') {
        loadHistory();
    }
    if (document.getElementById('izinSection').style.display !== 'none') {
        loadSiswaIzin();
    }
});

// Set user name
document.getElementById('userName').textContent = user.nama;

// Set user initial
const initial = user.nama ? user.nama.charAt(0).toUpperCase() : 'G';
document.getElementById('userInitial').textContent = initial;

// Setup headers
const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
};

let currentQRCode = '';
let dashboardSessions = [];
let attendanceChart = null;
let subjectChart = null;
let autoRefreshInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadOptions();
    updateClock();
    setInterval(updateClock, 1000);
    refreshDashboard();

    // Set today's date as default
    document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];

    // Start auto-refresh every 30 seconds
    startAutoRefresh();

    // Load dark mode preference
    loadDarkMode();
});

// Dark mode logic removed as CSS is dark-themed by default

// Clock
function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('id-ID');
    document.getElementById('currentDate').textContent = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Auto Refresh
function startAutoRefresh() {
    autoRefreshInterval = setInterval(() => {
        const dashboard = document.getElementById('dashboardSection');
        if (dashboard && dashboard.style.display !== 'none') {
            loadStats();
            loadActiveSessions();
        }
    }, 30000); // 30 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
}

// Refresh Dashboard
async function refreshDashboard() {
    showLoading('activeSessionsList');
    showLoading('allSessionsList');

    await Promise.all([
        loadStats(),
        loadActiveSessions(),
        loadSessions()
    ]);

    hideLoading('activeSessionsList');
    hideLoading('allSessionsList');

    showToast('Dashboard diperbarui!', 'success');
}

// Load Stats
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/teacher/sessions`, { headers });
        const data = await response.json();

        if (data.success) {
            const today = new Date().toISOString().split('T')[0];
            const todaySessions = data.data.filter(s => s.tanggal && s.tanggal.includes(today));
            const activeSessions = data.data.filter(s => s.aktif);

            document.getElementById('statsTodaySessions').textContent = todaySessions.length;
            document.getElementById('statsActiveSessions').textContent = activeSessions.length;
            document.getElementById('statsTotalSessions').textContent = data.data.length;

            // Store for filtering
            dashboardSessions = data.data;

            // Count attendance for today
            let todayAttendance = 0;
            todaySessions.forEach(s => {
                if (s.attendance_count) todayAttendance += parseInt(s.attendance_count);
            });
            document.getElementById('statsTodayAttendance').textContent = todayAttendance;

            // Update charts
            updateCharts(data.data);
        }
    } catch (e) {
        console.error('Failed to load stats:', e);
        showToast('Gagal memuat statistik', 'error');
    }
}

// Update Charts
function updateCharts(sessions) {
    // Attendance Chart - Last 7 days
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const now = new Date();
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        last7Days.push(d.toISOString().split('T')[0]);
    }

    const filteredSessions = sessions.filter(s => {
        const selectedSubject = document.getElementById('chartSubjectFilter').value;
        if (!selectedSubject) return true;
        return s.mapel_id.toString() === selectedSubject;
    });

    const attendanceByDay = last7Days.map(date => {
        const daySessions = filteredSessions.filter(s => s.tanggal && s.tanggal.includes(date));
        let count = 0;
        daySessions.forEach(s => {
            if (s.attendance_count) count += parseInt(s.attendance_count);
        });
        return count;
    });

    const attendanceLabels = last7Days.map(date => {
        const d = new Date(date);
        return days[d.getDay()];
    });

    const attendanceCtx = document.getElementById('attendanceChart').getContext('2d');
    if (attendanceChart) attendanceChart.destroy();
    attendanceChart = new Chart(attendanceCtx, {
        type: 'line',
        data: {
            labels: attendanceLabels,
            datasets: [{
                label: 'Siswa Hadir',
                data: attendanceByDay,
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderColor: '#3498db',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#3498db',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // Subject Chart - Distribution
    const subjectMap = {};
    sessions.forEach(s => {
        if (subjectMap[s.mapel_nama]) {
            subjectMap[s.mapel_nama]++;
        } else {
            subjectMap[s.mapel_nama] = 1;
        }
    });

    const subjectData = {
        labels: Object.keys(subjectMap),
        datasets: [{
            data: Object.values(subjectMap),
            backgroundColor: [
                '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e74c3c', '#1abc9c', '#34495e',
                '#e67e22', '#16a085', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50', '#f39c12'
            ],
            borderWidth: 0
        }]
    };

    const subjectCtx = document.getElementById('subjectChart').getContext('2d');
    if (subjectChart) subjectChart.destroy();
    subjectChart = new Chart(subjectCtx, {
        type: 'doughnut',
        data: subjectData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#888', padding: 20 } }
            }
        }
    });
}

async function updateChartsWithFilter() {
    updateCharts(dashboardSessions);
}

// Load Active Sessions
async function loadActiveSessions() {
    const container = document.getElementById('activeSessionsList');
    showLoading('activeSessionsList');

    try {
        const response = await fetch(`${API_URL}/teacher/sessions`, { headers });
        const data = await response.json();

        if (!data.success) {
            container.innerHTML = '<p style="color:#888;text-align:center;">Gagal memuat sesi</p>';
            return;
        }

        const activeSessions = data.data.filter(s => s.aktif);

        if (activeSessions.length === 0) {
            container.innerHTML = '<p style="color:#888;text-align:center;">Tidak ada sesi aktif saat ini</p>';
            return;
        }

        container.innerHTML = activeSessions.map(s => `
            <div class="session-card">
                <div class="session-header">
                    <div>
                        <h4 style="margin:0;color:#27ae60;">${s.mapel_nama}</h4>
                        <span style="color:#666;">Kelas ${s.kelas}</span>
                    </div>
                    <span class="badge badge-active">● AKTIF</span>
                </div>
                <p style="margin:10px 0;">
                    <i class="fas fa-clock"></i> ${formatTime(s.jam_mulai)} - ${formatTime(s.jam_selesai)}
                    <span style="color:#888;margin-left:10px;">(${formatTimeRemaining(s.jam_selesai)})</span>
                </p>
                <div class="live-attendance">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span><i class="fas fa-users"></i> Siswa Hadir</span>
                        <span style="font-size:1.5em;color:#27ae60;">${s.attendance_count || 0}</span>
                    </div>
                </div>
                <div class="btn-group">
                    <button onclick="showQR(${s.id})" style="background:#3498db;color:white;">
                        <i class="fas fa-qrcode"></i> Lihat QR
                    </button>
                    <button onclick="toggleSession(${s.id}, ${s.aktif})" style="background:#e74c3c;color:white;">
                        <i class="fas fa-stop"></i> Nonaktifkan
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load active sessions:', e);
        container.innerHTML = '<p style="color:#e74c3c;text-align:center;">Error memuat sesi</p>';
        showToast('Gagal memuat sesi aktif', 'error');
    } finally {
        hideLoading('activeSessionsList');
    }
}

// Navigation
function showPage(pageId) {
    // Hide all sections
    document.querySelectorAll('.page-section').forEach(el => {
        el.style.display = 'none';
    });

    // Show target section
    const targetSection = document.getElementById(pageId + 'Section');
    if (targetSection) targetSection.style.display = 'block';

    // Update navigation buttons
    ['dashboard', 'sessions', 'history', 'izin'].forEach(name => {
        const btn = document.getElementById(`nav-${name}`);
        if (btn) {
            btn.classList.remove('active-tab');
            btn.style.borderBottom = 'none';
        }
    });

    const activeBtn = document.getElementById(`nav-${pageId}`);
    if (activeBtn) {
        activeBtn.classList.add('active-tab');
        activeBtn.style.borderBottom = '2px solid var(--primary)';
    }

    // Load data for the page
    if (pageId === 'dashboard') {
        refreshDashboard();
    } else if (pageId === 'sessions') {
        loadSessions();
    } else if (pageId === 'history') {
        loadHistory();
    } else if (pageId === 'izin') {
        loadSiswaIzin();
    }
}

// ==================== LOAD SISWA IZIN ====================
async function loadSiswaIzin() {
    const tbody = document.getElementById('siswaIzinTable');
    if (!tbody) return;

    showLoading('siswaIzinTable');

    try {
        // Teacher sees izin for ALL classes or we could filter by their classes.
        // For now, let's use the Admin's izin endpoint if available or create a shared one.
        // Since teachers have broad visibility, we'll use /api/admin/izin but maybe Teacher should have its own.
        // Actually, adminController.getIzinRequests is already there. 
        // Let's assume teachers can access it or we should move it to common.

        const res = await fetch(`${API_URL}/admin/izin`, { headers });
        const data = await res.json();

        if (data.success && data.data) {
            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Tidak ada siswa izin hari ini</td></tr>';
                return;
            }

            tbody.innerHTML = data.data.map(item => `
                <tr>
                    <td><strong>${item.nama}</strong><br><small>${item.nisn}</small></td>
                    <td>${item.kelas}</td>
                    <td><span class="badge ${item.status === 'Sakit' ? 'badge-danger' : 'badge-warning'}">${item.status}</span></td>
                    <td>
                        <div id="approval-${item.id}">
                            ${item.is_approved === 1 ? '<span class="badge badge-active">Disetujui</span>' :
                    item.is_approved === -1 ? '<span class="badge badge-inactive">Ditolak</span>' :
                        `<button onclick="setIzinStatus(${item.id}, 1)" class="btn btn-secondary" style="padding: 2px 6px; color: var(--success); border-color: var(--success); margin-right: 5px;" title="Setujui"><i class="fas fa-check"></i></button>
                               <button onclick="setIzinStatus(${item.id}, -1)" class="btn btn-secondary" style="padding: 2px 6px; color: var(--danger); border-color: var(--danger);" title="Tolak"><i class="fas fa-times"></i></button>`
                }
                        </div>
                    </td>
                    <td>${item.keterangan || '-'}</td>
                    <td>
                        ${item.lampiran ? `
                            <a href="${item.lampiran}" target="_blank" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;">
                                <i class="fas fa-image"></i> Lihat Bukti
                            </a>
                        ` : '<span style="color:#666; font-size:0.8rem;">Tidak ada</span>'}
                    </td>
                    <td>
                        <button onclick="deleteIzin(${item.id})" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: var(--danger); border-color: var(--danger);">
                            <i class="fas fa-trash"></i> Hapus
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#e74c3c;">${data.message || 'Gagal memuat'}</td></tr>`;
        }
    } catch (err) {
        console.error('Error load izin:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#e74c3c;">Terjadi kesalahan sistem</td></tr>';
    }
}

async function setIzinStatus(id, status) {
    try {
        const res = await fetch(`${API_URL}/admin/izin/${id}/status`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ status })
        });
        const data = await res.json();

        if (data.success) {
            showToast(`✅ ${data.message}`, 'success');
            loadSiswaIzin();
        } else {
            showToast(data.message || 'Gagal update status', 'error');
        }
    } catch (err) {
        console.error('Update status error:', err);
        showToast('Terjadi kesalahan sistem', 'error');
    }
}

async function deleteIzin(id) {
    if (!confirm('Hapus data izin ini? File lampiran juga akan dihapus permanen dari server.')) return;

    try {
        const res = await fetch(`${API_URL}/admin/izin/${id}`, {
            method: 'DELETE',
            headers
        });
        const data = await res.json();

        if (data.success) {
            showToast('✅ Data izin dan file berhasil dihapus!', 'success');
            loadSiswaIzin();
        } else {
            showToast(data.message || 'Gagal menghapus data', 'error');
        }
    } catch (err) {
        console.error('Delete izin error:', err);
        showToast('Terjadi kesalahan sistem', 'error');
    }
}

// Load All Sessions
async function loadSessions() {
    const container = document.getElementById('allSessionsList');
    showLoading('allSessionsList');

    try {
        const response = await fetch(`${API_URL}/teacher/sessions`, { headers });
        const data = await response.json();

        if (!data.success || data.data.length === 0) {
            container.innerHTML = '<p style="color:#888;text-align:center;">Belum ada sesi</p>';
            return;
        }

        container.innerHTML = data.data.map(s => `
            <div class="session-card ${!s.aktif ? 'inactive' : ''}">
                <div class="session-header">
                    <div>
                        <h4 style="margin:0;color:${s.aktif ? '#27ae60' : '#7f8c8d'};">${s.mapel_nama}</h4>
                        <span style="color:#666;">Kelas ${s.kelas} • ${formatDate(s.tanggal)}</span>
                    </div>
                    <span class="badge ${s.aktif ? 'badge-active' : 'badge-inactive'}">
                        ${s.aktif ? '● AKTIF' : '○ Nonaktif'}
                    </span>
                </div>
                <p style="margin:10px 0;">
                    <i class="fas fa-clock"></i> ${formatTime(s.jam_mulai)} - ${formatTime(s.jam_selesai)}
                </p>
                <p style="margin:5px 0;color:#666;">
                    <i class="fas fa-users"></i> ${s.attendance_count || 0} siswa hadir
                </p>
                <div class="btn-group">
                    <button onclick="showQR(${s.id})" style="background:#3498db;color:white;">
                        <i class="fas fa-qrcode"></i> QR
                    </button>
                    <button onclick="viewSessionDetail(${s.id})" style="background:#9b59b6;color:white;">
                        <i class="fas fa-eye"></i> Detail
                    </button>
                    <button onclick="editSession(${s.id})" style="background:#f39c12;color:white;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="toggleSession(${s.id}, ${s.aktif})" style="background:${s.aktif ? '#e74c3c' : '#27ae60'};color:white;">
                        <i class="fas fa-power-off"></i> ${s.aktif ? 'Off' : 'On'}
                    </button>
                    <button onclick="deleteSession(${s.id})" style="background:#7f8c8d;color:white;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading sessions:', error);
        container.innerHTML = '<p style="color:#e74c3c;text-align:center;">Error memuat sesi</p>';
        showToast('Gagal memuat sesi', 'error');
    } finally {
        hideLoading('allSessionsList');
    }
}

// View Session Detail
async function viewSessionDetail(id) {
    try {
        const response = await fetch(`${API_URL}/teacher/sessions/${id}`, { headers });
        const data = await response.json();

        if (data.success) {
            const s = data.data;
            let msg = `
📚 ${s.mapel_nama} - Kelas ${s.kelas}
📅 ${formatDate(s.tanggal)}
⏰ ${formatTime(s.jam_mulai)} - ${formatTime(s.jam_selesai)}
📊 Status: ${s.aktif ? 'Aktif' : 'Nonaktif'}
👥 Kehadiran: ${s.attendance_list?.length || 0} siswa

Daftar Hadir:
${(s.attendance_list || []).map((a, i) => `${i + 1}. ${a.nama} (${a.jam_absen})`).join('\n') || '- Belum ada'}
`;
            alert(msg.trim());
        }
    } catch (e) {
        console.error('Error:', e);
        showToast('Gagal memuat detail sesi', 'error');
    }
}

// Edit Session
async function editSession(id) {
    try {
        const response = await fetch(`${API_URL}/teacher/sessions/${id}`, { headers });
        const data = await response.json();

        if (data.success) {
            const session = data.data;
            document.getElementById('editSessionId').value = session.id;
            document.getElementById('editSessionMapel').value = session.mapel_id;
            document.getElementById('editSessionKelas').value = session.kelas;
            document.getElementById('editSessionStart').value = session.jam_mulai;
            document.getElementById('editSessionEnd').value = session.jam_selesai;

            // Copy options from create form
            const mapelSelect = document.getElementById('sessionMapel');
            const editMapelSelect = document.getElementById('editSessionMapel');
            editMapelSelect.innerHTML = mapelSelect.innerHTML;

            const kelasSelect = document.getElementById('sessionKelas');
            const editKelasSelect = document.getElementById('editSessionKelas');
            editKelasSelect.innerHTML = kelasSelect.innerHTML;

            document.getElementById('editSessionModal').style.display = 'block';
        }
    } catch (e) {
        console.error('Error:', e);
        showToast('Gagal memuat data sesi', 'error');
    }
}

// Update Session
async function updateSession(e) {
    e.preventDefault();

    const id = document.getElementById('editSessionId').value;
    const mapel_id = document.getElementById('editSessionMapel').value;
    const kelas = document.getElementById('editSessionKelas').value;
    const jam_mulai = document.getElementById('editSessionStart').value;
    const jam_selesai = document.getElementById('editSessionEnd').value;

    if (!mapel_id || !kelas || !jam_mulai || !jam_selesai) {
        showToast('Semua field harus diisi!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/teacher/sessions/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                mapel_id,
                kelas,
                jam_mulai,
                jam_selesai
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Sesi berhasil diperbarui!', 'success');
            closeModal('editSessionModal');
            loadSessions();
            refreshDashboard();
        } else {
            showToast(data.message || 'Gagal memperbarui sesi', 'error');
        }
    } catch (error) {
        console.error('Error updating session:', error);
        showToast('Gagal memperbarui sesi', 'error');
    }
}

// Create Session
async function createSession(e) {
    e.preventDefault();
    const mapel_id = document.getElementById('sessionMapel').value;
    const kelas = document.getElementById('sessionKelas').value;
    const jam_mulai = document.getElementById('sessionStart').value;
    const jam_selesai = document.getElementById('sessionEnd').value;

    if (!mapel_id || !kelas || !jam_mulai || !jam_selesai) {
        showToast('Semua field harus diisi!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/teacher/sessions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                mapel_id,
                kelas,
                jam_mulai,
                jam_selesai,
                tanggal: new Date().toISOString().split('T')[0]
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Sesi berhasil dibuat!', 'success');
            e.target.reset();
            if (data.data && data.data.session_id) {
                showQR(data.data.session_id);
            }
            refreshDashboard();
        } else {
            showToast(data.message || 'Gagal membuat sesi', 'error');
        }
    } catch (error) {
        console.error('Error creating session:', error);
        showToast('Gagal membuat sesi', 'error');
    }
}

// Toggle Session
async function toggleSession(id, currentStatus) {
    try {
        const response = await fetch(`${API_URL}/teacher/sessions/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ aktif: currentStatus ? 0 : 1 })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Sesi ${currentStatus ? 'dinonaktifkan' : 'diaktifkan'}!`, 'success');
            refreshDashboard();
            loadSessions();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error toggling session:', error);
        showToast('Gagal update sesi', 'error');
    }
}

// Delete Session
async function deleteSession(id) {
    if (!confirm('Yakin ingin menghapus sesi ini? Tindakan ini tidak dapat dibatalkan.')) return;

    try {
        const response = await fetch(`${API_URL}/teacher/sessions/${id}`, {
            method: 'DELETE',
            headers
        });

        const data = await response.json();

        if (data.success) {
            showToast('Sesi berhasil dihapus!', 'success');
            loadSessions();
            refreshDashboard();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        showToast('Gagal menghapus sesi', 'error');
    }
}

// Show QR
async function showQR(id) {
    try {
        const response = await fetch(`${API_URL}/teacher/sessions/${id}`, { headers });
        const data = await response.json();

        if (data.success) {
            const session = data.data;
            currentQRCode = session.kode_qr;

            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(session.kode_qr)}`;

            document.getElementById('qrImage').src = qrCodeUrl;
            document.getElementById('qrMapel').textContent = session.mapel_nama || 'Mata Pelajaran';
            document.getElementById('qrKelas').textContent = `Kelas: ${session.kelas}`;
            document.getElementById('qrTime').textContent = `Waktu: ${formatTime(session.jam_mulai)} - ${formatTime(session.jam_selesai)}`;
            document.getElementById('qrCode').textContent = `Kode: ${session.kode_qr}`;

            document.getElementById('qrModal').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading QR:', error);
        showToast('Gagal memuat QR Code', 'error');
    }
}

// Copy QR Code
function copyQRCode() {
    navigator.clipboard.writeText(currentQRCode).then(() => {
        showToast('Kode QR disalin!', 'success');
    }).catch(() => {
        showToast('Gagal menyalin', 'error');
    });
}

// Load History
async function loadHistory() {
    const date = document.getElementById('filterDate').value || new Date().toISOString().split('T')[0];
    const kelas = document.getElementById('filterKelas')?.value || '';
    const container = document.getElementById('historyList');

    showLoading('historyList');

    try {
        let url = `${API_URL}/common/admin/report?tanggal=${date}`;
        if (kelas) url += `&kelas=${encodeURIComponent(kelas)}`;

        const response = await fetch(url, { headers });
        const data = await response.json();

        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = '<p style="color:#888;text-align:center;padding:40px;">Tidak ada data absensi</p>';
            return;
        }

        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Waktu</th>
                        <th>Siswa</th>
                        <th>Kelas</th>
                        <th>Mapel</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data.map(row => `
                        <tr>
                            <td>${row.jam_absen || '-'}</td>
                            <td>${row.nama}</td>
                            <td>${row.kelas}</td>
                            <td>${row.mapel || '-'}</td>
                            <td>
                                <span class="badge badge-hadir">Hadir</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        console.error('Failed to load history:', e);
        container.innerHTML = '<p style="color:#e74c3c;text-align:center;padding:40px;">Error memuat data</p>';
        showToast('Gagal memuat laporan', 'error');
    } finally {
        hideLoading('historyList');
    }
}

// Export Data
function exportData(format) {
    const tanggal = document.getElementById('filterDate')?.value || '';
    const kelas = document.getElementById('filterKelas')?.value || '';

    let url = `${API_URL}/admin/report/export?format=${format}&`;
    if (kelas) url += `kelas=${encodeURIComponent(kelas)}&`;
    if (tanggal) url += `tanggal=${tanggal}&`;

    window.open(url, '_blank');
}

function exportToExcel() { exportData('excel'); }
function exportToPDF() { exportData('pdf'); }

// Load Options (Mapel & Kelas)
async function loadOptions() {
    try {
        const response = await fetch(`${API_URL}/common/mapel`, { headers });
        const mapelData = await response.json();

        if (mapelData.success) {
            const select = document.getElementById('sessionMapel');
            const editSelect = document.getElementById('editSessionMapel');
            const chartFilter = document.getElementById('chartSubjectFilter');

            const options = '<option value="">Pilih Mapel...</option>';
            const filterOptions = '<option value="">Semua Mata Pelajaran</option>';

            const mapelOptions = mapelData.data.map(m => `<option value="${m.id}">${m.nama} (${m.kode})</option>`).join('');

            select.innerHTML = options + mapelOptions;
            if (editSelect) editSelect.innerHTML = options + mapelOptions;
            if (chartFilter) chartFilter.innerHTML = filterOptions + mapelOptions;
        }
    } catch (e) {
        console.error('Failed to load mapel:', e);
    }

    try {
        const kelasResponse = await fetch(`${API_URL}/common/classes`, { headers });
        const kelasData = await kelasResponse.json();

        const classSelect = document.getElementById('sessionKelas');
        const filterKelas = document.getElementById('filterKelas');

        classSelect.innerHTML = '<option value="">Pilih Kelas...</option>';

        if (kelasData.success && kelasData.data) {
            kelasData.data.forEach(c => {
                classSelect.innerHTML += `<option value="${c}">${c}</option>`;
                if (filterKelas) filterKelas.innerHTML += `<option value="${c}">${c}</option>`;
            });
        } else {
            // Fallback if API fails - complete class list
            const classes = [];
            for (let i = 1; i <= 10; i++) classes.push(`10.${i}`);
            for (let i = 1; i <= 10; i++) classes.push(`11.${i}`);
            for (let i = 1; i <= 10; i++) classes.push(`12.${i}`);

            classes.forEach(c => {
                classSelect.innerHTML += `<option value="${c}">${c}</option>`;
                if (filterKelas) filterKelas.innerHTML += `<option value="${c}">${c}</option>`;
            });
        }
    } catch (e) {
        console.error('Failed to load classes:', e);
    }
}

// Utilities
function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(time) {
    if (!time) return '-';
    return time.substring(0, 5);
}

function formatTimeRemaining(endTime) {
    if (!endTime) return '';
    const now = new Date();
    const [hours, minutes] = endTime.split(':');
    const end = new Date();
    end.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    const diff = end - now;
    if (diff <= 0) return 'Selesai';

    const minutesRemaining = Math.floor(diff / 60000);
    if (minutesRemaining < 60) return `${minutesRemaining}m lagi`;

    const hoursRemaining = Math.floor(minutesRemaining / 60);
    const mins = minutesRemaining % 60;
    return `${hoursRemaining}j ${mins}m lagi`;
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.log(`[Toast ${type}]: ${message}`);
        return;
    }
    toast.textContent = message;
    toast.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
    toast.style.display = 'block';
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.maxWidth = '300px';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';
    }
}

function hideLoading(elementId) {
    // This is handled by the actual content loading
}

function logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
        localStorage.clear();
        window.location.replace('/');
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function printQR() {
    const qrImage = document.getElementById('qrImage').src;
    const mapel = document.getElementById('qrMapel').textContent;
    const kelas = document.getElementById('qrKelas').textContent;
    const waktu = document.getElementById('qrTime').textContent;
    const code = currentQRCode;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR Code - ${mapel}</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 40px; 
                }
                img { 
                    max-width: 300px; 
                    margin: 20px auto; 
                    border: 3px solid #3498db;
                    padding: 10px;
                    background: white;
                }
                h1 { 
                    color: #3498db; 
                    margin-bottom: 10px;
                }
                p { 
                    color: #666; 
                    font-size: 18px; 
                    margin: 10px 0;
                }
                .code { 
                    font-family: monospace; 
                    font-size: 24px; 
                    background: #f0f0f0; 
                    padding: 15px 20px; 
                    border-radius: 5px; 
                    margin-top: 20px;
                    letter-spacing: 2px;
                }
            </style>
        </head>
        <body>
            <h1>${mapel}</h1>
            <p>${kelas}</p>
            <img src="${qrImage}" alt="QR Code">
            <p>${waktu}</p>
            <p class="code">${code}</p>
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 100); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Close modal on outside click
window.onclick = function (event) {
    const qrModal = document.getElementById('qrModal');
    const editModal = document.getElementById('editSessionModal');

    if (event.target == qrModal) {
        qrModal.style.display = 'none';
    }
    if (event.target == editModal) {
        editModal.style.display = 'none';
    }
}

// Handle browser back/forward
window.addEventListener('popstate', function (event) {
    stopAutoRefresh();
});