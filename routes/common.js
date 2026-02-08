const express = require('express');
const router = express.Router();
const commonController = require('../controllers/commonController');
const teacherController = require('../controllers/teacherController');
const { verifyToken, checkRole } = require('../middleware/auth');

// GET routes (Shared)
router.get('/classes', verifyToken, commonController.getClasses);
router.get('/mapel', verifyToken, commonController.getMapel);
router.get('/sessions', verifyToken, commonController.getSessions);
router.get('/sessions/:id', verifyToken, commonController.getSessionById);
router.get('/qr/active', verifyToken, commonController.getActiveSessions);
router.get('/admin/report', verifyToken, commonController.getReport);

// Mutation routes (Shared between Teacher and Admin)
router.post('/sessions', verifyToken, checkRole('super_admin', 'admin', 'teacher'), teacherController.createSession);
router.put('/sessions/:id', verifyToken, checkRole('super_admin', 'admin', 'teacher'), teacherController.updateSession);
router.delete('/sessions/:id', verifyToken, checkRole('super_admin', 'admin', 'teacher'), teacherController.deleteSession);

module.exports = router;
