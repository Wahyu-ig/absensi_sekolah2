const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const moment = require('moment');
const QRCode = require('qrcode');
const logger = require('./logger');

const utils = {
    generateToken: (user) => {
        const token = jwt.sign(
            {
                id: user.id,
                nisn: user.nisn,
                nama: user.nama,
                role: user.role,
                kelas: user.kelas
            },
            process.env.JWT_SECRET || 'default-secret-key-change-in-production',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        return token;
    },

    verifyToken: (token) => {
        try {
            return jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key-change-in-production');
        } catch (err) {
            return null;
        }
    },

    hashPassword: async (password) => {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10);
        return await bcrypt.hash(password, salt);
    },

    comparePassword: async (password, hash) => {
        return await bcrypt.compare(password, hash);
    },

    generateRandomString: (length = 32) => {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    },

    formatDate: (date, format = 'DD/MM/YYYY') => {
        return moment(date).format(format);
    },

    generateQRCode: async (data) => {
        try {
            const qrCode = await QRCode.toDataURL(JSON.stringify(data), {
                width: 400,
                margin: 2,
                errorCorrectionLevel: 'H'
            });
            return qrCode;
        } catch (err) {
            logger.error('QR Code generation error:', err);
            return null;
        }
    },

    calculateDistance: (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    },

    validateEmail: (email) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    validatePhone: (phone) => {
        const re = /^[\+]?[0-9]{10,15}$/;
        return re.test(phone);
    }
};

module.exports = utils;
