const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Scan QR
router.post('/scan', verifyToken, async (req, res) => {
    const { qr_code } = req.body;
    const userId = req.userId;

    if (!qr_code) {
        return res.status(400).json({ message: 'QR Code is required' });
    }

    try {
        // 1. Find Session
        const [sessions] = await db.query('SELECT * FROM qr_sessions WHERE kode_qr = ? AND aktif = 1', [qr_code]);

        if (sessions.length === 0) {
            return res.status(404).json({ message: 'QR Code valid tidak ditemukan atau sesi sudah ditutup.' });
        }

        const session = sessions[0];
        const now = new Date();
        const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS format

        // Check time validity
        if (currentTime < session.jam_mulai || currentTime > session.jam_selesai) {
            return res.status(400).json({ message: 'Absensi belum dibuka atau sudah ditutup.' });
        }

        // 2. Check if already attended today
        const today = now.toISOString().split('T')[0];
        const [existing] = await db.query(
            'SELECT * FROM attendance WHERE user_id = ? AND tanggal = ?',
            [userId, today]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'Anda sudah melakukan absensi hari ini.' });
        }

        // 3. Insert Attendance
        await db.query(
            'INSERT INTO attendance (user_id, session_id, tanggal, jam_absen) VALUES (?, ?, ?, ?)',
            [userId, session.id, today, currentTime]
        );

        res.json({ message: 'Absensi berhasil!' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get User History
router.get('/history', verifyToken, async (req, res) => {
    try {
        const [history] = await db.query(
            'SELECT a.tanggal, a.jam_absen FROM attendance a WHERE a.user_id = ? ORDER BY a.tanggal DESC LIMIT 10',
            [req.userId]
        );
        res.json(history);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
