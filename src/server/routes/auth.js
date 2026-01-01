const express = require('express');
const router = express.Router();
const User = require('../models/User'); // You'll need to create this

// Test route to verify MongoDB is working
router.get('/test-db', async (req, res) => {
  try {
    // Try to create a test user
    const testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword'
    });
    
    await testUser.save();
    res.json({ 
      success: true, 
      message: 'Database is working!',
      userId: testUser._id 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;