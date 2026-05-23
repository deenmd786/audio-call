const AudioRoom = require('../models/AudioRoom');

// Helper to get all socket IDs for a user
const getUserSockets = (userId, userToSockets) => {
  const sockets = userToSockets.get(userId);
  return sockets ? Array.from(sockets) : [];
};

// Helper to generate perfectly formatted room state for the Flutter app
const getRoomState = (room, socket) => {
  return {
    roomId: room._id,
    title: room.title,
    hostId: room.hostId,
    expiresAt: room.expiresAt, // Added expiresAt so Flutter knows when time is up
    speakers: room.speakers.map(s => ({ userId: s.userId, isMuted: s.isMuted })),
    listeners: room.listeners.map(l => ({ userId: l.userId, handRaised: l.handRaised })),
    currentUserRole: room.hostId.equals(socket.user._id) ? 'host' : 
                   room.speakers.some(s => s.userId.equals(socket.user._id)) ? 'speaker' : 'listener'
  };
};

const setupRoomHandlers = (io, socket, socketToUser, userToSockets) => {
  
  // Join audio room
  socket.on('join-room', async ({ roomId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (!room || !room.isActive) {
        socket.emit('join-room-response', { success: false, error: 'Room not found or inactive' });
        return;
      }
      
      // INDUSTRY STANDARD FIX: Everyone joins the audience first. 
      // If the host rejoins, they must use "Jump to Stage" to re-activate WebRTC.
      if (!room.speakers.some(s => s.userId.equals(socket.user._id))) {
        await room.addListener(socket.user._id);
      }
      
      socket.join(roomId);
      
      const roomState = getRoomState(room, socket);
      
      socket.to(roomId).emit('user-joined', {
        userId: socket.user._id,
        username: socket.user.username,
        role: 'listener' // Tell everyone else this person joined the audience
      });
      
      socket.emit('join-room-response', { success: true, roomState });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('join-room-response', { success: false, error: 'Failed to join room' });
    }
  });

  // BULLETPROOF SYNC: Allows Flutter to request the exact room state at any time
  socket.on('request-room-sync', async ({ roomId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive) {
        socket.emit('room-sync-response', { success: true, roomState: getRoomState(room, socket) });
      }
    } catch (error) {
      console.error('Error syncing room:', error);
    }
  });

  // EXTEND TIME: Adds 30 minutes to the room
  socket.on('extend-room', async ({ roomId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive && room.hostId.equals(socket.user._id)) {
        room.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // Add 30 mins
        await room.save();
        io.to(roomId).emit('room-extended', { expiresAt: room.expiresAt });
      }
    } catch (error) {
      console.error('Error extending room:', error);
    }
  });
  
  // Leave room
  socket.on('leave-room', async ({ roomId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive) {
        await room.removeParticipant(socket.user._id);
        socket.leave(roomId);
        socket.to(roomId).emit('user-left', { userId: socket.user._id });
      }
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  });
  
  // Raise hand
  socket.on('raise-hand', async ({ roomId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive) {
        const raised = await room.raiseHand(socket.user._id);
        if (raised) {
          io.to(roomId).emit('hand-raised', {
            userId: socket.user._id,
            username: socket.user.username
          });
        }
      }
    } catch (error) {
      console.error('Error raising hand:', error);
    }
  });
  
  // Approve speaker (host only)
  socket.on('approve-speaker', async ({ roomId, userId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive && room.hostId.equals(socket.user._id)) {
        const approved = await room.approveSpeaker(userId);
        if (approved) {
          io.to(roomId).emit('speaker-approved', { userId });
          
          const otherSpeakers = room.speakers.filter(s => !s.userId.equals(userId));
          io.to(roomId).emit('new-speaker-joined', { userId });
          
          const newSpeakerSockets = getUserSockets(userId, userToSockets);
          newSpeakerSockets.forEach(socketId => {
            io.to(socketId).emit('become-speaker', { 
              roomId,
              otherSpeakers: otherSpeakers.map(s => s.userId)
            });
          });
        }
      }
    } catch (error) {
      console.error('Error approving speaker:', error);
    }
  });
  
  // Demote speaker to listener (host only)
  socket.on('demote-speaker', async ({ roomId, userId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive && room.hostId.equals(socket.user._id)) {
        const demoted = await room.demoteToListener(userId);
        if (demoted) {
          io.to(roomId).emit('speaker-demoted', { userId });
          
          const demotedSockets = getUserSockets(userId, userToSockets);
          demotedSockets.forEach(socketId => {
            io.to(socketId).emit('become-listener', { roomId });
          });
        }
      }
    } catch (error) {
      console.error('Error demoting speaker:', error);
    }
  });
  
  // Mute/unmute speaker
  socket.on('toggle-mute', async ({ roomId, isMuted }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive) {
        const speaker = room.speakers.find(s => s.userId.equals(socket.user._id));
        if (speaker) {
          speaker.isMuted = isMuted;
          await room.save();
          
          socket.to(roomId).emit('speaker-muted-toggled', {
            userId: socket.user._id,
            isMuted
          });
        }
      }
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  });
};

module.exports = { setupRoomHandlers };