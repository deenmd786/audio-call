const AudioRoom = require('../models/AudioRoom');

// Create a new audio room
exports.createRoom = async (req, res) => {
  try {
    const { title, durationMinutes } = req.body;
    const hostId = req.user._id;

    if (!title) {
      return res.status(400).json({ error: 'Room title is required' });
    }

    // Default to 60 minutes if not provided
    const mins = durationMinutes || 60;
    const expiresAt = new Date(Date.now() + mins * 60 * 1000);

    const room = new AudioRoom({
      title,
      hostId,
      expiresAt, // Save the expiration time
      speakers: [{ userId: hostId, isMuted: false }] 
    });

    await room.save();
    await room.populate('hostId', 'username avatarUrl');

    res.status(201).json(room);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
};

// Get all currently active rooms
exports.getActiveRooms = async (req, res) => {
  try {
    // FIX: Only fetch rooms where `expiresAt` is in the future!
    const rooms = await AudioRoom.find({ 
      isActive: true,
      $or: [
        { expiresAt: { $gt: new Date() } },
        { expiresAt: { $exists: false } } // Fallback for old rooms
      ]
    })
      .populate('hostId', 'username avatarUrl')
      .populate('speakers.userId', 'username avatarUrl')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch active rooms' });
  }
};

// Get specific room details
exports.getRoomById = async (req, res) => {
  try {
    const room = await AudioRoom.findById(req.params.id)
      .populate('hostId', 'username avatarUrl')
      .populate('speakers.userId', 'username avatarUrl isOnline')
      .populate('listeners.userId', 'username avatarUrl isOnline');

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: 'Failed to fetch room details' });
  }
};

// End a room (Host only)
exports.endRoom = async (req, res) => {
  try {
    const room = await AudioRoom.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Verify the user requesting the end is the host
    if (room.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the host can end the room' });
    }

    room.isActive = false;
    room.endedAt = new Date();
    await room.save();

    // Emit socket event via the attached io instance
    const io = req.app.get('io');
    if (io) {
      io.to(room._id.toString()).emit('room-closed');
      io.socketsLeave(room._id.toString());
    }

    res.json({ message: 'Room ended successfully', room });
  } catch (error) {
    console.error('Error ending room:', error);
    res.status(500).json({ error: 'Failed to end room' });
  }
};