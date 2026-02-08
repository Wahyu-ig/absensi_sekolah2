const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'school_attendance'
        });

        console.log('--- USERS (Teachers) ---');
        const [users] = await db.query('SELECT id, nama, role, nisn FROM users WHERE role="teacher"');
        console.table(users);

        console.log('\n--- TEACHERS TABLE ---');
        const [teachers] = await db.query('SELECT * FROM teachers');
        console.table(teachers);

        console.log('\n--- QR SESSIONS (Samples) ---');
        const [sessions] = await db.query(`
            SELECT qs.id, qs.teacher_id, qs.created_by, mp.nama as mapel, qs.kelas 
            FROM qr_sessions qs 
            JOIN mata_pelajaran mp ON qs.mapel_id = mp.id 
            LIMIT 5
        `);
        console.table(sessions);

        await db.end();
    } catch (err) {
        console.error('Error:', err);
    }
}
check();
