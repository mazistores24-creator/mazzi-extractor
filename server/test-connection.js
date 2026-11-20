import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://mazzi-extractor:12King2121@cluster0.k2oeods.mongodb.net/mazzi-extractor';

console.log('Testing MongoDB Atlas connection...');

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
})
  .then(() => {
    console.log('SUCCESS: Connected to MongoDB Atlas!');
    console.log('Host:', mongoose.connection.host);
    console.log('Database:', mongoose.connection.name);
    return mongoose.connection.db.listCollections().toArray();
  })
  .then(collections => {
    console.log('Collections:', collections.map(c => c.name).join(', ') || '(none)');
    return mongoose.disconnect();
  })
  .then(() => {
    console.log('Disconnected successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('FAILED:', error.message);
    process.exit(1);
  });