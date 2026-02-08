const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { verifyToken, checkRole } = require('../middleware/auth');

const multer = require('multer');
const path = require('path');

// Multer config for Izin attachments
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/attachments');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'izin-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

router.use(verifyToken);
router.use(checkRole('student'));

router.get('/stats', studentController.getStats);
router.get('/history', studentController.getHistory);
router.post('/scan', studentController.scanAttendance);
router.get('/dashboard', studentController.getDashboardStats);
router.get('/analytics', studentController.getAnalytics);
router.post('/izin', upload.single('lampiran'), studentController.submitLeave);

module.exports = router;
