
const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  firebaseUid: {
    type: String,
    required: true,
    index: true
  },
  note: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  // Reminder time settings
  reminderDateTime: {
    type: Date,
    required: true,
    index: true
  },
  timezone: {
    type: String,
    default: 'UTC',
    required: true
  },
  // Repeat settings
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrencePattern: {
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'],
      default: 'daily'
    },
    interval: {
      type: Number,
      default: 1,
      min: 1
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6 // 0 = Sunday, 6 = Saturday
    }],
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31
    },
    endDate: {
      type: Date,
      default: null
    },
    occurrenceCount: {
      type: Number,
      min: 1,
      default: null
    }
  },
  // Status and notifications
  isCompleted: {
    type: Boolean,
    default: false,
    index: true
  },
  completedAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isSnoozed: {
    type: Boolean,
    default: false
  },
  snoozeUntil: {
    type: Date,
    default: null
  },
  // Notification settings
  notificationSent: {
    type: Boolean,
    default: false
  },
  notificationMethods: [{
    type: String,
    enum: ['push', 'email', 'sms'],
    default: 'push'
  }],
  // Priority and categorization
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['personal', 'work', 'health', 'finance', 'shopping', 'other'],
    default: 'personal'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  // Location-based reminder (for future enhancement)
  location: {
    name: String,
    address: String,
    latitude: Number,
    longitude: Number,
    radius: {
      type: Number,
      default: 100 // meters
    }
  },
  // Reminder history (for recurring reminders)
  occurrences: [{
    scheduledFor: {
      type: Date,
      required: true
    },
    completedAt: {
      type: Date,
      default: null
    },
    wasSkipped: {
      type: Boolean,
      default: false
    },
    notes: String
  }],
  // Metadata
  lastTriggered: {
    type: Date,
    default: null
  },
  nextTrigger: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better performance
reminderSchema.index({ user: 1, isActive: 1, isCompleted: 1 });
reminderSchema.index({ user: 1, reminderDateTime: 1 });
reminderSchema.index({ firebaseUid: 1, isActive: 1 });
reminderSchema.index({ reminderDateTime: 1, isActive: 1, isCompleted: 1 });
reminderSchema.index({ nextTrigger: 1, isActive: 1 });
reminderSchema.index({ priority: 1, reminderDateTime: 1 });
reminderSchema.index({ category: 1, isActive: 1 });

// Virtual for overdue status
reminderSchema.virtual('isOverdue').get(function() {
  if (this.isCompleted || !this.isActive) return false;
  return new Date() > this.reminderDateTime;
});

// Virtual for time until reminder
reminderSchema.virtual('timeUntilReminder').get(function() {
  if (this.isCompleted || !this.isActive) return null;
  const now = new Date();
  const reminderTime = new Date(this.reminderDateTime);
  return reminderTime.getTime() - now.getTime();
});

// Virtual for formatted reminder time
reminderSchema.virtual('formattedReminderTime').get(function() {
  return this.reminderDateTime.toLocaleString();
});

// Pre-save middleware
reminderSchema.pre('save', function(next) {
  // Calculate next trigger for recurring reminders
  if (this.isRecurring && this.isActive && !this.isCompleted) {
    this.calculateNextTrigger();
  } else if (!this.isRecurring) {
    this.nextTrigger = this.reminderDateTime;
  }
  
  // Clear snooze if reminder time has passed
  if (this.isSnoozed && this.snoozeUntil && new Date() > this.snoozeUntil) {
    this.isSnoozed = false;
    this.snoozeUntil = null;
  }
  
  next();
});

// Instance methods
reminderSchema.methods.markCompleted = function() {
  this.isCompleted = true;
  this.completedAt = new Date();
  
  // Add to occurrences for recurring reminders
  if (this.isRecurring) {
    this.occurrences.push({
      scheduledFor: this.reminderDateTime,
      completedAt: this.completedAt
    });
    
    // Schedule next occurrence
    this.scheduleNextOccurrence();
  }
  
  return this.save();
};

reminderSchema.methods.snooze = function(snoozeMinutes = 10) {
  this.isSnoozed = true;
  this.snoozeUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000);
  return this.save();
};

reminderSchema.methods.dismiss = function() {
  if (this.isRecurring) {
    this.occurrences.push({
      scheduledFor: this.reminderDateTime,
      wasSkipped: true
    });
    this.scheduleNextOccurrence();
  } else {
    this.isActive = false;
  }
  return this.save();
};

reminderSchema.methods.calculateNextTrigger = function() {
  if (!this.isRecurring) {
    this.nextTrigger = this.reminderDateTime;
    return;
  }
  
  const current = new Date(this.reminderDateTime);
  const pattern = this.recurrencePattern;
  
  switch (pattern.type) {
    case 'daily':
      current.setDate(current.getDate() + pattern.interval);
      break;
      
    case 'weekly':
      current.setDate(current.getDate() + (7 * pattern.interval));
      break;
      
    case 'monthly':
      current.setMonth(current.getMonth() + pattern.interval);
      break;
      
    case 'yearly':
      current.setFullYear(current.getFullYear() + pattern.interval);
      break;
      
    default:
      current.setDate(current.getDate() + 1);
  }
  
  this.nextTrigger = current;
};

reminderSchema.methods.scheduleNextOccurrence = function() {
  if (!this.isRecurring) return;
  
  // Check if we've reached the end condition
  if (this.recurrencePattern.endDate && new Date() > this.recurrencePattern.endDate) {
    this.isActive = false;
    return;
  }
  
  if (this.recurrencePattern.occurrenceCount && 
      this.occurrences.length >= this.recurrencePattern.occurrenceCount) {
    this.isActive = false;
    return;
  }
  
  // Calculate next occurrence
  this.calculateNextTrigger();
  this.reminderDateTime = this.nextTrigger;
  this.isCompleted = false;
  this.completedAt = null;
  this.notificationSent = false;
};

reminderSchema.methods.updatePriority = function(newPriority) {
  if (['low', 'medium', 'high', 'urgent'].includes(newPriority)) {
    this.priority = newPriority;
    return this.save();
  }
  throw new Error('Invalid priority level');
};

reminderSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return this;
};

reminderSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

// Static methods
reminderSchema.statics.findByUser = function(userId, options = {}) {
  const query = { user: userId };
  
  if (options.activeOnly !== false) {
    query.isActive = true;
  }
  
  if (options.completedOnly === true) {
    query.isCompleted = true;
  } else if (options.incompleteOnly === true) {
    query.isCompleted = false;
  }
  
  return this.find(query).sort({ reminderDateTime: 1 });
};

reminderSchema.statics.findOverdue = function(userId) {
  return this.find({
    user: userId,
    isActive: true,
    isCompleted: false,
    reminderDateTime: { $lt: new Date() }
  }).sort({ reminderDateTime: 1 });
};

reminderSchema.statics.findUpcoming = function(userId, hours = 24) {
  const now = new Date();
  const future = new Date(now.getTime() + hours * 60 * 60 * 1000);
  
  return this.find({
    user: userId,
    isActive: true,
    isCompleted: false,
    reminderDateTime: { $gte: now, $lte: future }
  }).sort({ reminderDateTime: 1 });
};

reminderSchema.statics.findByPriority = function(userId, priority) {
  return this.find({
    user: userId,
    priority: priority,
    isActive: true,
    isCompleted: false
  }).sort({ reminderDateTime: 1 });
};

reminderSchema.statics.findByCategory = function(userId, category) {
  return this.find({
    user: userId,
    category: category,
    isActive: true
  }).sort({ reminderDateTime: 1 });
};

reminderSchema.statics.findDueForNotification = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    isCompleted: false,
    notificationSent: false,
    reminderDateTime: { $lte: now },
    $or: [
      { isSnoozed: false },
      { snoozeUntil: { $lte: now } }
    ]
  });
};

module.exports = mongoose.model('Reminder', reminderSchema);