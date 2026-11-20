import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import Extraction from './models/Extraction.js';
import { extractContacts } from './lib/extractContacts.js';
import searchRoutes from './routes/search.js';

const app = express();
const port = Number(process.env.PORT) || 5000;
const memoryHistory = [];
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use('/api/search', searchRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'memory mode' }));

app.get('/api/config', (_req, res) => {
  res.json({
    googleApiKeyConfigured: Boolean(process.env.GOOGLE_API_KEY || process.env.SERPER_API_KEY || process.env.SERPAPI_API_KEY),
    mongodbConfigured: Boolean(process.env.MONGODB_URI),
    version: '1.0.0'
  });
});

app.get('/api/extractions', async (_req, res) => {
  try {
    if (mongoose.connection.readyState === 1) return res.json(await Extraction.find().select('-items').sort({ createdAt: -1 }).limit(50).lean());
    return res.json(memoryHistory.slice(0, 50));
  } catch (error) { return res.status(500).json({ message: 'Could not load run history.', detail: error.message }); }
});

app.post('/api/extractions', async (req, res) => {
  const { text, sourceLabel, sourceUrl, country, language, keywords, maxResults } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ message: 'Provide source text to extract from.' });
  if (text.length > 5_000_000) return res.status(413).json({ message: 'Source text is larger than 5 MB.' });
  const options = { sourceLabel, sourceUrl, country, language, keywords, maxResults };
  const items = extractContacts(text, options);
  const record = { ...options, count: items.length, items, createdAt: new Date() };
  try {
    if (mongoose.connection.readyState === 1) {
      const saved = await Extraction.create(record);
      return res.status(201).json({ id: saved._id, count: items.length, items });
    }
    memoryHistory.unshift({ ...record, _id: `memory-${Date.now()}` });
    memoryHistory.splice(50);
    return res.status(201).json({ id: memoryHistory[0]._id, count: items.length, items, persistence: 'memory' });
  } catch (error) { return res.status(500).json({ message: 'Extraction ran but could not be saved.', detail: error.message }); }
});

app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));
app.listen(port, () => console.log(`Mazzi Extractor API listening on http://localhost:${port}`));

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected.'))
    .catch(error => console.error(`MongoDB unavailable; using in-memory history. ${error.message}`));
} else {
  console.log('MONGODB_URI is not set; run history will be kept in memory.');
}
