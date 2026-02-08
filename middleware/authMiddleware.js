const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ message: 'No token provided' });
    }

    // Bearer token format
    const tokenString = token.split(' ')[1];

    if (!tokenString) {
        return res.status(403).json({ message: 'Invalid token format' });
    }

    jwt.verify(tokenString, process.env.JWT_SECRET || 'rahasia_negara_api_key', (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    });
};

module.exports = verifyToken;
