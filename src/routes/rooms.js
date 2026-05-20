const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const { authenticateToken } = require('../middleware/auth');

// Add a quick logger for room routes to help with debugging!
router.use((req, res, next) => {
  console.log(`\n[ROOMS] 🚪 ${req.method} request to /api/rooms${req.url}`);
  next();
});

// All room routes require authentication
router.use(authenticateToken);

// @route   POST /api/rooms
// @desc    Create a new audio room
router.post('/', roomController.createRoom);

// @route   GET /api/rooms
// @desc    Get all active audio rooms
router.get('/', roomController.getActiveRooms);

// @route   GET /api/rooms/:id
// @desc    Get specific room details
router.get('/:id', roomController.getRoomById);

// @route   PUT /api/rooms/:id/end
// @desc    End an active room (Host only)
router.put('/:id/end', roomController.endRoom);

module.exports = router;