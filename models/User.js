const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firebaseUid: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    photoURL: {
        type: String,
        default: null
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    // Additional profile fields
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark', 'system'],
            default: 'system'
        },
        defaultNoteColor: {
            type: String,
            default: '#ffffff'
        },
        listView: {
            type: String,
            enum: ['grid', 'list'],
            default: 'grid'
        },
        reminderNotifications: {
            type: Boolean,
            default: true
        }
    },
    // Backup email for password reset (if not using Firebase)
    backupEmail: {
        type: String,
        lowercase: true,
        trim: true,
        default: null
    },
    // Account status
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    // Statistics
    stats: {
        totalNotes: {
            type: Number,
            default: 0
        },
        totalReminders: {
            type: Number,
            default: 0
        },
        notesCreatedThisMonth: {
            type: Number,
            default: 0
        }
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


userSchema.index({ firebaseUid: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });

// Virtual for full name (if you split first/last names later)
userSchema.virtual('initials').get(function() {
    if (!this.displayName) return 'U';
    const names = this.displayName.trim().split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
});
  
// Pre-save middleware to update stats
userSchema.pre('save', function(next) {
    if (this.isNew) {
      this.lastLogin = new Date();
    }
    next();
});
  
// Instance methods
userSchema.methods.toPublicJSON = function() {
    const user = this.toObject();
    delete user.backupEmail;
    delete user.__v;
    return user;
};
  
userSchema.methods.updateStats = async function(updateFields) {
    Object.keys(updateFields).forEach(field => {
      if (this.stats[field] !== undefined) {
        this.stats[field] = updateFields[field];
      }
    });
    return this.save();
};
  
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};
  
// Static methods
userSchema.statics.findByFirebaseUid = function(firebaseUid) {
    return this.findOne({ firebaseUid, isActive: true });
};
  
userSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase(), isActive: true });
};
  
userSchema.statics.createFromFirebase = function(firebaseUser) {
    return this.create({
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      photoURL: firebaseUser.photoURL || null,
      emailVerified: firebaseUser.emailVerified || false
    });
};
  
// Error handling
userSchema.post('save', function(error, doc, next) {
    if (error.name === 'MongoError' && error.code === 11000) {
      if (error.message.includes('email')) {
        next(new Error('Email address already registered'));
      } else if (error.message.includes('firebaseUid')) {
        next(new Error('User already exists'));
      } else {
        next(new Error('Duplicate field error'));
      }
    } else {
      next(error);
    }
});
  
module.exports = mongoose.model('User', userSchema);

