const { db } = require('../config/db');
const logger = require('../config/logger');

const attendanceController = {



    generateAutoAlphaCore: async () => {
        try {
            const now = new Date();
            const offset = now.getTimezoneOffset() * 60000;
            const localDateObj = new Date(now.getTime() - offset);
            const today = localDateObj.toISOString().split('T')[0];


            const [students] = await db.query("SELECT id, nisn, nama, email, kelas FROM users WHERE role = 'student' AND is_active = 1");


            const [attendedToday] = await db.query(
                "SELECT DISTINCT user_id FROM attendance WHERE tanggal = ?",
                [today]
            );
            const attendedIds = attendedToday.map(a => a.user_id);


            const alphaStudents = students.filter(s => !attendedIds.includes(s.id));

            if (alphaStudents.length === 0) {
                return { success: true, count: 0, message: 'Tidak ada siswa yang perlu ditandai Alpha hari ini.' };
            }


            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                for (const student of alphaStudents) {
                    await connection.query(
                        "INSERT INTO attendance (user_id, session_id, tanggal, jam_absen, status, keterangan) VALUES (?, ?, ?, ?, ?, ?)",
                        [student.id, null, today, '17:00:00', 'Alfa', 'Sistem: Otomatis Alpha']
                    );


                    logger.info(`Auto-Alpha record created for ${student.nama}`);
                }

                await connection.commit();
                return { success: true, count: alphaStudents.length, message: `Berhasil mencatat ${alphaStudents.length} siswa sebagai Alpha.` };
            } catch (err) {
                await connection.rollback();
                throw err;
            } finally {
                connection.release();
            }
        } catch (err) {
            logger.error('Core auto-alpha error:', err);
            throw err;
        }
    },

    /**
     * API Handler for manual trigger
     */
    generateAutoAlpha: async (req, res) => {
        try {
            const result = await attendanceController.generateAutoAlphaCore();
            res.json(result);
        } catch (err) {
            res.status(500).json({ success: false, message: 'Gagal menjalankan auto-alpha' });
        }
    }
};

module.exports = attendanceController;
