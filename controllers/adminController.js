const { db } = require('../config/db');
const utils = require('../config/utils');
const logger = require('../config/logger');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const adminController = {
    getUsers: async (req, res) => {
        try {
            const { kelas, role, search } = req.query;
            let query = 'SELECT id, nisn, nama, role, kelas, email, telepon, is_active, created_at FROM users WHERE 1=1';
            let params = [];

            if (kelas) { query += ' AND kelas = ?'; params.push(kelas); }
            if (role) { query += ' AND role = ?'; params.push(role); }
            if (search) {
                query += ' AND (nisn LIKE ? OR nama LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            query += ' ORDER BY role, kelas, nama';

            const [rows] = await db.query(query, params);
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get users error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil data user' });
        }
    },

    getUserById: async (req, res) => {
        try {
            const [rows] = await db.query(
                'SELECT id, nisn, nama, role, kelas, email, telepon, is_active, created_at FROM users WHERE id = ?',
                [req.params.id]
            );
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
            res.json({ success: true, data: rows[0] });
        } catch (err) {
            logger.error('Get user by id error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil data user' });
        }
    },

    createUser: async (req, res) => {
        try {
            const { nisn, nama, password, kelas, role = 'student', email, telepon } = req.body;
            const hashedPassword = await utils.hashPassword(password);
            const [result] = await db.query(
                'INSERT INTO users (nisn, nama, password, kelas, role, email, telepon) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [nisn, nama, hashedPassword, kelas, role, email || null, telepon || null]
            );
            res.json({ success: true, userId: result.insertId, message: 'User berhasil dibuat' });
        } catch (err) {
            logger.error('Create user error:', err);
            res.status(500).json({ success: false, message: 'Gagal membuat user' });
        }
    },

    updateUser: async (req, res) => {
        try {
            const { id } = req.params;
            const { nisn, nama, email, telepon, kelas, is_active, role } = req.body;
            await db.query(
                `UPDATE users SET nisn = ?, nama = ?, email = ?, telepon = ?, kelas = ?, is_active = ?, role = ? 
                 WHERE id = ?`,
                [nisn, nama, email, telepon, kelas, is_active, role, id]
            );
            res.json({ success: true, message: 'User berhasil diupdate' });
        } catch (err) {
            logger.error('Update user error:', err);
            res.status(500).json({ success: false, message: 'Gagal update user' });
        }
    },

    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;
            await db.query('DELETE FROM users WHERE id = ?', [id]);
            res.json({ success: true, message: 'User berhasil dihapus' });
        } catch (err) {
            logger.error('Delete user error:', err);
            res.status(500).json({ success: false, message: 'Gagal hapus user' });
        }
    },

    resetPassword: async (req, res) => {
        try {
            const { id } = req.params;
            const { password } = req.body;
            const hashedPassword = await utils.hashPassword(password);
            await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
            res.json({ success: true, message: 'Password berhasil direset' });
        } catch (err) {
            logger.error('Reset password error:', err);
            res.status(500).json({ success: false, message: 'Gagal reset password' });
        }
    },

    getLogs: async (req, res) => {
        try {
            const [rows] = await db.query(
                `SELECT l.*, u.nama as user_name 
                 FROM logs l 
                 LEFT JOIN users u ON l.user_id = u.id 
                 ORDER BY l.created_at DESC LIMIT 100`
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get logs error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil logs' });
        }
    },

    exportReport: async (req, res) => {
        try {
            const { kelas, tanggal, mapel_id, format } = req.query;

            let query = `
                SELECT a.*, u.nama, u.nisn, u.kelas, mp.nama as mapel 
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                LEFT JOIN qr_sessions qs ON a.session_id = qs.id
                LEFT JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                WHERE 1=1
            `;
            let params = [];

            if (kelas) { query += ' AND u.kelas = ?'; params.push(kelas); }
            if (tanggal) { query += ' AND a.tanggal = ?'; params.push(tanggal); }
            if (mapel_id) { query += ' AND (qs.mapel_id = ? OR a.status IN ("Izin", "Sakit"))'; params.push(mapel_id); }

            query += ' ORDER BY a.tanggal DESC, a.jam_absen DESC';
            const [rows] = await db.query(query, params);

            if (format === 'pdf') {
                const PDFDocument = require('pdfkit');
                const doc = new PDFDocument({ margin: 30, size: 'A4' });
                const filename = `Laporan-Absensi-${new Date().getTime()}.pdf`;

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
                doc.pipe(res);

                // PDF Header
                doc.fontSize(20).text('LAPORAN ABSENSI SISWA', { align: 'center' });
                doc.fontSize(12).text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
                doc.moveDown();

                // Table Header
                const tableTop = 150;
                doc.fontSize(10).font('Helvetica-Bold');
                doc.text('Nama', 30, tableTop);
                doc.text('NISN', 180, tableTop);
                doc.text('Kelas', 260, tableTop);
                doc.text('Mapel', 320, tableTop);
                doc.text('Tanggal', 420, tableTop);
                doc.text('Status', 500, tableTop);
                doc.moveDown();
                doc.lineCap('butt').moveTo(30, tableTop + 15).lineTo(560, tableTop + 15).stroke();

                // Table Rows
                let y = tableTop + 25;
                doc.font('Helvetica').fontSize(9);
                rows.forEach(row => {
                    if (y > 750) { doc.addPage(); y = 50; }
                    doc.text(row.nama, 30, y, { width: 140 });
                    doc.text(row.nisn, 180, y);
                    doc.text(row.kelas, 260, y);
                    doc.text(row.mapel || 'Izin/Sakit', 320, y, { width: 100 });
                    doc.text(row.tanggal ? row.tanggal.toISOString().split('T')[0] : '-', 420, y);
                    doc.text(row.status || 'Hadir', 500, y);
                    y += 20;
                });

                doc.end();
            } else {
                const ExcelJS = require('exceljs');
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Laporan Absensi');

                worksheet.columns = [
                    { header: 'Nama', key: 'nama', width: 30 },
                    { header: 'NISN', key: 'nisn', width: 15 },
                    { header: 'Kelas', key: 'kelas', width: 10 },
                    { header: 'Mata Pelajaran', key: 'mapel', width: 25 },
                    { header: 'Tanggal', key: 'tanggal', width: 15 },
                    { header: 'Jam Absen', key: 'jam_absen', width: 15 },
                    { header: 'Status', key: 'status', width: 15 }
                ];

                rows.forEach(row => {
                    worksheet.addRow({
                        nama: row.nama,
                        nisn: row.nisn,
                        kelas: row.kelas,
                        mapel: row.mapel || 'Izin/Sakit',
                        tanggal: row.tanggal ? row.tanggal.toISOString().split('T')[0] : '-',
                        jam_absen: row.jam_absen,
                        status: row.status || 'Hadir'
                    });
                });

                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename=laporan-absensi.xlsx');
                await workbook.xlsx.write(res);
                res.end();
            }
        } catch (err) {
            logger.error('Export error:', err);
            res.status(500).json({ success: false, message: 'Gagal export data' });
        }
    },

    getIzinRequests: async (req, res) => {
        try {
            const query = `
                SELECT a.*, u.nama, u.nisn, u.kelas 
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                WHERE a.status IN ('Izin', 'Sakit')
                ORDER BY a.tanggal DESC, a.jam_absen DESC
            `;
            const [rows] = await db.query(query);
            res.json({ success: true, data: rows });
        } catch (err) {
            logger.error('Get izin requests error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil data izin' });
        }
    },

    deleteIzin: async (req, res) => {
        try {
            const { id } = req.params;

            // Get the record first to find the lampiran path
            const [rows] = await db.query('SELECT lampiran FROM attendance WHERE id = ?', [id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Data izin tidak ditemukan' });
            }

            const lampiranPath = rows[0].lampiran;

            // Delete the file from filesystem if it exists
            if (lampiranPath) {
                const absolutePath = path.join(__dirname, '../public', lampiranPath);
                if (fs.existsSync(absolutePath)) {
                    fs.unlinkSync(absolutePath);
                    logger.info(`Deleted izin attachment: ${absolutePath}`);
                }
            }

            // Delete the record from database
            await db.query('DELETE FROM attendance WHERE id = ?', [id]);

            res.json({ success: true, message: 'Data izin dan lampiran berhasil dihapus' });
        } catch (err) {
            logger.error('Delete izin error:', err);
            res.status(500).json({ success: false, message: 'Gagal menghapus data izin' });
        }
    },

    updateIzinStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body; // 1 for Approved, -1 for Rejected

            if (![1, -1].includes(parseInt(status))) {
                return res.status(400).json({ success: false, message: 'Status tidak valid' });
            }

            const [result] = await db.query(
                'UPDATE attendance SET is_approved = ? WHERE id = ? AND status IN ("Izin", "Sakit")',
                [status, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Data izin tidak ditemukan' });
            }

            // Notify the student via socket
            const io = req.app.get('io');
            if (io) {
                // We need the user_id for this record
                const [rows] = await db.query('SELECT user_id FROM attendance WHERE id = ?', [id]);
                if (rows.length > 0) {
                    io.to(`user_${rows[0].user_id}`).emit('izin-status-updated', {
                        id,
                        status: parseInt(status)
                    });
                }
            }

            res.json({
                success: true,
                message: status === 1 ? 'Permohonan izin disetujui' : 'Permohonan izin ditolak'
            });
        } catch (err) {
            logger.error('Update izin status error:', err);
            res.status(500).json({ success: false, message: 'Gagal update status izin' });
        }
    },

    getDashboardStats: async (req, res) => {
        try {
            const now = new Date();
            const offset = now.getTimezoneOffset() * 60000;
            const localDateObj = new Date(now.getTime() - offset);
            const today = localDateObj.toISOString().split('T')[0];

            // Total Students
            const [totalStudents] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'student'");

            // Present Today
            const [presentToday] = await db.query("SELECT COUNT(DISTINCT user_id) as count FROM attendance WHERE tanggal = ? AND status = 'Hadir'", [today]);

            // Izin/Sakit Today
            const [izinToday] = await db.query("SELECT COUNT(DISTINCT user_id) as count FROM attendance WHERE tanggal = ? AND status IN ('Izin', 'Sakit')", [today]);

            // Check if there are any sessions today first
            const [totalSessionsToday] = await db.query("SELECT COUNT(*) as count FROM qr_sessions WHERE tanggal = ?", [today]);

            let alphaTodayValue = 0;
            if (totalSessionsToday[0].count > 0) {
                // Alpha Today - Students with NO attendance record today (not present, izin, or sakit)
                const [alphaResult] = await db.query(`
                    SELECT COUNT(*) as count FROM users 
                    WHERE role = 'student' 
                    AND id NOT IN (
                        SELECT DISTINCT user_id FROM attendance WHERE tanggal = ?
                    )
                `, [today]);
                alphaTodayValue = alphaResult[0].count;
            }

            // Latest Attendance (Live Feed)
            const [liveFeed] = await db.query(`
                SELECT a.*, u.nama, u.kelas, mp.nama as mapel 
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                LEFT JOIN qr_sessions qs ON a.session_id = qs.id
                LEFT JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                WHERE a.tanggal = ?
                ORDER BY a.jam_absen DESC LIMIT 10
            `, [today]);

            res.json({
                success: true,
                data: {
                    totalStudents: totalStudents[0].count,
                    presentToday: presentToday[0].count,
                    izinToday: izinToday[0].count,
                    alphaToday: alphaTodayValue,
                    liveFeed: liveFeed
                }
            });
        } catch (err) {
            logger.error('Get admin stats error:', err);
            res.status(500).json({ success: false, message: 'Gagal mengambil statistik dashboard' });
        }
    },

    resetDeviceLock: async (req, res) => {
        try {
            const userId = req.params.id;

            // Reset device_id dan login_attempts
            await db.query(
                'UPDATE users SET device_id = NULL, login_attempts = 0, last_login_attempt = NULL WHERE id = ?',
                [userId]
            );

            logger.info(`Device lock reset for user ${userId} by admin ${req.user.id}`);

            res.json({
                success: true,
                message: 'Device lock berhasil di-reset. User bisa login dari perangkat baru.'
            });
        } catch (err) {
            logger.error('Reset device lock error:', err);
            res.status(500).json({ success: false, message: 'Gagal reset device lock' });
        }
    }
};

module.exports = adminController;