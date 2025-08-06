import express from 'express';
import { uploadDocument } from './tools/upload-document.js';
import { searchChunks } from './tools/search-chunks.js';

const PORT = process.env.MCP_PORT || 3000;
const app = express();

// Middleware
app.use(express.json());

// CORS headers for Claude Desktop
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'knowledge-base',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      upload: '/upload',
      search: '/search'
    }
  });
});

// Upload document endpoint
app.post('/upload', async (req, res) => {
  try {
    const { file_path } = req.body;
    if (!file_path) {
      return res.status(400).json({ error: 'file_path is required' });
    }
    
    const result = await uploadDocument({ file_path });
    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search endpoint
app.post('/search', async (req, res) => {
  try {
    const { query, match_count = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    const result = await searchChunks({ query, match_count });
    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Knowledge Base API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`Upload endpoint: POST http://localhost:${PORT}/upload`);
  console.log(`Search endpoint: POST http://localhost:${PORT}/search`);
  console.log('\nExample usage:');
  console.log(`curl -X POST http://localhost:${PORT}/search -H "Content-Type: application/json" -d '{"query":"machine learning"}'`);
});