#!/usr/bin/env node
/**
 * Reset password for kunal@pm.in user
 * Run from project root: node backend/scripts/reset-kunal-password.js
 * On server: cd /var/www/pratibha-marketing && node backend/scripts/reset-kunal-password.js
 */

const path = require('path');

// Load .env from project root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set.');
  console.error('Make sure .env file exists in project root with MONGODB_URI');
  process.exit(1);
}

async function resetPassword() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    // Find the user
    const user = await User.findOne({ email: 'kunal@pm.in' }).select('+password');

    if (!user) {
      console.log('User kunal@pm.in not found. Creating...');

      // Create the user if it doesn't exist
      const newUser = await User.create({
        name: 'Kunal',
        email: 'kunal@pm.in',
        password: 'Kunal786',
        role: 'admin',
        isActive: true
      });

      console.log('✓ User created successfully!');
      console.log('  Email: kunal@pm.in');
      console.log('  Password: Kunal786');
      console.log('  Role: admin');
    } else {
      console.log('Found user:');
      console.log('  ID:', user._id);
      console.log('  Name:', user.name);
      console.log('  Email:', user.email);
      console.log('  Role:', user.role);
      console.log('  Active:', user.isActive);
      console.log('');

      if (!user.isActive) {
        console.log('User is deactivated. Reactivating...');
        user.isActive = true;
      }

      // Reset password
      console.log('Resetting password to "Kunal786"...');
      user.password = 'Kunal786';
      await user.save();

      console.log('✓ Password reset successfully!');
      console.log('');
      console.log('New credentials:');
      console.log('  Email: kunal@pm.in');
      console.log('  Password: Kunal786');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB disconnected.');
  }
}

resetPassword();
