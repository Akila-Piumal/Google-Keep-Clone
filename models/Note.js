const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
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
  title: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  content: {
    type: String,
    trim: true,
    maxlength: 10000,
    default: ''
  },
  color: {
    type: String,
    default: '#ffffff',
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: 'Invalid color format. Use hex format (#ffffff)'
    }
  },
  // Note type
  type: {
    type: String,
    enum: ['note', 'list', 'drawing'],
    default: 'note'
  },
  // List-specific fields
  listItems: [{
    id: {
      type: String,
      required: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    completed: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  // Media attachments
  attachments: [{
    id: {
      type: String,
      required: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    fileName: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      required: true,
      enum: ['image', 'document', 'audio']
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Organization
  labels: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  category: {
    type: String,
    enum: ['personal', 'work', 'shopping', 'ideas', 'archive'],
    default: 'personal'
  },
  // Status flags
  isPinned: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  // Collaboration (for future features)
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    email: String,
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Reminder association
  reminder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reminder',
    default: null
  },
  // Timestamps
  lastModified: {
    type: Date,
    default: Date.now
  },
  deletedAt: {
    type: Date,
    default: null
  },
  // Search optimization
  searchableText: {
    type: String,
    index: 'text'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret.searchableText;
      return ret;
    }
  }
});

// Indexes for better performance
noteSchema.index({ user: 1, isDeleted: 1, isArchived: 1 });
noteSchema.index({ user: 1, isPinned: -1, updatedAt: -1 });
noteSchema.index({ user: 1, category: 1 });
noteSchema.index({ user: 1, labels: 1 });
noteSchema.index({ firebaseUid: 1, isDeleted: 1 });
noteSchema.index({ createdAt: -1 });
noteSchema.index({ lastModified: -1 });

// Text search index
noteSchema.index({ searchableText: 'text' });

// Virtual for word count
noteSchema.virtual('wordCount').get(function() {
  if (!this.content) return 0;
  return this.content.trim().split(/\s+/).filter(word => word.length > 0).length;
});

// Virtual for character count
noteSchema.virtual('characterCount').get(function() {
  return (this.content || '').length;
});

// Virtual for completion percentage (for lists)
noteSchema.virtual('completionPercentage').get(function() {
  if (this.type !== 'list' || this.listItems.length === 0) return null;
  const completed = this.listItems.filter(item => item.completed).length;
  return Math.round((completed / this.listItems.length) * 100);
});

// Pre-save middleware
noteSchema.pre('save', function(next) {
  // Update searchable text for full-text search
  this.searchableText = [
    this.title || '',
    this.content || '',
    this.labels.join(' '),
    this.listItems.map(item => item.text).join(' ')
  ].join(' ').toLowerCase();

  // Update lastModified
  this.lastModified = new Date();

  next();
});

// Pre-find middleware to exclude deleted notes by default
noteSchema.pre(/^find/, function(next) {
  // Only apply if isDeleted filter is not explicitly set
  if (!this.getQuery().hasOwnProperty('isDeleted')) {
    this.find({ isDeleted: { $ne: true } });
  }
  next();
});

// Instance methods
noteSchema.methods.togglePin = function() {
  this.isPinned = !this.isPinned;
  return this.save();
};

noteSchema.methods.toggleArchive = function() {
  this.isArchived = !this.isArchived;
  if (this.isArchived) {
    this.isPinned = false; // Can't be pinned and archived
  }
  return this.save();
};

noteSchema.methods.toggleFavorite = function() {
  this.isFavorite = !this.isFavorite;
  return this.save();
};

noteSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.isPinned = false;
  return this.save();
};

noteSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  return this.save();
};

noteSchema.methods.addLabel = function(label) {
  if (!this.labels.includes(label)) {
    this.labels.push(label);
    return this.save();
  }
  return this;
};

noteSchema.methods.removeLabel = function(label) {
  this.labels = this.labels.filter(l => l !== label);
  return this.save();
};

noteSchema.methods.addListItem = function(text) {
  const newItem = {
    text: text.trim(),
    completed: false,
    order: this.listItems.length
  };
  this.listItems.push(newItem);
  return this.save();
};

noteSchema.methods.toggleListItem = function(itemId) {
  const item = this.listItems.id(itemId);
  if (item) {
    item.completed = !item.completed;
    return this.save();
  }
  throw new Error('List item not found');
};

noteSchema.methods.removeListItem = function(itemId) {
  this.listItems = this.listItems.filter(item => item.id !== itemId);
  return this.save();
};

// Static methods
noteSchema.statics.findByUser = function(userId, options = {}) {
  const query = { user: userId };
  
  if (options.includeArchived !== true) {
    query.isArchived = false;
  }
  
  if (options.includeDeleted !== true) {
    query.isDeleted = false;
  }
  
  return this.find(query).sort({ isPinned: -1, updatedAt: -1 });
};

noteSchema.statics.searchNotes = function(userId, searchTerm, options = {}) {
  const query = {
    user: userId,
    isDeleted: false,
    $text: { $search: searchTerm }
  };
  
  if (options.includeArchived !== true) {
    query.isArchived = false;
  }
  
  return this.find(query, { score: { $meta: 'textScore' } })
           .sort({ score: { $meta: 'textScore' }, isPinned: -1 });
};

noteSchema.statics.findByCategory = function(userId, category) {
  return this.find({
    user: userId,
    category: category,
    isDeleted: false,
    isArchived: false
  }).sort({ isPinned: -1, updatedAt: -1 });
};

noteSchema.statics.findByLabel = function(userId, label) {
  return this.find({
    user: userId,
    labels: label,
    isDeleted: false,
    isArchived: false
  }).sort({ isPinned: -1, updatedAt: -1 });
};

module.exports = mongoose.model('Note', noteSchema);