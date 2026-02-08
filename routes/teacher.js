const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const { verifyToken, checkRole } = require('../middleware/auth');

router.use(verifyToken);
router.use(checkRole('super_admin', 'admin', 'teacher'));

router.post('/sessions', teacherController.createSession);
router.get('/sessions', teacherController.getSessions);
router.get('/sessions/:id', teacherController.getSessionById);
router.put('/sessions/:id', teacherController.updateSession);
router.delete('/sessions/:id', teacherController.deleteSession);

module.exports = router;
