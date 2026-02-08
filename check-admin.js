const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkAdmin() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'school_attendance_plus'
        });

        const [rows] = await connection.query('SELECT nisn, nama, role FROM users WHERE nisn = "000000"');
        console.table(rows);
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}

checkAdmin();
