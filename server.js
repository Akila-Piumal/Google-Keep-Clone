// server.js - Main Server File
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
// const admin = require('firebase-admin');

// Load environment variables
dotenv.config();

// Import database connection
const connectDB = require('./config/database');

// Import routes
// const authRoutes = require('./routes/auth');
// const noteRoutes = require('./routes/notes');
// const reminderRoutes = require('./routes/reminders');
// const uploadRoutes = require('./routes/upload');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet()); // Security headers
// app.use(cors({ origin: true, credentials: true }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://my-frontend-domain.com'] 
    : ['http://localhost:3000', 'http://localhost:19006'],
  credentials: true
}));
app.use(morgan('combined')); // Logging
app.use(limiter); // Rate limiting
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies


// API Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/notes', noteRoutes);
// app.use('/api/reminders', reminderRoutes);
// app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      message: 'Google Keep Clone API is running',
      timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});