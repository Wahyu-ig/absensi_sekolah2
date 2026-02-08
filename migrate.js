const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'school_attendance_plus'
        });

        const commands = [
            'ALTER TABLE attendance ADD COLUMN status ENUM("hadir", "terlambat", "izin", "sakit", "alfa") DEFAULT "hadir" AFTER jam_absen',
            'ALTER TABLE attendance ADD COLUMN keterangan TEXT AFTER status',
            'ALTER TABLE attendance ADD COLUMN latitude DECIMAL(10,8) AFTER keterangan',
            'ALTER TABLE attendance ADD COLUMN longitude DECIMAL(11,8) AFTER latitude',
            'ALTER TABLE attendance ADD COLUMN ip_address VARCHAR(45) AFTER longitude',
            'ALTER TABLE attendance ADD COLUMN lampiran VARCHAR(255) AFTER keterangan',
            'ALTER TABLE attendance MODIFY COLUMN session_id INT(11) NULL',
            'ALTER TABLE attendance ADD COLUMN is_approved TINYINT DEFAULT 0 AFTER status',
            'ALTER TABLE users ADD COLUMN device_id VARCHAR(255) AFTER role'
        ];

        for (const cmd of commands) {
            try {
                await connection.query(cmd);
                console.log(`✅ Success: ${cmd}`);
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') {
                    console.log(`ℹ️ Column already exists for: ${cmd.split(' ')[5]}`);
                } else {
                    console.error(`❌ Error executing: ${cmd}`, e.message);
                }
            }
        }

        await connection.end();
        console.log('Migration completed.');
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
