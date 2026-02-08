
const { db } = require('./config/db');

async function checkQR() {
    const qr = 'QR_1770571836211_FV3TBX5PV';
    try {
        console.log(`Checking QR: ${qr}`);

        // 1. Check raw session
        const [raw] = await db.query('SELECT * FROM qr_sessions WHERE kode_qr = ?', [qr]);

        if (raw.length > 0) {
            console.log('Raw Session:', JSON.stringify(raw[0], null, 2));

            // 2. Check Mapel relation
            const mapelId = raw[0].mapel_id;
            const [mapel] = await db.query('SELECT * FROM mata_pelajaran WHERE id = ?', [mapelId]);
            console.log('Mapel:', JSON.stringify(mapel[0], null, 2));

            // 3. Test Join query used in controller
            const [join] = await db.query(
                `SELECT qs.*, mp.nama as mapel_nama 
                 FROM qr_sessions qs
                 JOIN mata_pelajaran mp ON qs.mapel_id = mp.id
                 WHERE qs.kode_qr = ?`,
                [qr]
            );
            console.log('Join Query Result:', JSON.stringify(join, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQR();
