const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkData() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'school_attendance_plus'
        });

        console.log('Connected to DB:', process.env.DB_NAME || 'school_attendance_plus');

        // Check Users/Classes
        const [users] = await connection.query('SELECT role, kelas, COUNT(*) as count FROM users GROUP BY role, kelas');
        console.log('\nUsers Summary:');
        console.table(users);

        // Check Mapel
        const [mapel] = await connection.query('SELECT kode, nama FROM mata_pelajaran');
        console.log('\nMata Pelajaran:', mapel.length);
        if (mapel.length > 0) console.table(mapel.slice(0, 5)); // Show first 5

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkData();
