const API_URL = window.location.origin + '/api';
const user = JSON.parse(localStorage.getItem('user') || '{}');
const token = localStorage.getItem('token');

if (!user || !token || user.role !== 'student') {
    window.location.replace('/');
}

// Initialize Socket.io
const socket = io();
socket.on('connect', () => {
    console.log('Student connected to real-time server');
    socket.emit('join-user', user.id);
});

socket.on('izin-status-updated', (data) => {
    if (window.Swal) {
        Swal.fire({
            icon: data.status === 1 ? 'success' : 'error',
            title: 'Update Izin',
            text: `Permohonan izin Anda telah ${data.status === 1 ? 'disetujui' : 'ditolak'}.`,
            confirmButtonColor: '#3498db'
        });
    } else {
        alert(`Update Izin: Permohonan izin Anda telah ${data.status === 1 ? 'disetujui' : 'ditolak'}.`);
    }
    if (typeof loadHistory === 'function') loadHistory();
});

let html5QrCode = null;
let scannerActive = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('userName').textContent = user.nama;
    document.getElementById('userKelas').textContent = `Kelas ${user.kelas}`;

    // Set user initial
    const initial = user.nama ? user.nama.charAt(0).toUpperCase() : 'S';
    document.getElementById('userInitial').textContent = initial;

    updateClock();
    setInterval(updateClock, 1000);

    refreshAll();
});

// Clock
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('currentTime').textContent = timeStr;

    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = now.toLocaleDateString('id-ID', dateOptions);
}

// Tab Switching
function switchTab(tabName) {
    // Stop scanner if active
    if (scannerActive) {
        stopScan();
    }

    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });

    // Remove active class from all buttons
    ['camera', 'upload', 'manual', 'izin'].forEach(name => {
        const btn = document.getElementById(`tab-${name}-btn`);
        if (btn) {
            btn.classList.remove('active-tab');
            btn.style.borderBottom = 'none';
        }
    });

    // Show selected tab
    document.getElementById(`${tabName}Tab`).style.display = 'block';
    const activeBtn = document.getElementById(`tab-${tabName}-btn`);
    activeBtn.classList.add('active-tab');
    activeBtn.style.borderBottom = '2px solid var(--primary)';
}

// Refresh All
function refreshAll() {
    loadStats();
    loadHistory();
    loadActiveSessions();
    loadTodaySchedule();
    showAlert('Data diperbarui!', 'success');
}

// Load Stats
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/student/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('totalAbsen').textContent = data.data?.total || 0;
            document.getElementById('monthAbsen').textContent = data.data?.thisMonth || 0;

            if (data.data?.perMapel && data.data.perMapel.length > 0) {
                const perMapelDiv = document.getElementById('perMapelStats');
                perMapelDiv.innerHTML = `
                    <h3 style="margin:15px 0 10px 0;font-size:1.1em;">Per Mata Pelajaran</h3>
                    <div class="mapel-stats-grid">
                        ${data.data.perMapel.map(m => `
                            <div class="mapel-stat-item">
                                <div class="mapel-stat-number">${m.total}</div>
                                <div class="mapel-stat-label">${m.nama}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            if (data.data?.lastAttendance) {
                const lastDiv = document.getElementById('lastAttendance');
                lastDiv.innerHTML = `
                    <div class="last-attendance">
                        <p><strong>🕒 Terakhir absen:</strong> ${data.data.lastAttendance.mapel}</p>
                        <p class="last-attendance-date">${formatDate(data.data.lastAttendance.tanggal)} • ${data.data.lastAttendance.jam_absen}</p>
                    </div>
                `;
            }
        }
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

// Load Today's Schedule
async function loadTodaySchedule() {
    const container = document.getElementById('todaySchedule');

    try {
        const response = await fetch(`${API_URL}/common/sessions?kelas=${encodeURIComponent(user.kelas)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('Today Schedule Response:', data); // Debug log

        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = '<p class="empty-text">Tidak ada jadwal hari ini</p>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const todaySessions = data.data.filter(s => s.tanggal && s.tanggal.includes(today));

        if (todaySessions.length === 0) {
            container.innerHTML = '<p class="empty-text">Tidak ada jadwal hari ini</p>';
            return;
        }

        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5);

        container.innerHTML = todaySessions.map(s => {
            let status = 'upcoming';
            let statusText = 'Akan datang';
            let statusClass = 'badge-upcoming';

            if (s.aktif && currentTime >= s.jam_mulai && currentTime <= s.jam_selesai) {
                status = 'active';
                statusText = '● AKTIF';
                statusClass = 'badge-active';
            } else if (currentTime > s.jam_selesai) {
                status = 'done';
                statusText = 'Selesai';
                statusClass = 'badge-done';
            }

            return `
                <div class="schedule-item ${status}">
                    <div class="schedule-time">
                        ⏰ ${s.jam_mulai.substring(0, 5)} - ${s.jam_selesai.substring(0, 5)}
                        <span class="badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="schedule-subject">${s.mapel_nama}</div>
                    <div class="schedule-teacher">Guru: ${s.teacher_name || '-'}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load schedule:', e);
        container.innerHTML = '<p class="error-text">Gagal memuat jadwal</p>';
    }
}

// Load History
async function loadHistory() {
    try {
        const response = await fetch(`${API_URL}/student/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';

        if (!data.success || !data.data || data.data.length === 0) {
            historyList.innerHTML = '<p class="empty-text">Belum ada riwayat absensi</p>';
            return;
        }

        data.data.slice(0, 10).forEach(row => {
            const div = document.createElement('div');
            div.className = 'history-item';

            let statusLabel = '✓ Hadir';
            let statusColor = 'var(--success)';

            if (row.status === 'Izin' || row.status === 'Sakit') {
                const approvalText = row.is_approved === 1 ? ' (Disetujui)' :
                    row.is_approved === -1 ? ' (Ditolak)' : ' (Pending)';
                statusLabel = `✍️ ${row.status}${approvalText}`;
                statusColor = row.is_approved === 1 ? 'var(--success)' :
                    row.is_approved === -1 ? 'var(--danger)' : 'var(--warning)';
            } else if (row.status === 'Terlambat') {
                statusLabel = '⏰ Terlambat';
                statusColor = 'var(--warning)';
            } else if (row.status === 'Alfa') {
                statusLabel = '❌ Alfa';
                statusColor = 'var(--danger)';
            }

            div.innerHTML = `
                <div>
                    <strong class="history-subject">${row.mapel || 'Izin/Sakit'}</strong><br>
                    <small class="history-date">${formatDate(row.tanggal)}</small>
                </div>
                <div class="history-time-info">
                    <div class="history-time">${row.jam_absen}</div>
                    <small class="history-status" style="color: ${statusColor}">${statusLabel}</small>
                </div>
            `;
            historyList.appendChild(div);
        });
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

// Load Active Sessions
async function loadActiveSessions() {
    try {
        const response = await fetch(`${API_URL}/common/qr/active?kelas=${encodeURIComponent(user.kelas)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('Active Sessions Response:', data); // Debug log

        const container = document.getElementById('activeSessions');

        if (!data.success || !data.data || data.data.length === 0) {
            console.log('No active sessions found for class:', user.kelas); // Debug log
            container.innerHTML = '<p class="empty-text">Tidak ada sesi absensi aktif saat ini</p>';
            return;
        }

        container.innerHTML = data.data.map(s => `
            <div class="session-card active">
                <div class="session-header">
                    <h3>${s.mapel_nama}</h3>
                    <span class="badge badge-active">● AKTIF</span>
                </div>
                <p class="session-time"><strong>Jam:</strong> ${s.jam_mulai} - ${s.jam_selesai}</p>
                <p class="session-remaining"><strong>Sisa waktu:</strong> ${formatTimeRemaining(s.jam_selesai)}</p>
                <div class="qr-code-display">
                    <small>Kode QR:</small><br>
                    <code>${s.kode_qr}</code>
                </div>
                <button class="btn-attend" onclick="submitQRCode('${s.kode_qr}')">
                    ✅ Absen Sekarang
                </button>
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load active sessions:', e);
    }
}

// Handle Izin Submit
async function handleIzinSubmit(event) {
    event.preventDefault();

    const type = document.getElementById('izinType').value;
    const keterangan = document.getElementById('izinKeterangan').value.trim();
    const fileInput = document.getElementById('izinFile');

    if (!keterangan) {
        showAlert('Keterangan wajib diisi', 'error');
        return;
    }

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

    try {
        const formData = new FormData();
        formData.append('type', type);
        formData.append('keterangan', keterangan);
        if (fileInput.files[0]) {
            formData.append('lampiran', fileInput.files[0]);
        }

        const deviceId = localStorage.getItem('device_id');
        if (deviceId) {
            formData.append('device_id', deviceId);
        }

        const response = await fetch(`${API_URL}/student/izin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showAlert('✅ Permohonan izin berhasil dikirim', 'success');
            event.target.reset();
            refreshAll();
            switchTab('camera'); // Go back to camera
        } else {
            showAlert(data.message || 'Gagal mengirim izin', 'error');
        }
    } catch (e) {
        console.error('Izin error:', e);
        showAlert('Terjadi kesalahan sistem', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Utility to format time remaining
function formatTimeRemaining(endTime) {
    const now = new Date();
    const [hours, minutes] = endTime.split(':');
    const end = new Date();
    end.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    const diff = end - now;
    if (diff <= 0) return 'Selesai';

    const minutesRemaining = Math.floor(diff / 60000);
    if (minutesRemaining < 60) return `${minutesRemaining} menit`;

    const hoursRemaining = Math.floor(minutesRemaining / 60);
    const mins = minutesRemaining % 60;
    return `${hoursRemaining} jam ${mins} menit`;
}

// Format date
function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Scanner Functions
async function startScan() {
    try {
        html5QrCode = new Html5Qrcode("reader");

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            () => { }
        );

        scannerActive = true;
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'block';
        document.getElementById('reader').style.display = 'block';

        showAlert('Scanner aktif! Arahkan kamera ke QR code', 'info');
    } catch (err) {
        showAlert('Gagal mengakses kamera: ' + err, 'error');
    }
}

function stopScan() {
    if (html5QrCode && scannerActive) {
        html5QrCode.stop().then(() => {
            scannerActive = false;
            document.getElementById('startBtn').style.display = 'block';
            document.getElementById('stopBtn').style.display = 'none';
        }).catch(err => {
            console.error("Error stopping scanner:", err);
        });
    }
}

async function onScanSuccess(decodedText) {
    if (!scannerActive) return;
    stopScan();
    await submitQRCode(decodedText);
}

// Handle File Upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const uploadResult = document.getElementById('uploadResult');
    uploadResult.innerHTML = '<p class="loading-text">Memproses gambar...</p>';

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.getElementById('qrCanvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                uploadResult.innerHTML = `
                    <p class="success-text">✅ QR Code terdeteksi!</p>
                    <p>Kode: <code>${code.data}</code></p>
                `;
                submitQRCode(code.data);
            } else {
                uploadResult.innerHTML = `
                    <p class="error-text">❌ QR Code tidak ditemukan dalam gambar</p>
                `;
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Submit Manual Code
function submitManualCode() {
    const code = document.getElementById('manualCode').value.trim();
    if (!code) {
        showAlert('Masukkan kode QR!', 'error');
        return;
    }
    submitQRCode(code);
}

// Submit QR Code
async function submitQRCode(qrCode) {
    try {
        showAlert('Memproses absensi...', 'info');

        const deviceId = localStorage.getItem('device_id');

        const response = await fetch(`${API_URL}/student/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ qr_code: qrCode, device_id: deviceId })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`✅ ${data.message}`, 'success');
            // Clear manual input if used
            const manualInput = document.getElementById('manualCode');
            if (manualInput) manualInput.value = '';

            // Clear file input if used
            const fileInput = document.getElementById('qrFile');
            if (fileInput) fileInput.value = '';

            // Clear upload result
            const uploadResult = document.getElementById('uploadResult');
            if (uploadResult) uploadResult.innerHTML = '';

            // Refresh all data
            refreshAll();
        } else {
            showAlert(`❌ ${data.message}`, 'error');
        }
    } catch (e) {
        showAlert('❌ Gagal mengirim data: ' + e.message, 'error');
    }
}

// Alert Function
function showAlert(message, type) {
    const alertBox = document.getElementById('alert');
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 4000);
}

// Logout
function logout() {
    if (confirm('Yakin ingin logout?')) {
        if (scannerActive) stopScan();
        localStorage.clear();
        window.location.replace('/');
    }
}
