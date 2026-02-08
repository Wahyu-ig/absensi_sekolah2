const { db } = require('../config/db');
const logger = require('../config/logger');

const commonController = {
    getClasses: async (req, res) => {
        try {
            // Static complete class list
            const classes = [];

            // Generate 10.1 - 10.10
            for (let i = 1; i <= 10; i++) classes.push(`10.${i}`);

            // Generate 11.1 - 11.10
            for (let i = 1; i <= 10; i++) classes.push(`11.${i}`);

            // Generate 12.1 - 12.10
            for (let i = 1; i <= 10; i++) classes.push(`12.${i}`);

            res.json({ success: true, data: classes });
        } catch (err) {
            logger.error('Get classes error:', err);
            res.status(500).json({ success: false, message: 'Gagal memuat data kelas' });
        }
    },

    getMapel: async (req, res) => {
        try {
            const [rows] = await db.query('SELECT id, nama, kode, warna FROM mata_pelajaran ORDER BY nama');
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get mapel error:', err);
            res.status(500).json({ success: false, message: 'Gagal memuat data mapel' });
        }
    },

    getSessions: async (req, res) => {
        try {
            const { tanggal, kelas, aktif, teacher_id } = req.query;
            let query = `
                SELECT qs.*, mp.nama as mapel_nama, mp.kode as mapel_kode, mp.warna as mapel_warna,
                u.nama as teacher_name,
                (SELECT COUNT(*) FROM attendance WHERE session_id = qs.id) as attendance_count
                FROM qr_sessions qs
                JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                LEFT JOIN users u ON qs.created_by = u.id
                WHERE qs.school_id = 1
            `;
            let params = [];

            if (req.user.role === 'teacher') {
                const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
                const teacherId = teacher[0]?.id || null;
                query += ' AND qs.teacher_id = ?';
                params.push(teacherId);
            }

            if (tanggal) { query += ' AND qs.tanggal = ?'; params.push(tanggal); }
            if (kelas) { query += ' AND qs.kelas = ?'; params.push(kelas); }
            if (aktif !== undefined) { query += ' AND qs.aktif = ?'; params.push(aktif === 'true' || aktif === '1'); }
            if (teacher_id) { query += ' AND qs.teacher_id = ?'; params.push(teacher_id); }

            query += ' ORDER BY qs.tanggal DESC, qs.jam_mulai DESC';
            const [rows] = await db.query(query, params);
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get sessions error:', err);
            res.status(500).json({ success: false, message: 'Gagal memuat data sesi' });
        }
    },

    getSessionById: async (req, res) => {
        try {
            const [rows] = await db.query(
                `SELECT qs.*, mp.nama as mapel_nama, mp.kode as mapel_kode, mp.warna as mapel_warna,
                 u.nama as teacher_name
                 FROM qr_sessions qs
                 JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                 LEFT JOIN users u ON qs.created_by = u.id
                 WHERE qs.id = ?`,
                [req.params.id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
            }

            const [attendance] = await db.query(
                `SELECT a.*, u.nisn, u.nama, u.kelas 
                 FROM attendance a
                 JOIN users u ON a.user_id = u.id
                 WHERE a.session_id = ?
                 ORDER BY a.jam_absen`,
                [req.params.id]
            );

            res.json({
                success: true,
                data: {
                    ...rows[0],
                    attendance_list: attendance
                }
            });
        } catch (err) {
            logger.error('Get session detail error:', err);
            res.status(500).json({ success: false, message: 'Gagal memuat detail sesi' });
        }
    },

    getReport: async (req, res) => {
        try {
            const { kelas, tanggal, mapel_id, user_id } = req.query;
            let query = `
                SELECT a.*, u.nama, u.nisn, u.kelas, mp.nama as mapel 
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                JOIN qr_sessions qs ON a.session_id = qs.id
                JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                WHERE 1=1
            `;
            let params = [];

            // Role filtering
            if (req.user.role === 'teacher') {
                const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
                const teacherId = teacher[0]?.id || null;
                query += ' AND qs.teacher_id = ?';
                params.push(teacherId);
            } else if (req.user.role === 'student') {
                query += ' AND a.user_id = ?';
                params.push(req.user.id);
            }

            if (kelas) { query += ' AND u.kelas = ?'; params.push(kelas); }
            if (tanggal) { query += ' AND a.tanggal = ?'; params.push(tanggal); }
            if (mapel_id) { query += ' AND qs.mapel_id = ?'; params.push(mapel_id); }
            if (user_id) { query += ' AND a.user_id = ?'; params.push(user_id); }

            query += ' ORDER BY a.tanggal DESC, a.jam_absen DESC';
            const [rows] = await db.query(query, params);
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get report error:', err);
            res.status(500).json({ success: false, message: 'Gagal memuat laporan' });
        }
    },

    getActiveSessions: async (req, res) => {
        try {
            const now = new Date();
            const offset = now.getTimezoneOffset() * 60000;
            const localDateObj = new Date(now.getTime() - offset);
            const today = localDateObj.toISOString().split('T')[0];

            const yesterdayDate = new Date(localDateObj);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterday = yesterdayDate.toISOString().split('T')[0];

            const currentTime = now.toTimeString().slice(0, 8);

            let query = `
                SELECT qs.*, mp.nama as mapel_nama, mp.kode as mapel_kode, mp.warna as mapel_warna,
                u.nama as teacher_name
                FROM qr_sessions qs
                JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                LEFT JOIN users u ON qs.created_by = u.id
                WHERE qs.aktif = TRUE AND (
                    (qs.tanggal = ? AND qs.jam_mulai <= qs.jam_selesai AND qs.jam_mulai <= ? AND qs.jam_selesai >= ?)
                    OR
                    (qs.tanggal = ? AND qs.jam_mulai > qs.jam_selesai AND qs.jam_mulai <= ?)
                    OR
                    (qs.tanggal = ? AND qs.jam_mulai > qs.jam_selesai AND qs.jam_selesai >= ?)
                )
            `;
            let params = [today, currentTime, currentTime, today, currentTime, yesterday, currentTime];

            if (req.user.role === 'student' && req.user.kelas) {
                query += ' AND qs.kelas = ?';
                params.push(req.user.kelas);
            }

            const [rows] = await db.query(query, params);
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get active sessions error:', err);
            res.status(500).json({ success: false, message: 'Gagal memuat sesi aktif' });
        }
    }
};

module.exports = commonController;
