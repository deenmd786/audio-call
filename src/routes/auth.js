const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  console.log(`\n[AUTH] 📥 New registration attempt received`);
  
  try {
    const { username, email, password } = req.body;
    console.log(`[AUTH] Data received -> Email: ${email}, Username: ${username}`);

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      console.log(`[AUTH] ❌ Registration failed: Username or email already exists`);
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const user = new User({ username, email, password });
    await user.save();

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log(`[AUTH] ✅ Registration successful for: ${username}`);

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    console.error('[AUTH] 🚨 Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
  console.log(`\n[AUTH] 📥 New login attempt received`);
  
  try {
    const { email, password } = req.body;
    console.log(`[AUTH] Checking credentials for email: ${email}`);

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[AUTH] ❌ Login failed: User not found with this email`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password using the schema method you created
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log(`[AUTH] ❌ Login failed: Incorrect password for ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log(`[AUTH] ✅ Login successful for user: ${user.username}`);

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    console.error('[AUTH] 🚨 Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
router.get('/me', authenticateToken, (req, res) => {
  console.log(`\n[AUTH] 🔍 Token verified automatically for user: ${req.user.username}`);
  // req.user is already fetched by the authenticateToken middleware
  res.json(req.user);
});

module.exports = router;