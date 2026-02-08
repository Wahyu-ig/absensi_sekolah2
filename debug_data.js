
const { db } = require('./config/db');

async function debugData() {
    try {
        console.log("=== CHECKING USERS ===");
        const [users] = await db.query("SELECT id, nama, kelas, role FROM users WHERE role='student' LIMIT 5");
        console.log(JSON.stringify(users, null, 2));

        console.log("\n=== CHECKING SESSIONS ===");
        const [sessions] = await db.query("SELECT id, mapel_id, kelas, tanggal, jam_mulai, jam_selesai, aktif FROM qr_sessions ORDER BY id DESC LIMIT 5");
        console.log(JSON.stringify(sessions, null, 2));


        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugData();
