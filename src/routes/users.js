const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Add a quick logger for user routes
router.use((req, res, next) => {
  console.log(`\n[USERS] 👤 ${req.method} request to /api/users${req.url}`);
  next();
});

// All user routes require authentication
router.use(authenticateToken);

// @route   GET /api/users/online
// @desc    Get all currently online users
router.get('/online', async (req, res) => {
  try {
    // Search the database for users marked as online.
    // We use .select('-password') to ensure we NEVER send passwords to the frontend!
    const onlineUsers = await User.find({ isOnline: true }).select('-password');
    
    console.log(`[USERS] Found ${onlineUsers.length} online users.`);
    res.json(onlineUsers);
    
  } catch (error) {
    console.error('[USERS] 🚨 Error fetching online users:', error);
    res.status(500).json({ error: 'Server error while fetching online users' });
  }
});

module.exports = router;