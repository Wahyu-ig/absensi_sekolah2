const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function fix() {
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'school_attendance_plus'
        });

        const [teachersInUsers] = await db.query('SELECT id, nama, nisn FROM users WHERE role="teacher"');
        console.log(`Found ${teachersInUsers.length} teachers in users table.`);

        for (const t of teachersInUsers) {
            const [existing] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [t.id]);
            if (existing.length === 0) {
                console.log(`Inserting ${t.nama} (ID: ${t.id}) into teachers table...`);
                await db.query('INSERT INTO teachers (user_id, nip) VALUES (?, ?)', [t.id, t.nisn]);
            } else {
                console.log(`${t.nama} already exists in teachers table.`);
            }
        }

        console.log('Update COMPLETE.');
        await db.end();
    } catch (err) {
        console.error('Error:', err);
    }
}
fix();
