const mongoose = require('mongoose');

const audioRoomSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  speakers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isMuted: {
      type: Boolean,
      default: false
    }
  }],
  listeners: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    handRaised: {
      type: Boolean,
      default: false
    },
    handRaisedAt: Date
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  endedAt: Date
});

// Index for faster queries
audioRoomSchema.index({ isActive: 1, createdAt: -1 });
audioRoomSchema.index({ hostId: 1 });

// Virtual for total participants
audioRoomSchema.virtual('totalParticipants').get(function() {
  return this.speakers.length + this.listeners.length;
});

// Method to add listener
audioRoomSchema.methods.addListener = async function(userId) {
  const existingListener = this.listeners.find(l => l.userId.equals(userId));
  const existingSpeaker = this.speakers.find(s => s.userId.equals(userId));
  
  if (!existingListener && !existingSpeaker) {
    this.listeners.push({ userId });
    await this.save();
  }
};

// Method to add speaker
audioRoomSchema.methods.addSpeaker = async function(userId) {
  // Remove from listeners if present
  this.listeners = this.listeners.filter(l => !l.userId.equals(userId));
  
  // Add to speakers if not already
  const existingSpeaker = this.speakers.find(s => s.userId.equals(userId));
  if (!existingSpeaker) {
    this.speakers.push({ userId });
    await this.save();
  }
};

// Method to remove participant
audioRoomSchema.methods.removeParticipant = async function(userId) {
  this.speakers = this.speakers.filter(s => !s.userId.equals(userId));
  this.listeners = this.listeners.filter(l => !l.userId.equals(userId));
  await this.save();
};

// Method to raise hand
audioRoomSchema.methods.raiseHand = async function(userId) {
  const listener = this.listeners.find(l => l.userId.equals(userId));
  if (listener && !listener.handRaised) {
    listener.handRaised = true;
    listener.handRaisedAt = new Date();
    await this.save();
    return true;
  }
  return false;
};

// Method to approve speaker
audioRoomSchema.methods.approveSpeaker = async function(userId) {
  const listener = this.listeners.find(l => l.userId.equals(userId));
  if (listener && listener.handRaised) {
    await this.addSpeaker(userId);
    return true;
  }
  return false;
};

// Method to demote speaker to listener
audioRoomSchema.methods.demoteToListener = async function(userId) {
  const speakerIndex = this.speakers.findIndex(s => s.userId.equals(userId));
  if (speakerIndex !== -1) {
    this.speakers.splice(speakerIndex, 1);
    await this.addListener(userId);
    return true;
  }
  return false;
};

module.exports = mongoose.model('AudioRoom', audioRoomSchema);