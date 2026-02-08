const { db } = require('../config/db');
const utils = require('../config/utils');
const logger = require('../config/logger');

const teacherController = {
    createSession: async (req, res) => {
        try {
            const { mapel_id, kelas, jam_mulai, jam_selesai, tanggal, latitude, longitude, lokasi, radius_meter = 100 } = req.body;

            if (!mapel_id || !kelas || !jam_mulai || !jam_selesai) {
                return res.status(400).json({ success: false, message: 'Mapel, kelas, jam mulai, dan jam selesai wajib diisi' });
            }

            const kode_qr = `QR_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

            const now = new Date();
            const offset = now.getTimezoneOffset() * 60000;
            const localDateObj = new Date(now.getTime() - offset);
            const todayStr = localDateObj.toISOString().split('T')[0];

            let sessionDate = tanggal || todayStr;
            const nowTime = new Date().toTimeString().slice(0, 5); // HH:MM

            if (!tanggal && jam_mulai > jam_selesai) {
                if (nowTime <= jam_selesai) {
                    const d = new Date(localDateObj);
                    d.setDate(d.getDate() - 1);
                    sessionDate = d.toISOString().split('T')[0];
                }
            }

            let teacher_id = null;
            if (req.user.role === 'teacher') {
                const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
                teacher_id = teacher[0]?.id || null;
            }

            const [result] = await db.query(
                `INSERT INTO qr_sessions (school_id, kode_qr, mapel_id, teacher_id, kelas, jam_mulai, jam_selesai, tanggal, latitude, longitude, lokasi, radius_meter, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [1, kode_qr, mapel_id, teacher_id, kelas, jam_mulai, jam_selesai, sessionDate, latitude || null, longitude || null, lokasi || null, radius_meter, req.user.id]
            );

            const qrData = {
                session_id: result.insertId,
                kode: kode_qr,
                mapel_id,
                kelas,
                tanggal: sessionDate,
                waktu: `${jam_mulai}-${jam_selesai}`
            };

            const qrCode = await utils.generateQRCode(qrData);

            // Notify via socket
            const io = req.app.get('io');
            if (io) {
                io.to('admin-room').emit('new-session', {
                    session_id: result.insertId,
                    kelas,
                    mapel_id,
                    created_by: req.user.nama,
                    created_at: new Date()
                });
            }

            res.json({
                success: true,
                message: 'Sesi berhasil dibuat',
                data: {
                    session_id: result.insertId,
                    kode_qr,
                    qr_code: qrCode,
                    qr_data: qrData
                }
            });
        } catch (err) {
            logger.error('Create session error:', err);
            res.status(500).json({ success: false, message: 'Gagal membuat sesi' });
        }
    },

    updateSession: async (req, res) => {
        try {
            const { id } = req.params;
            const { mapel_id, kelas, jam_mulai, jam_selesai, aktif } = req.body;

            let query = 'UPDATE qr_sessions SET ';
            let params = [];
            let fields = [];

            if (mapel_id !== undefined) { fields.push('mapel_id = ?'); params.push(mapel_id); }
            if (kelas !== undefined) { fields.push('kelas = ?'); params.push(kelas); }
            if (jam_mulai !== undefined) { fields.push('jam_mulai = ?'); params.push(jam_mulai); }
            if (jam_selesai !== undefined) { fields.push('jam_selesai = ?'); params.push(jam_selesai); }
            if (aktif !== undefined) { fields.push('aktif = ?'); params.push(aktif); }

            if (fields.length === 0) return res.status(400).json({ success: false, message: 'Tidak ada data yang diupdate' });

            query += fields.join(', ') + ' WHERE id = ?';
            params.push(id);

            await db.query(query, params);
            res.json({ success: true, message: 'Sesi berhasil diperbarui' });
        } catch (err) {
            logger.error('Update session error:', err);
            res.status(500).json({ success: false, message: 'Gagal update sesi' });
        }
    },

    deleteSession: async (req, res) => {
        try {
            const sessionId = req.params.id;

            // Hapus semua attendance yang terkait dengan session ini terlebih dahulu
            await db.query('DELETE FROM attendance WHERE session_id = ?', [sessionId]);

            // Baru hapus session-nya
            const [result] = await db.query('DELETE FROM qr_sessions WHERE id = ?', [sessionId]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sesi tidak ditemukan'
                });
            }

            res.json({
                success: true,
                message: 'Sesi dan data absensi terkait berhasil dihapus'
            });
        } catch (err) {
            logger.error('Delete session error:', err);
            res.status(500).json({
                success: false,
                message: 'Gagal hapus sesi',
                error: err.message
            });
        }
    },

    getSessions: async (req, res) => {
        try {
            const { tanggal, kelas, aktif } = req.query;
            const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
            const teacherId = teacher[0]?.id || null;

            let query = `
                SELECT qs.*, mp.nama as mapel_nama, mp.kode as mapel_kode, mp.warna as mapel_warna,
                u.nama as teacher_name,
                (SELECT COUNT(*) FROM attendance WHERE session_id = qs.id) as attendance_count
                FROM qr_sessions qs
                JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                LEFT JOIN users u ON qs.created_by = u.id
                WHERE qs.school_id = 1 AND qs.teacher_id = ?
            `;
            let params = [teacherId];

            if (tanggal) { query += ' AND qs.tanggal = ?'; params.push(tanggal); }
            if (kelas) { query += ' AND qs.kelas = ?'; params.push(kelas); }
            if (aktif !== undefined) { query += ' AND qs.aktif = ?'; params.push(aktif === 'true' || aktif === '1'); }

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
    }
};

module.exports = teacherController;