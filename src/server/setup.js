const mongoose = require('mongoose');
require('dotenv').config();

async function setupDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    console.log('✅ Connected to MongoDB');
    
    // Create indexes
    const Message = require('./models/Message');
    await Message.createIndexes();
    console.log('✅ Created database indexes');
    
    // Insert test data
    const testMessage = new Message({
      username: 'System',
      text: 'Chat database is ready!',
      room: 'general',
      isSystemMessage: true
    });
    
    await testMessage.save();
    console.log('✅ Inserted test message');
    
    console.log('\n🎉 Database setup complete!');
    console.log('📊 Collections created: messages, users');
    console.log('🔗 Connection string: ', mongoose.connection.host);
    
    mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupDatabase();