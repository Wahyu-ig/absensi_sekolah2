const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectSchema() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'school_attendance_plus'
        });

        const tables = ['users', 'qr_sessions', 'attendance', 'mata_pelajaran'];

        for (const table of tables) {
            try {
                const [columns] = await connection.query(`DESCRIBE ${table}`);
                console.log(`\nTable: ${table}`);
                console.table(columns.map(c => ({ Field: c.Field, Type: c.Type })));
            } catch (e) {
                console.log(`\nTable: ${table} - NOT FOUND`);
            }
        }

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

inspectSchema();
