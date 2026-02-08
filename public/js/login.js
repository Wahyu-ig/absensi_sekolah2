const API_URL = window.location.origin + '/api';

// Cek apakah sudah login (hindari loop) - DISABLED
// const token = localStorage.getItem('token');
// const user = JSON.parse(localStorage.getItem('user') || '{}');
// if (token && user.role) {
//    redirectByRole(user.role);
// }

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const nisn = document.getElementById('nisn').value.trim();
    const password = document.getElementById('password').value;
    const btn = e.target.querySelector('button');

    // Disable button saat proses
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    // Generate unique device ID if not exists
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = 'dev-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('device_id', deviceId);
    }

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nisn, password, device_id: deviceId })
        });

        const data = await res.json();

        if (data.success) {
            if (!data.user || !data.user.role) {
                console.error('Login response missing user or role:', data);
                showAlert('Login berhasil tapi data user tidak valid. Hubungi admin.', 'error');
                return;
            }

            // Simpan data
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            console.log('Login success, user saved:', data.user);

            showAlert('Login berhasil! Mengalihkan...', 'success');

            // Redirect setelah delay kecil
            setTimeout(() => {
                redirectByRole(data.user.role);
            }, 500);

        } else {
            showAlert(data.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Masuk';
        }
    } catch (err) {
        showAlert('Gagal terhubung ke server', 'error');
        btn.disabled = false;
        btn.textContent = 'Masuk';
    }
});

function redirectByRole(role) {
    switch (role) {
        case 'superadmin':
        case 'admin':
            window.location.replace('/admin.html');
            break;
        case 'teacher':
            window.location.replace('/teacher.html');
            break;
        case 'student':
            window.location.replace('/student.html');
            break;
        default:
            window.location.replace('/');
    }
}

function showAlert(msg, type) {
    const alert = document.getElementById('alertBox') || document.getElementById('alert');
    if (alert) {
        alert.className = `alert alert-${type}`;
        alert.textContent = msg;
        alert.style.display = 'block';
    } else {
        console.error('Alert element not found', msg);
        alert(msg); // Fallback to browser alert
    }
}