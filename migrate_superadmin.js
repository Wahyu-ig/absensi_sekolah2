const { db } = require('./config/db');
const bcrypt = require('bcryptjs');

async function migrate() {
    try {
        console.log('Starting migration to adding superadmin role...');

        // 1. Update ENUM role
        try {
            await db.query(`
                ALTER TABLE users 
                MODIFY COLUMN role ENUM('student', 'teacher', 'admin', 'superadmin') DEFAULT 'student'
            `);
            console.log('✅ Column role updated successfully');
        } catch (e) {
            console.log('⚠️ Warning updating role column (might already exist):', e.message);
        }

        // 2. Insert Superadmin user
        const hashedPassword = await bcrypt.hash('admin123', 10);

        // Check if exists
        const [existing] = await db.query('SELECT id FROM users WHERE nisn = ?', ['000000']);

        if (existing.length > 0) {
            // Update role to superadmin if exists
            await db.query('UPDATE users SET role = "superadmin" WHERE nisn = ?', ['000000']);
            console.log('✅ Existing admin updated to superadmin');
        } else {
            // Insert new
            await db.query(`
                INSERT INTO users (nisn, nama, password, role, email, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
            `, ['000000', 'Super Admin', hashedPassword, 'superadmin', 'superadmin@sekolah.com', 1]);
            console.log('✅ Superadmin created successfully');
        }

        console.log('Migration complete!');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
