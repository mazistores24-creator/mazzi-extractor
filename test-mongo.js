import mongoose from 'mongoose';
import fs from 'fs';

const MONGODB_URI = 'mongodb+srv://mazzi-extractor:password12King%40%40%21%21@cluster0.k2oeods.mongodb.net/mazzi-extractor';
const output = [];

output.push('Testing MongoDB Atlas connection...');

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
})
  .then(() => {
    output.push('✅ MongoDB Atlas connection SUCCESSFUL!');
    output.push('Database:', mongoose.connection.name);
    output.push('Host:', mongoose.connection.host);
    return mongoose.connection.db.listCollections().toArray();
  })
  .then(collections => {
    output.push('Collections:', collections.map(c => c.name).join(', ') || '(none)');
    return mongoose.disconnect();
  })
  .then(() => {
    output.push('✅ Disconnected successfully.');
    fs.writeFileSync('mongo-test-result.txt', output.join('\n'));
    process.exit(0);
  })
  .catch(error => {
    output.push('❌ MongoDB Atlas connection FAILED!');
    output.push('Error:', error.message);
    fs.writeFileSync('mongo-test-result.txt', output.join('\n'));
    process.exit(1);
  });
