const setupSignalingHandlers = (io, socket, socketToUser) => {
  // 1-on-1 call signaling
  socket.on('call-user', ({ userToCall, offer }) => {
    const targetSocketId = getSocketIdByUserId(userToCall, socketToUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', {
        from: socket.user._id,
        fromUsername: socket.user.username,
        offer
      });
    }
  });
  
  socket.on('answer-call', ({ to, answer }) => {
    const targetSocketId = getSocketIdByUserId(to, socketToUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-answered', { answer });
    }
  });
  
  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocketId = getSocketIdByUserId(to, socketToUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate, from: socket.user._id });
    }
  });
  
  socket.on('end-call', ({ to }) => {
    const targetSocketId = getSocketIdByUserId(to, socketToUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-ended');
    }
  });
  
  // Room-based WebRTC signaling
  socket.on('room-sdp-offer', ({ to, offer, roomId }) => {
    const targetSocketId = getSocketIdByUserId(to, socketToUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('room-sdp-offer', {
        from: socket.user._id,
        offer,
        roomId
      });
    }
  });
  
  socket.on('room-sdp-answer', ({ to, answer, roomId }) => {
    const targetSocketId = getSocketIdByUserId(to, socketToUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('room-sdp-answer', {
        from: socket.user._id,
        answer,
        roomId
      });
    }
  });
  
  socket.on('room-ice-candidate', ({ to, candidate, roomId }) => {
    const targetSocketId = getSocketIdByUserId(to, socketToUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('room-ice-candidate', {
        from: socket.user._id,
        candidate,
        roomId
      });
    }
  });
};

// Helper function to get socket ID from user ID
const getSocketIdByUserId = (userId, socketToUser) => {
  for (const [socketId, socketUserId] of socketToUser.entries()) {
    if (socketUserId.toString() === userId.toString()) {
      return socketId;
    }
  }
  return null;
};

module.exports = { setupSignalingHandlers };