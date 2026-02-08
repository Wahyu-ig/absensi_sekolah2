
function checkSession(session, nowStr) {
    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];
    const now = nowStr; // "HH:MM:SS"

    const isMatch = (
        // Normal
        (session.tanggal === today && session.jam_mulai <= session.jam_selesai && session.jam_mulai <= now && session.jam_selesai >= now) ||
        // Overnight starts today
        (session.tanggal === today && session.jam_mulai > session.jam_selesai && session.jam_mulai <= now) ||
        // Overnight starts yesterday
        (session.tanggal === yesterday && session.jam_mulai > session.jam_selesai && session.jam_selesai >= now)
    );

    return isMatch;
}

// Test case: Session yesterday 23:00 to 02:00
// Current time: 00:20 (next day)
const session = {
    tanggal: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0], // Yesterday
    jam_mulai: "23:00:00",
    jam_selesai: "02:00:00"
};

const now = "00:20:00";
console.log(`Checking session ${session.tanggal} ${session.jam_mulai}-${session.jam_selesai} at ${now}`);
console.log("Match:", checkSession(session, now));

// Test case: Session today 00:05 to 02:00
// Current time: 00:20
const session2 = {
    tanggal: new Date().toISOString().split('T')[0], // Today
    jam_mulai: "00:05:00",
    jam_selesai: "02:00:00"
};
console.log(`Checking session ${session2.tanggal} ${session2.jam_mulai}-${session2.jam_selesai} at ${now}`);
console.log("Match:", checkSession(session2, now));
