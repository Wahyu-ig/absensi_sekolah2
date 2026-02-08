const jwt = require('jsonwebtoken');
const { db } = require('../config/db');
const logger = require('../config/logger');

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key-change-in-production');

        // Check if user still exists and is active
        const [user] = await db.query(
            'SELECT id, nisn, nama, role, kelas, is_active FROM users WHERE id = ?',
            [decoded.id]
        );

        if (user.length === 0) {
            return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
        }

        if (!user[0].is_active) {
            return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan' });
        }

        req.user = { ...decoded, ...user[0] };
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Token tidak valid' });
        }
        logger.error('Token verification error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const checkRole = (...roles) => {
    const allowedRoles = roles.flat();
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            logger.warn(`User ${req.user.id} with role ${req.user.role} tried to access ${req.method} ${req.originalUrl}`);
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak. Anda tidak memiliki izin untuk mengakses resource ini.'
            });
        }
        next();
    };
};

const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Akses ditolak: Khusus Superadmin' });
    }
    next();
};

const requireAdminOrSuper = (req, res, next) => {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Akses ditolak: Admin privileges required' });
    }
    next();
};

module.exports = {
    verifyToken,
    checkRole,
    requireSuperAdmin,
    requireAdminOrSuper
};
