const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const options = {
      // Connection options for better performance and security
      // Pool size increased to handle batch confirmation peak (8 AM) without exhaustion
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected successfully');
    });

    // Note: Graceful shutdown is handled in server.js to avoid duplicate handlers

  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.error('Stack:', error.stack);
    // Log critical startup failure - this should trigger alerts
    console.error('[CRITICAL] Database connection failed at startup - application cannot function');
    process.exit(1);
  }
};

module.exports = connectDB;
