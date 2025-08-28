
const { verifyIdToken } = require('../config/firebase');
const User = require('../models/User');

// Middleware to verify Firebase ID token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(token);
    
    // Find user in our database
    let user = await User.findByFirebaseUid(decodedToken.uid);
    
    // If user doesn't exist in our database, create them
    if (!user) {
      user = await User.createFromFirebase({
        uid: decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name || decodedToken.email.split('@')[0],
        photoURL: decodedToken.picture || null,
        emailVerified: decodedToken.email_verified || false
      });
      
      console.log(`✅ New user created: ${user.email}`);
    } else {
      // Update last login
      await user.updateLastLogin();
    }

    // Add user info to request
    req.user = user;
    req.firebaseUser = decodedToken;
    
    next();
  } catch (error) {
    console.error('❌ Authentication error:', error.message);
    
    // Handle specific Firebase auth errors
    if (error.message.includes('expired')) {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.message.includes('Invalid token') || error.message.includes('invalid')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// Middleware to check if user account is active
const checkUserStatus = async (req, res, next) => {
  try {
    if (!req.user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        code: 'ACCOUNT_INACTIVE'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ User status check error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Middleware to check if email is verified (optional)
const requireEmailVerification = (req, res, next) => {
  if (!req.firebaseUser.email_verified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }
  
  next();
};

// Middleware for optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decodedToken = await verifyIdToken(token);
      const user = await User.findByFirebaseUid(decodedToken.uid);
      
      if (user && user.isActive) {
        req.user = user;
        req.firebaseUser = decodedToken;
        await user.updateLastLogin();
      }
    }
    
    next();
  } catch (error) {
    // Don't fail for optional auth, just continue without user
    console.log('⚠️ Optional auth failed:', error.message);
    next();
  }
};

// Role-based access control (for future admin features)
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role || 'user';
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: roles,
        current: userRole
      });
    }

    next();
  };
};

// Middleware to validate user ownership of resources
const validateResourceOwnership = (resourceModel, resourceParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }

      // Check if user owns the resource
      if (resource.user.toString() !== req.user._id.toString() && 
          resource.firebaseUid !== req.firebaseUser.uid) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not own this resource'
        });
      }

      // Add resource to request for use in controller
      req.resource = resource;
      next();
    } catch (error) {
      console.error('❌ Resource ownership validation error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

// Rate limiting per user
const createUserRateLimit = (windowMs, max, message) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next(); // Skip rate limiting if not authenticated
    }

    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    const userRequestTimes = userRequests.get(userId) || [];
    const recentRequests = userRequestTimes.filter(time => time > windowStart);

    if (recentRequests.length >= max) {
      return res.status(429).json({
        success: false,
        message: message || `Too many requests. Maximum ${max} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }

    // Add current request time
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);

    next();
  };
};

// Middleware to log user activity
const logUserActivity = (action) => {
  return (req, res, next) => {
    // You can implement user activity logging here
    console.log(`📊 User Activity: ${req.user?.email} - ${action} - ${new Date().toISOString()}`);
    next();
  };
};

module.exports = {
  authenticateToken,
  checkUserStatus,
  requireEmailVerification,
  optionalAuth,
  requireRole,
  validateResourceOwnership,
  createUserRateLimit,
  logUserActivity
};