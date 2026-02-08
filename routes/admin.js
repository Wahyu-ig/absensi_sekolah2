const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const attendanceController = require('../controllers/attendanceController');
const { verifyToken, checkRole, requireSuperAdmin, requireAdminOrSuper } = require('../middleware/auth');
const { db } = require('../config/db');

router.use(verifyToken);
// Allow admin and superadmin (and teacher for some parts, handled in specific routes if needed)
// CheckRole here might be too restrictive if teacher needs access to SOME admin routes?
// Previously: router.use(checkRole('admin', 'super_admin', 'teacher'));
// Let's keep it broad but use specific middleware for sensitive routes.
router.use(checkRole('admin', 'superadmin', 'teacher'));

router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.post('/users', requireSuperAdmin, adminController.createUser);
router.put('/users/:id', requireAdminOrSuper, adminController.updateUser);
router.delete('/users/:id', requireSuperAdmin, adminController.deleteUser);
router.put('/users/:id/reset-password', adminController.resetPassword);
router.put('/users/:id/reset-device', adminController.resetDeviceLock);
router.post('/register', adminController.createUser); // Alias for register form
router.get('/report/export', adminController.exportReport);
router.get('/izin', adminController.getIzinRequests);
router.put('/izin/:id/status', adminController.updateIzinStatus);
router.delete('/izin/:id', adminController.deleteIzin);
router.post('/auto-alpha', attendanceController.generateAutoAlpha);
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/logs', adminController.getLogs);

// File: routes/admin.js

// GET /api/admin/device-sessions - Get all device sessions
router.get('/device-sessions', async (req, res) => {
    try {
        const { kelas, status, role } = req.query;

        let query = `
            SELECT ds.*, u.nisn, u.nama, u.kelas, u.role 
            FROM device_sessions ds
            JOIN users u ON ds.user_id = u.id
            WHERE 1=1
        `;

        const params = [];

        if (kelas) {
            query += ' AND u.kelas = ?';
            params.push(kelas);
        }

        if (status) {
            if (status === 'online') {
                query += ' AND ds.is_active = 1';
            } else if (status === 'offline') {
                query += ' AND ds.is_active = 0';
            }
        }

        if (role) {
            query += ' AND u.role = ?';
            params.push(role);
        }

        query += ' ORDER BY ds.last_activity DESC';

        const [sessions] = await db.query(query, params);

        res.json({
            success: true,
            data: sessions
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/users/:id/device-sessions - Get user's device sessions
router.get('/users/:id/device-sessions', async (req, res) => {
    try {
        const [sessions] = await db.query(
            'SELECT * FROM device_sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_activity DESC',
            [req.params.id]
        );

        res.json({
            success: true,
            data: sessions
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/users/:id/force-logout-all - Force logout all devices
router.post('/users/:id/force-logout-all', async (req, res) => {
    try {
        const { reason, admin_id, admin_name } = req.body;

        // Update all active sessions
        await db.query(
            'UPDATE device_sessions SET is_active = 0, logout_reason = ?, logout_by = ?, logout_time = NOW() WHERE user_id = ? AND is_active = 1',
            [reason || 'Admin forced logout', admin_name, req.params.id]
        );

        // Log the action
        await db.query(
            'INSERT INTO admin_logs (admin_id, action, target_user_id, details, timestamp) VALUES (?, ?, ?, ?, NOW())',
            [admin_id, 'FORCE_LOGOUT_ALL', req.params.id, JSON.stringify({ reason, admin_name })]
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${req.params.id}`).emit('force-logout', {
                reason: 'Admin forced logout',
                admin: admin_name,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'All devices have been logged out'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/devices/:deviceId/force-logout - Force logout specific device
router.post('/devices/:deviceId/force-logout', async (req, res) => {
    try {
        const { user_id, reason, admin_id } = req.body;

        await db.query(
            'UPDATE device_sessions SET is_active = 0, logout_reason = ?, logout_by = ?, logout_time = NOW() WHERE device_id = ?',
            [reason || 'Admin forced logout', 'Admin', req.params.deviceId]
        );

        // Log the action
        await db.query(
            'INSERT INTO admin_logs (admin_id, action, target_user_id, details, timestamp) VALUES (?, ?, ?, ?, NOW())',
            [admin_id, 'FORCE_LOGOUT_DEVICE', user_id, JSON.stringify({ device_id: req.params.deviceId, reason })]
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`device_${req.params.deviceId}`).emit('device-logged-out', {
                reason: 'Admin forced logout',
                admin: 'Admin',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Device has been logged out'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/users/:id/reset-login-attempts - Reset login attempts
router.post('/users/:id/reset-login-attempts', async (req, res) => {
    try {
        const { admin_id, admin_name } = req.body;

        await db.query(
            'UPDATE users SET login_attempts = 0, last_login_attempt = NULL WHERE id = ?',
            [req.params.id]
        );

        // Log the action
        await db.query(
            'INSERT INTO admin_logs (admin_id, action, target_user_id, details, timestamp) VALUES (?, ?, ?, ?, NOW())',
            [admin_id, 'RESET_LOGIN_ATTEMPTS', req.params.id, JSON.stringify({ admin_name })]
        );

        res.json({
            success: true,
            message: 'Login attempts have been reset'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/check-device - Check device authorization
router.post('/auth/check-device', async (req, res) => {
    try {
        const { device_id, user_id } = req.body;

        // Check if device session exists and is active
        const [sessions] = await db.query(
            'SELECT * FROM device_sessions WHERE device_id = ? AND user_id = ? AND is_active = 1',
            [device_id, user_id]
        );

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Device not authorized. Please login again.'
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;