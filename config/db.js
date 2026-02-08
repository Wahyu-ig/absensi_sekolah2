const mysql = require('mysql2/promise');

// Railway menyediakan DATABASE_URL secara otomatis di Environment Variables
const dbConfig = process.env.DATABASE_URL || {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT
};

const pool = mysql.createPool(dbConfig);

async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Berhasil terhubung ke Database MySQL Railway');
        connection.release();
    } catch (err) {
        console.error('❌ Gagal koneksi database:', err.message);
        throw err;
    }
}

module.exports = { pool, initializeDatabase };
