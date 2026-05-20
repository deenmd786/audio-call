const AudioRoom = require('../models/AudioRoom');

const setupRoomHandlers = (io, socket, socketToUser, userToSockets) => {
  
  // Join audio room
  socket.on('join-room', async ({ roomId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (!room || !room.isActive) {
        socket.emit('join-room-response', { success: false, error: 'Room not found or inactive' });
        return;
      }
      
      // FIX: If the HOST joins, put them in speakers. Otherwise, put them in listeners.
      if (room.hostId.equals(socket.user._id)) {
        if (!room.speakers.some(s => s.userId.equals(socket.user._id))) {
          room.speakers.push({ userId: socket.user._id, isMuted: false });
        }
        // Ensure they aren't stuck in listeners
        room.listeners = room.listeners.filter(l => !l.userId.equals(socket.user._id));
        await room.save();
      } else {
        await room.addListener(socket.user._id);
      }
      
      socket.join(roomId);
      
      const roomState = {
        roomId: room._id,
        title: room.title,
        hostId: room.hostId,
        speakers: room.speakers.map(s => ({ userId: s.userId, isMuted: s.isMuted })),
        listeners: room.listeners.map(l => ({ userId: l.userId, handRaised: l.handRaised })),
        currentUserRole: room.hostId.equals(socket.user._id) ? 'host' : 
                       room.speakers.some(s => s.userId.equals(socket.user._id)) ? 'speaker' : 'listener'
      };
      
      socket.to(roomId).emit('user-joined', {
        userId: socket.user._id,
        username: socket.user.username,
        role: room.hostId.equals(socket.user._id) ? 'host' : 'listener'
      });
      
      socket.emit('join-room-response', { success: true, roomState });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('join-room-response', { success: false, error: 'Failed to join room' });
    }
  });
  
  // Leave room
  socket.on('leave-room', async ({ roomId }) => {
    try {
      const room = await AudioRoom.findById(roomId);
      if (room && room.isActive) {
        await room.removeParticipant(socket.user._id);
        
        // FIX: We removed the logic that destroyed the room when the host left!
        // Now, the room stays alive until the timer expires.
        
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
          
          // Establish WebRTC connections with all existing speakers
          const otherSpeakers = room.speakers.filter(s => !s.userId.equals(userId));
          io.to(roomId).emit('new-speaker-joined', { userId });
          
          // Notify the new speaker to initiate connections
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
          
          // Notify the demoted user to disconnect their audio streams
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

// Helper to get all socket IDs for a user
const getUserSockets = (userId, userToSockets) => {
  const sockets = userToSockets.get(userId);
  return sockets ? Array.from(sockets) : [];
};

module.exports = { setupRoomHandlers };