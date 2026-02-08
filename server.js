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
const server = http.createServer(app);


const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.set('io', io);
const PORT = process.env.PORT || 3000;


app.use(compression());


app.use(cors({
    origin: "*",
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
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

// Socket.io Handlers
io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('join-user', (userId) => socket.join(`user_${userId}`));
    socket.on('join-admin', () => socket.join('admin-room'));
    socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.id}`));
});

// Automated Cron Jobs
cron.schedule('0 17 * * *', async () => {
    logger.info('⏰ Running scheduled Auto-Alpha task...');
    try {
        const result = await attendanceController.generateAutoAlphaCore();
        logger.info(`✅ Auto-Alpha finalized: ${result.message}`);
    } catch (err) {
        logger.error('❌ Scheduled Auto-Alpha failed:', err);
    }
});

// Serve frontend routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error Handling
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// Start Server - Mengikat ke 0.0.0.0 agar bisa diakses via IP Laptop
async function start() {
    await initializeDatabase();
    server.listen(PORT, '0.0.0.0', () => {
        logger.info(`🚀 Server running on port ${PORT}`);
        logger.info(`📡 Akses dari Android gunakan: http://192.168.1.192:${PORT}`);
    });
}

start();

module.exports = app;