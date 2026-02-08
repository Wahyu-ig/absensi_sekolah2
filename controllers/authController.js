const { db } = require('../config/db');
const utils = require('../config/utils');
const logger = require('../config/logger');
const bcrypt = require('bcryptjs');

const authController = {
    login: async (req, res) => {
        try {
            const { nisn, password } = req.body;

            if (!nisn || !password) {
                return res.status(400).json({ success: false, message: 'NISN dan password wajib diisi' });
            }

            const [rows] = await db.query(
                'SELECT id, nisn, nama, email, telepon, password, role, kelas, is_active FROM users WHERE nisn = ?',
                [nisn]
            );

            if (rows.length === 0) {
                return res.status(401).json({ success: false, message: 'NISN atau password salah' });
            }

            const user = rows[0];

            if (!user.is_active) {
                return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan' });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.status(401).json({ success: false, message: 'NISN atau password salah' });
            }

            const tokens = utils.generateToken(user);
            const token = tokens; // Assuming it returns a string based on usage below

            const { device_id, device_name, user_agent, platform, browser } = req.body;
            const ip_address = req.ip || req.connection.remoteAddress;

            // Device Lock logic for students
            if (user.role === 'student' && device_id) {
                const [userCheck] = await db.query('SELECT device_id FROM users WHERE id = ?', [user.id]);
                const currentDeviceId = userCheck[0].device_id;

                if (!currentDeviceId) {
                    // First login, lock the device
                    await db.query('UPDATE users SET device_id = ? WHERE id = ?', [device_id, user.id]);
                    logger.info(`Locked user ${user.id} to device ${device_id}`);
                } else if (currentDeviceId !== device_id) {
                    // Device mismatch
                    logger.warn(`Device mismatch for user ${user.id}: expected ${currentDeviceId}, got ${device_id}`);
                    return res.status(403).json({
                        success: false,
                        message: 'Akun Anda terkunci pada perangkat lain. Silakan hubungi Guru/Admin untuk reset.'
                    });
                }
            }

            // Create/Update Device Session
            if (device_id) {
                // Deactivate all previous sessions for this user
                await db.query(
                    'UPDATE device_sessions SET is_active = 0, logout_time = NOW(), logout_reason = ? WHERE user_id = ? AND is_active = 1',
                    ['New login from different device', user.id]
                );

                // Create new active session
                await db.query(
                    `INSERT INTO device_sessions (user_id, device_id, device_name, user_agent, platform, browser, ip_address, is_active, login_time, last_activity)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
                     ON DUPLICATE KEY UPDATE 
                        is_active = 1,
                        login_time = NOW(),
                        last_activity = NOW(),
                        logout_time = NULL,
                        logout_reason = NULL,
                        user_agent = VALUES(user_agent),
                        ip_address = VALUES(ip_address)`,
                    [user.id, device_id, device_name || 'Unknown Device', user_agent || req.headers['user-agent'], platform || 'Unknown', browser || 'Unknown', ip_address]
                );

                logger.info(`Device session created for user ${user.id} on device ${device_id}`);
            }

            await db.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP, login_attempts = 0 WHERE id = ?',
                [user.id]
            );

            res.json({
                success: true,
                message: 'Login berhasil',
                token: token,
                user: {
                    id: user.id,
                    nisn: user.nisn,
                    nama: user.nama,
                    email: user.email,
                    telepon: user.telepon,
                    role: user.role,
                    kelas: user.kelas
                }
            });
        } catch (err) {
            logger.error('Login error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    },

    logout: async (req, res) => {
        res.json({ success: true, message: 'Logout berhasil' });
    },

    changePassword: async (req, res) => {
        try {
            const { current_password, new_password, confirm_password } = req.body;
            if (!current_password || !new_password || !confirm_password) {
                return res.status(400).json({ success: false, message: 'Semua field diperlukan' });
            }
            if (new_password !== confirm_password) {
                return res.status(400).json({ success: false, message: 'Password baru dan konfirmasi tidak cocok' });
            }
            if (new_password.length < 6) {
                return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
            }

            const [users] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
            const match = await bcrypt.compare(current_password, users[0].password);
            if (!match) {
                return res.status(400).json({ success: false, message: 'Password saat ini salah' });
            }

            const hashedPassword = await utils.hashPassword(new_password);
            await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
            res.json({ success: true, message: 'Password berhasil diubah' });
        } catch (err) {
            logger.error('Change password error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengubah password' });
        }
    },

    getProfile: async (req, res) => {
        try {
            const [rows] = await db.query(
                'SELECT id, nisn, nama, email, telepon, role, kelas, is_active, created_at, last_login FROM users WHERE id = ?',
                [req.user.id]
            );
            res.json({ success: true, data: rows[0] });
        } catch (err) {
            logger.error('Get profile error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil data profile' });
        }
    },

    updateProfile: async (req, res) => {
        try {
            const { nama, email, telepon } = req.body;
            const updates = [];
            const params = [];
            if (nama) { updates.push('nama = ?'); params.push(nama); }
            if (email !== undefined) { updates.push('email = ?'); params.push(email); }
            if (telepon !== undefined) { updates.push('telepon = ?'); params.push(telepon); }
            params.push(req.user.id);
            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
            res.json({ success: true, message: 'Profile berhasil diupdate' });
        } catch (err) {
            logger.error('Update profile error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengupdate profile' });
        }
    }
};

module.exports = authController;