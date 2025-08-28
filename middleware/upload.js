const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (we'll upload to Firebase)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedTypes = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/webm': '.webm'
  };

  // Check if file type is allowed
  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: ${Object.keys(allowedTypes).join(', ')}`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per upload
  },
  fileFilter: fileFilter
});

// Middleware for single file upload
const uploadSingle = (fieldName = 'file') => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);
    
    singleUpload(req, res, (err) => {
      if (err) {
        return handleUploadError(err, res);
      }
      next();
    });
  };
};

// Middleware for multiple file upload
const uploadMultiple = (fieldName = 'files', maxCount = 5) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);
    
    multipleUpload(req, res, (err) => {
      if (err) {
        return handleUploadError(err, res);
      }
      next();
    });
  };
};

// Middleware for mixed file upload (different field names)
const uploadFields = (fields) => {
  return (req, res, next) => {
    const fieldsUpload = upload.fields(fields);
    
    fieldsUpload(req, res, (err) => {
      if (err) {
        return handleUploadError(err, res);
      }
      next();
    });
  };
};

// Error handling function
const handleUploadError = (err, res) => {
  console.error('❌ File upload error:', err.message);
  
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 10MB.',
          code: 'FILE_TOO_LARGE'
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 5 files allowed.',
          code: 'TOO_MANY_FILES'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field.',
          code: 'UNEXPECTED_FILE'
        });
      
      default:
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message,
          code: 'UPLOAD_ERROR'
        });
    }
  }
  
  // Custom file filter errors
  if (err.message.includes('File type')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      code: 'INVALID_FILE_TYPE'
    });
  }
  
  return res.status(500).json({
    success: false,
    message: 'Internal server error during file upload',
    code: 'INTERNAL_ERROR'
  });
};

// Middleware to validate file presence
const requireFile = (fieldName = 'file') => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return res.status(400).json({
        success: false,
        message: `No file provided in field '${fieldName}'`,
        code: 'NO_FILE'
      });
    }
    next();
  };
};

// Middleware to validate specific file types for specific routes
const validateFileType = (allowedTypes) => {
  return (req, res, next) => {
    const files = req.files || (req.file ? [req.file] : []);
    
    if (files.length === 0) {
      return next();
    }
    
    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `File type ${file.mimetype} not allowed for this endpoint`,
          allowed: allowedTypes,
          code: 'INVALID_FILE_TYPE_FOR_ENDPOINT'
        });
      }
    }
    
    next();
  };
};

// Middleware to add file metadata
const addFileMetadata = (req, res, next) => {
  if (req.file) {
    req.file.uploadTimestamp = Date.now();
    req.file.userId = req.user?._id;
    req.file.userEmail = req.user?.email;
  }
  
  if (req.files && Array.isArray(req.files)) {
    req.files.forEach(file => {
      file.uploadTimestamp = Date.now();
      file.userId = req.user?._id;
      file.userEmail = req.user?.email;
    });
  }
  
  next();
};

// Middleware to generate unique filename
const generateUniqueFilename = (req, res, next) => {
  const generateName = (originalname) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const ext = path.extname(originalname);
    const nameWithoutExt = path.basename(originalname, ext);
    return `${nameWithoutExt}_${timestamp}_${random}${ext}`;
  };

  if (req.file) {
    req.file.uniqueFilename = generateName(req.file.originalname);
  }
  
  if (req.files && Array.isArray(req.files)) {
    req.files.forEach(file => {
      file.uniqueFilename = generateName(file.originalname);
    });
  }
  
  next();
};

// Middleware for image-only uploads
const uploadImage = uploadSingle('image');
const uploadImages = uploadMultiple('images', 5);

// Middleware for audio-only uploads
const uploadAudio = uploadSingle('audio');

// Middleware for document-only uploads
const uploadDocument = uploadSingle('document');

// File type validators
const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm'];
const documentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];

const validateImageOnly = validateFileType(imageTypes);
const validateAudioOnly = validateFileType(audioTypes);
const validateDocumentOnly = validateFileType(documentTypes);

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  uploadImage,
  uploadImages,
  uploadAudio,
  uploadDocument,
  requireFile,
  validateFileType,
  validateImageOnly,
  validateAudioOnly,
  validateDocumentOnly,
  addFileMetadata,
  generateUniqueFilename,
  handleUploadError
};