const mongoose = require('mongoose');

const connectDB = async () => {
    try {
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        bufferCommands: false, // Disable mongoose buffering
      };
  
      const conn = await mongoose.connect(process.env.MONGO_URI, options);
      
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      console.log(`Database: ${conn.connection.name}`);
      
      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
      });
  
      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
      });
  
      // Handle application termination
      process.on('SIGINT', async () => {
        try {
          await mongoose.connection.close();
          console.log('MongoDB connection closed through app termination');
          process.exit(0);
        } catch (err) {
          console.error('Error closing MongoDB connection:', err);
          process.exit(1);
        }
      });
  
    } catch (error) {
      console.error('Database connection failed:', error.message);
      
      // Retry connection after 5 seconds
      console.log('🔄 Retrying database connection in 5 seconds...');
      setTimeout(connectDB, 5000);
    }

};
  
module.exports = connectDB;