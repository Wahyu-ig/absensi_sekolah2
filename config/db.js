const mysql = require('mysql2/promise');
const logger = require('./logger');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'school_attendance_plus',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

async function initializeDatabase() {
    try {
        const connection = await db.getConnection();
        connection.release();
        logger.info('✅ Database connected to: ' + (process.env.DB_NAME || 'school_attendance_plus'));
    } catch (err) {
        logger.error('❌ Database connection error:', err);
        process.exit(1);
    }
}

module.exports = {
    db,
    initializeDatabase
};
