const jwt = require('jsonwebtoken'); // Moved to top for performance
const { setupSignalingHandlers } = require('./signalingHandler');
const { setupRoomHandlers } = require('./roomHandler');
const User = require('../models/User');
const AudioRoom = require('../models/AudioRoom'); // Needed for cleanup

// Store socket ID to user ID mapping
const socketToUser = new Map();
const userToSockets = new Map();

const setupSocketHandlers = (io) => {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.id})`);
    
    // FIX: Convert ObjectId to string for Map keys
    const userIdStr = socket.user._id.toString();
    
    // Store mapping
    socketToUser.set(socket.id, userIdStr);
    
    if (!userToSockets.has(userIdStr)) {
      userToSockets.set(userIdStr, new Set());
    }
    userToSockets.get(userIdStr).add(socket.id);
    
    // Update user online status
    User.findByIdAndUpdate(socket.user._id, { isOnline: true, lastSeen: new Date() })
      .catch(err => console.error('Error updating user status:', err));
    
    // Setup handlers
    setupSignalingHandlers(io, socket, socketToUser);
    setupRoomHandlers(io, socket, socketToUser, userToSockets);
    
    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.user.username} (${socket.id})`);
      
      // Remove from mappings
      socketToUser.delete(socket.id);
      const userSockets = userToSockets.get(userIdStr);
      
      if (userSockets) {
        userSockets.delete(socket.id);
        
        // If this was their completely last open tab/device
        if (userSockets.size === 0) {
          userToSockets.delete(userIdStr);
          await User.findByIdAndUpdate(socket.user._id, { isOnline: false, lastSeen: new Date() });
          
          // FIX: Clean up ghost users from any active rooms
          try {
            const activeRooms = await AudioRoom.find({
              isActive: true,
              $or: [
                { 'speakers.userId': socket.user._id },
                { 'listeners.userId': socket.user._id }
              ]
            });

            for (const room of activeRooms) {
              await room.removeParticipant(socket.user._id);
              // Notify the room that the user disconnected abruptly
              io.to(room._id.toString()).emit('user-left', { userId: socket.user._id });
            }
          } catch (error) {
            console.error('Error cleaning up user from rooms on disconnect:', error);
          }
        }
      }
    });
  });
};

module.exports = { setupSocketHandlers };