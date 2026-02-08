
function validateTime(jam_mulai, jam_selesai) {
    if (!jam_mulai || !jam_selesai) {
        return "Empty inputs";
    }

    const timeStart = jam_mulai.split(':').map(Number);
    const timeEnd = jam_selesai.split(':').map(Number);

    // Check for NaN
    if (timeStart.some(isNaN) || timeEnd.some(isNaN)) {
        return "NaN detected";
    }

    const minutesStart = timeStart[0] * 60 + timeStart[1];
    const minutesEnd = timeEnd[0] * 60 + timeEnd[1];

    console.log(`Input: ${jam_mulai} -> ${jam_selesai}`);
    console.log(`Minutes: ${minutesStart} -> ${minutesEnd}`);
    console.log(`Correction: Start ${minutesStart} < End ${minutesEnd} ? ${minutesStart < minutesEnd}`);

    if (minutesStart >= minutesEnd) {
        return 'Jam mulai harus sebelum jam selesai!';
    }
    return "OK";
}

const testCases = [
    ["08:00", "09:00"], // Normal
    ["09:00", "08:00"], // End before start
    ["08:00", "08:00"], // Same time
    ["23:00", "00:00"], // Over midnight
    ["12:00", "13:00"], // Noon
    ["00:00", "01:00"], // Morning
    ["13:00", "12:00"], // Afternoon wrong
    ["", ""]
];

testCases.forEach(tc => {
    console.log(`Testing ${tc[0]} - ${tc[1]}: ${validateTime(tc[0], tc[1])}`);
    console.log('---');
});
