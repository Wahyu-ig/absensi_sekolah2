require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const compression = require('compression');
const cron = require('node-cron');
const { initializeDatabase } = require('./config/db');
const logger = require('./config/logger');
const attendanceController = require('./controllers/attendanceController');

const app = express();
app.set('trust proxy', 1); // Tambahkan baris ini!
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.set('io', io);

app.use(compression());
app.use(cors({
    origin: "*",
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const adminRoutes = require('./routes/admin');
const commonRoutes = require('./routes/common');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/common', commonRoutes);

io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('join-user', (userId) => socket.join(`user_${userId}`));
    socket.on('join-admin', () => socket.join('admin-room'));
    socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.id}`));
});

cron.schedule('0 17 * * *', async () => {
    logger.info('⏰ Running scheduled Auto-Alpha task...');
    try {
        const result = await attendanceController.generateAutoAlphaCore();
        logger.info(`✅ Auto-Alpha finalized: ${result.message}`);
    } catch (err) {
        logger.error('❌ Scheduled Auto-Alpha failed:', err);
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// FUNGSI START SERVER YANG SUDAH DIPERBAIKI UNTUK RAILWAY
async function start() {
    try {
        await initializeDatabase();
        // Railway wajib menggunakan process.env.PORT
        const PORT = process.env.PORT || 7000;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Gagal menjalankan server:', err);
        process.exit(1);
    }
}

start();

module.exports = app;

