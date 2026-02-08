const { db } = require('../config/db');
const utils = require('../config/utils');
const logger = require('../config/logger');

const studentController = {
    getDashboardStats: async (req, res) => {
        try {
            const userId = req.user.id;
            const now = new Date();
            const offset = now.getTimezoneOffset() * 60000;
            const localDateObj = new Date(now.getTime() - offset);
            const today = localDateObj.toISOString().split('T')[0];


            const [total] = await db.query(
                'SELECT COUNT(*) as count FROM attendance WHERE user_id = ? AND status IN ("hadir", "terlambat")',
                [userId]
            );


            const [thisMonth] = await db.query(
                `SELECT COUNT(*) as count FROM attendance 
                 WHERE user_id = ? AND status IN ("hadir", "terlambat") 
                 AND MONTH(tanggal) = MONTH(CURDATE()) AND YEAR(tanggal) = YEAR(CURDATE())`,
                [userId]
            );


            const [recent] = await db.query(
                `SELECT a.*, mp.nama as mapel_nama 
                 FROM attendance a 
                 JOIN qr_sessions qs ON a.session_id = qs.id 
                 JOIN mata_pelajaran mp ON qs.mapel_id = mp.id 
                 WHERE a.user_id = ? 
                 ORDER BY a.tanggal DESC, a.jam_absen DESC LIMIT 5`,
                [userId]
            );

            res.json({
                success: true,
                data: {
                    total: total[0].count,
                    thisMonth: thisMonth[0].count,
                    recent_attendance: recent
                }
            });
        } catch (err) {
            logger.error('Student dashboard stats error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    },

    scanAttendance: async (req, res) => {
        try {
            let { qr_code, latitude, longitude } = req.body;
            if (!qr_code) {
                return res.status(400).json({ success: false, message: 'QR code wajib diisi' });
            }

            qr_code = qr_code.trim();

            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 8);

            const offset = now.getTimezoneOffset() * 60000;
            const localDateObj = new Date(now.getTime() - offset);
            const currentDate = localDateObj.toISOString().split('T')[0];

            const yesterdayDate = new Date(localDateObj);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterday = yesterdayDate.toISOString().split('T')[0];

            const userId = req.user.id;

            const { device_id } = req.body;
            if (device_id) {
                const [userRows] = await db.query('SELECT device_id FROM users WHERE id = ?', [userId]);
                if (userRows[0].device_id && userRows[0].device_id !== device_id) {
                    return res.status(403).json({ success: false, message: 'Keamanan: Perangkat tidak dikenali. Silakan login ulang.' });
                }
            }

            const [sessions] = await db.query(
                `SELECT qs.*, mp.nama as mapel_nama 
                 FROM qr_sessions qs
                 LEFT JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                 WHERE qs.kode_qr = ?`,
                [qr_code]
            );

            if (sessions.length === 0) {
                return res.status(400).json({ success: false, message: 'Kode QR tidak valid (Sesi tidak ditemukan)' });
            }

            const s = sessions[0];

            if (s.kelas !== req.user.kelas) {
                return res.status(400).json({ success: false, message: `Sesi ini untuk kelas ${s.kelas}, bukan kelas Anda (${req.user.kelas})` });
            }

            if (!s.aktif) {
                return res.status(400).json({ success: false, message: 'Sesi ini sudah dinonaktifkan oleh guru' });
            }

            let sessionDateStr = s.tanggal;
            if (s.tanggal instanceof Date) {
                sessionDateStr = s.tanggal.toISOString().split('T')[0];
            }

            const isDateMatch = (sessionDateStr === currentDate) || (sessionDateStr === yesterday);

            if (!isDateMatch) {
                return res.status(400).json({ success: false, message: `Tanggal sesi tidak sesuai (Sesi: ${sessionDateStr}, Hari ini: ${currentDate})` });
            }

            let isTimeValid = false;
            if (s.jam_mulai <= s.jam_selesai) {

                if (currentTime >= s.jam_mulai && currentTime <= s.jam_selesai) {
                    isTimeValid = true;
                }
            } else {


                if (s.tanggal === currentDate) {

                    if (currentTime >= s.jam_mulai) isTimeValid = true;
                } else if (s.tanggal === yesterday) {
                    if (currentTime <= s.jam_selesai || currentTime >= s.jam_mulai) isTimeValid = true;
                }
            }

            if (!isTimeValid) {
                return res.status(400).json({ success: false, message: 'Sesi belum dimulai atau sudah berakhir' });
            }


            if (s.latitude && s.longitude && s.radius_meter) {
                if (!latitude || !longitude) {
                    return res.status(400).json({ success: false, message: 'Lokasi GPS diperlukan untuk sesi ini' });
                }
                const distance = utils.calculateDistance(latitude, longitude, s.latitude, s.longitude);
                if (distance > s.radius_meter) {
                    return res.status(400).json({ success: false, message: `Anda berada di luar radius absensi (${Math.round(distance)}m > ${s.radius_meter}m)` });
                }
            }


            const status = 'hadir';


            await db.query(
                'INSERT INTO attendance (user_id, session_id, tanggal, jam_absen, status, latitude, longitude, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [req.user.id, s.id, currentDate, currentTime, status, latitude || null, longitude || null, req.ip]
            );


            const io = req.app.get('io');
            if (io) {
                io.emit('attendance-recorded', {
                    user_id: req.user.id,
                    user_name: req.user.nama,
                    mapel: s.mapel_nama,
                    waktu: currentTime,
                    status,
                    kelas: req.user.kelas
                });

                io.to('admin-room').emit('new-attendance', {
                    user_id: req.user.id,
                    user_name: req.user.nama,
                    mapel: s.mapel_nama,
                    kelas: req.user.kelas,
                    waktu: currentTime,
                    status
                });
            }

            res.json({ success: true, message: `Berhasil absen untuk mata pelajaran ${s.mapel_nama}` });

        } catch (err) {
            logger.error('Scan attendance error:', err);
            res.status(500).json({ success: false, message: 'Gagal melakukan absensi' });
        }
    },

    getHistory: async (req, res) => {
        try {
            const { page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;
            const [rows] = await db.query(
                `SELECT a.*, mp.nama as mapel, qs.kelas as session_kelas
                 FROM attendance a
                 LEFT JOIN qr_sessions qs ON a.session_id = qs.id
                 LEFT JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                 WHERE a.user_id = ?
                 ORDER BY a.tanggal DESC, a.jam_absen DESC LIMIT ? OFFSET ?`,
                [req.user.id, parseInt(limit), offset]
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get history error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil riwayat' });
        }
    },

    getStats: async (req, res) => {
        try {
            const userId = req.user.id;


            const [total] = await db.query(
                'SELECT COUNT(*) as count FROM attendance WHERE user_id = ? AND status IN ("hadir", "terlambat")',
                [userId]
            );


            const [thisMonth] = await db.query(
                `SELECT COUNT(*) as count FROM attendance 
                 WHERE user_id = ? AND status IN ("hadir", "terlambat") 
                 AND MONTH(tanggal) = MONTH(CURDATE()) AND YEAR(tanggal) = YEAR(CURDATE())`,
                [userId]
            );


            const [perMapel] = await db.query(
                `SELECT mp.nama, COUNT(*) as total
                 FROM attendance a
                 JOIN qr_sessions qs ON a.session_id = qs.id
                 JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                 WHERE a.user_id = ? AND a.status IN ("hadir", "terlambat")
                 GROUP BY mp.id, mp.nama`,
                [userId]
            );

            // Last attendance
            const [last] = await db.query(
                `SELECT a.tanggal, a.jam_absen, mp.nama as mapel
                 FROM attendance a
                 JOIN qr_sessions qs ON a.session_id = qs.id
                 JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                 WHERE a.user_id = ?
                 ORDER BY a.tanggal DESC, a.jam_absen DESC LIMIT 1`,
                [userId]
            );

            res.json({
                success: true,
                data: {
                    total: total[0].count,
                    thisMonth: thisMonth[0].count,
                    perMapel: perMapel,
                    lastAttendance: last[0] || null
                }
            });
        } catch (err) {
            logger.error('Get stats error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil statistik' });
        }
    },

    submitLeave: async (req, res) => {
        try {
            const { type, keterangan } = req.body;
            if (!type || !keterangan) {
                return res.status(400).json({ success: false, message: 'Jenis izin dan keterangan wajib diisi' });
            }

            const now = new Date();
            const currentDate = now.toISOString().split('T')[0];
            const currentTime = now.toTimeString().slice(0, 8);
            const userId = req.user.id;
            const lampiran = req.file ? `/uploads/attachments/${req.file.filename}` : null;
            const { device_id } = req.body;


            if (device_id) {
                const [userRows] = await db.query('SELECT device_id FROM users WHERE id = ?', [userId]);
                if (userRows[0].device_id && userRows[0].device_id !== device_id) {
                    return res.status(403).json({ success: false, message: 'Keamanan: Perangkat tidak dikenali. Silakan login ulang.' });
                }
            }


            const [existing] = await db.query(
                'SELECT id FROM attendance WHERE user_id = ? AND tanggal = ?',
                [userId, currentDate]
            );

            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Anda sudah tercatat kehadirannya atau sudah mengirim izin hari ini' });
            }



            const [sessions] = await db.query(
                'SELECT id FROM qr_sessions WHERE kelas = ? AND tanggal = ? LIMIT 1',
                [req.user.kelas, currentDate]
            );

            const sessionId = sessions[0]?.id || null;

            await db.query(
                'INSERT INTO attendance (user_id, session_id, tanggal, jam_absen, status, keterangan, lampiran, latitude, longitude, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, sessionId, currentDate, currentTime, type, keterangan, lampiran, null, null, req.ip]
            );

            // Notify admin
            const io = req.app.get('io');
            if (io) {
                io.to('admin-room').emit('new-attendance', {
                    user_id: userId,
                    user_name: req.user.nama,
                    mapel: 'Izin/Sakit',
                    kelas: req.user.kelas,
                    waktu: currentTime,
                    status: type,
                    keterangan
                });
            }

            res.json({ success: true, message: 'Permohonan izin berhasil dikirim' });

        } catch (err) {
            logger.error('Submit leave error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengirim izin' });
        }
    },

    getAnalytics: async (req, res) => {
        try {
            const userId = req.user.id;
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;

            // Monthly stats
            const [stats] = await db.query(
                `SELECT status, COUNT(*) as count 
                 FROM attendance 
                 WHERE user_id = ? AND MONTH(tanggal) = ? AND YEAR(tanggal) = ?
                 GROUP BY status`,
                [userId, month, year]
            );

            // Weekly history (last 7 days of attendance)
            const [history] = await db.query(
                `SELECT 
                    tanggal, 
                    status 
                 FROM attendance 
                 WHERE user_id = ? 
                 ORDER BY tanggal DESC 
                 LIMIT 7`,
                [userId]
            );

            res.json({
                success: true,
                data: {
                    monthly: stats,
                    recent: history.reverse()
                }
            });
        } catch (err) {
            logger.error('Get analytics error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil data analitik' });
        }
    }
};

module.exports = studentController;
