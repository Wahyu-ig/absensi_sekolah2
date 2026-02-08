
const fs = require('fs');
const { db } = require('./config/db');

async function debugTeacherSession() {
    try {
        let output = "=== LAST 5 SESSIONS ===\n";
        const [sessions] = await db.query(
            `SELECT qs.id, qs.kelas, qs.jam_mulai, qs.jam_selesai, qs.tanggal, qs.aktif, u.nama as creator
             FROM qr_sessions qs
             LEFT JOIN users u ON qs.created_by = u.id
             ORDER BY qs.id DESC LIMIT 5`
        );
        sessions.forEach(s => {
            output += JSON.stringify(s) + "\n";
        });

        output += "\n=== SIMULATING ACTIVE SESSION QUERY ===\n";
        const today = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];
        const now = new Date().toTimeString().slice(0, 8); // "HH:MM:SS"

        output += `Params: Today=${today}, Yesterday=${yesterday}, Now=${now}\n`;

        const query = `
            SELECT qs.id, qs.kelas, qs.mapel_id, qs.aktif 
            FROM qr_sessions qs 
            WHERE qs.aktif = TRUE AND (
                (qs.tanggal = '${today}' AND qs.jam_mulai <= qs.jam_selesai AND qs.jam_mulai <= '${now}' AND qs.jam_selesai >= '${now}')
                OR
                (qs.tanggal = '${today}' AND qs.jam_mulai > qs.jam_selesai AND qs.jam_mulai <= '${now}')
                OR
                (qs.tanggal = '${yesterday}' AND qs.jam_mulai > qs.jam_selesai AND qs.jam_selesai >= '${now}')
            )
        `;
        output += query + "\n";

        const [active] = await db.query(query);
        output += "Active Sessions found by Query: " + JSON.stringify(active, null, 2);

        fs.writeFileSync('debug_output.txt', output);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugTeacherSession();
