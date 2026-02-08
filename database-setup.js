const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupDatabase() {
    try {
        console.log('🔌 Menghubungkan ke MySQL...');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        // Baca dari .env atau pakai default
        const dbName = process.env.DB_NAME || 'school_attendance_plus';
        console.log(`📁 Menggunakan database: ${dbName}`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.query(`USE \`${dbName}\``);

        // Buat tabel mata_pelajaran jika belum ada
        console.log('📚 Membuat tabel mata_pelajaran...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mata_pelajaran (
                id INT AUTO_INCREMENT PRIMARY KEY,
                school_id INT DEFAULT 1,
                kode VARCHAR(10) NOT NULL UNIQUE,
                nama VARCHAR(100) NOT NULL,
                deskripsi TEXT,
                warna VARCHAR(7) DEFAULT '#3498db',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Insert Super Admin
        const adminNisn = '000000';
        const adminPassword = await bcrypt.hash('admin123', 10);

        const [admins] = await connection.query('SELECT * FROM users WHERE nisn = ?', [adminNisn]);
        if (admins.length === 0) {
            console.log('👤 Menambahkan Super Admin...');
            await connection.query(
                'INSERT INTO users (nisn, nama, password, role, created_at) VALUES (?, ?, ?, ?, NOW())',
                [adminNisn, 'Super Admin', adminPassword, 'super_admin']
            );
        } else {
            console.log('✅ Super Admin sudah ada.');
        }

        // Insert Mata Pelajaran (16 Mapel SMA Plus)
        console.log('📚 Menyimpan 16 mata pelajaran...');
        const subjects = [
            { kode: 'MTK-W', nama: 'Matematika Wajib' },
            { kode: 'MTK-TL', nama: 'Matematika TL' },
            { kode: 'BIND-W', nama: 'Bahasa Indonesia Wajib' },
            { kode: 'BIND-TL', nama: 'Bahasa Indonesia TL' },
            { kode: 'BING-W', nama: 'Bahasa Inggris Wajib' },
            { kode: 'BING-TL', nama: 'Bahasa Inggris TL' },
            { kode: 'FIS', nama: 'Fisika' },
            { kode: 'KIM', nama: 'Kimia' },
            { kode: 'BIO', nama: 'Biologi' },
            { kode: 'SEJ', nama: 'Sejarah Indonesia' },
            { kode: 'GEO', nama: 'Geografi' },
            { kode: 'EKO', nama: 'Ekonomi' },
            { kode: 'SOS', nama: 'Sosiologi' },
            { kode: 'AGM', nama: 'Pendidikan Agama' },
            { kode: 'PPKn', nama: 'PPKn' },
            { kode: 'SB', nama: 'Seni Budaya' }
        ];

        for (const sub of subjects) {
            await connection.query(
                'INSERT IGNORE INTO mata_pelajaran (school_id, kode, nama) VALUES (1, ?, ?)',
                [sub.kode, sub.nama]
            );
        }

        // Insert Siswa Contoh
        console.log('🧑‍🎓 Menambahkan siswa contoh...');
        const studentPassword = adminPassword;

        const students = [
            { nisn: '10001', nama: 'Ahmad Fauzi', kelas: '10.1' },
            { nisn: '10002', nama: 'Budi Santoso', kelas: '10.2' },
            { nisn: '10003', nama: 'Citra Lestari', kelas: '11.1' }
        ];

        for (const s of students) {
            const [exists] = await connection.query('SELECT id FROM users WHERE nisn = ?', [s.nisn]);
            if (exists.length === 0) {
                await connection.query(
                    'INSERT INTO users (nisn, nama, password, role, created_at) VALUES (?, ?, ?, ?, NOW())',
                    [s.nisn, s.nama, studentPassword, 'student']
                );
            }
        }

        console.log('✅ Setup database selesai!');
        console.log('🔑 Login Admin: NISN = 000000, Password = admin123');
        console.log('🔑 Login Siswa: NISN = 10001, Password = admin123');

        process.exit(0);
    } catch (error) {
        console.error('❌ Gagal setup database:', error);
        process.exit(1);
    }
}

setupDatabase();