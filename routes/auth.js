const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 10 * 1000,
    max: 5,
    message: { success: false, message: 'Terlalu banyak percobaan login, silakan coba lagi setelah 10 detik' }
});

router.post('/login', loginLimiter, authController.login);
router.post('/logout', verifyToken, authController.logout);
router.post('/change-password', verifyToken, authController.changePassword);
router.get('/profile', verifyToken, authController.getProfile);
router.put('/profile', verifyToken, authController.updateProfile);

module.exports = router;
