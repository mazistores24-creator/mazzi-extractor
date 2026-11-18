import mongoose from 'mongoose';

const extractionSchema = new mongoose.Schema({
  sourceLabel: { type: String, default: 'Pasted text', trim: true, maxlength: 200 },
  sourceUrl: { type: String, default: '', trim: true, maxlength: 2048 },
  country: { type: String, default: 'Any country' },
  language: { type: String, default: 'Any language' },
  keywords: { type: String, default: '' },
  count: { type: Number, default: 0 },
  items: [{ name: String, phone: String, email: String, url: String, sourceLabel: String, country: String, language: String }]
}, { timestamps: true });

export default mongoose.model('Extraction', extractionSchema);
