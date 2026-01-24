const mongoose = require('mongoose');

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s, 16s, 32s

const connectDB = async () => {
  const options = {
    // Connection options for better performance and security
    // Pool size increased to handle batch confirmation peak (8 AM) without exhaustion
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, options);

      console.log(`MongoDB Connected: ${conn.connection.host}`);
      console.log(`Database Name: ${conn.connection.name}`);

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error(`MongoDB connection error: ${err}`);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Mongoose will automatically reconnect.');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected successfully');
      });

      return; // Success
    } catch (error) {
      console.error(`[Attempt ${attempt}/${MAX_RETRIES}] Error connecting to MongoDB: ${error.message}`);

      if (attempt === MAX_RETRIES) {
        console.error('[CRITICAL] All MongoDB connection attempts failed - application cannot function');
        console.error('Stack:', error.stack);
        process.exit(1);
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Database] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

module.exports = connectDB;
