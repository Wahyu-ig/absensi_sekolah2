const mysql = require('mysql2/promise');

const pool = mysql.createPool(process.env.DATABASE_URL || {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT
});

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

// Kita export 'db' supaya cocok dengan controller kamu yang lama
module.exports = { db: pool, pool, initializeDatabase };
