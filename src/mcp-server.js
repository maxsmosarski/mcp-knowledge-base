import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { uploadDocument } from './tools/upload-document.js';
import { uploadImage } from './tools/upload-image.js';
import { searchChunks } from './tools/search-chunks.js';
import { getFiles } from './tools/get-files.js';
import { getDocument } from './tools/get-document.js';
import { deleteDocument } from './tools/delete-document.js';
import { deleteDocuments } from './tools/delete-documents.js';

// Create MCP server instance
const server = new McpServer({
  name: 'knowledge-base',
  version: '1.0.0',
  description: 'MCP server for document upload and semantic search with Supabase'
}, {
  capabilities: {
    tools: {}
  }
});

// Register the upload_document tool
server.tool(
  'upload_document',
  'Upload a document to the knowledge base',
  {
    file_path: z.string().describe('Path to the file to upload')
  },
  async ({ file_path }) => {
    try {
      const result = await uploadDocument({ file_path });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register the upload_image tool
server.tool(
  'upload_image',
  'Upload an image file and generate AI description for search',
  {
    file_path: z.string().describe('Path to the image file to upload (.png, .jpg, .jpeg, .gif, .webp)'),
    original_filename: z.string().optional().describe('Original filename to preserve in the database')
  },
  async ({ file_path, original_filename }) => {
    try {
      const result = await uploadImage({ file_path, original_filename });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register the search_chunks tool
server.tool(
  'search_chunks',
  'Search for similar chunks in the knowledge base',
  {
    query: z.string().describe('Search query text'),
    match_count: z.number().default(5).describe('Number of results to return')
  },
  async ({ query, match_count }) => {
    console.log('search_chunks tool handler called with:', { query, match_count });
    try {
      const result = await searchChunks({ query, match_count });
      console.log('search_chunks result:', JSON.stringify(result, null, 2));
      const response = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
      console.log('Returning response from search_chunks handler');
      return response;
    } catch (error) {
      console.error('Error in search_chunks handler:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register the get_files tool
server.tool(
  'get_files',
  'Get list of all documents in the knowledge base',
  {},
  async () => {
    try {
      const result = await getFiles();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register the get_document tool
server.tool(
  'get_document',
  'Get a specific document by filename or id, including images with their URLs',
  {
    filename: z.string().optional().describe('The filename of the document to retrieve'),
    id: z.string().optional().describe('The UUID of the document to retrieve')
  },
  async ({ filename, id }) => {
    try {
      const result = await getDocument({ filename, id });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register the delete_document tool
server.tool(
  'delete_document',
  'Delete a document by filename or id from the knowledge base',
  {
    filename: z.string().optional().describe('The filename of the document to delete'),
    id: z.string().optional().describe('The UUID of the document to delete')
  },
  async ({ filename, id }) => {
    try {
      const result = await deleteDocument({ filename, id });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register the delete_documents tool
server.tool(
  'delete_documents',
  'Delete multiple documents by their IDs from the knowledge base',
  {
    document_ids: z.array(z.string()).describe('Array of document UUIDs to delete')
  },
  async ({ document_ids }) => {
    try {
      const result = await deleteDocuments({ document_ids });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Set up Express app
const app = express();
app.use(express.json());

// CORS headers for MCP clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
  res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Store transports for each session
const transports = {};

// Configure MCP endpoint
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  console.log('MCP request:', req.body.method, 'Session:', sessionId);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Reuse existing transport for session
    if (sessionId && transports[sessionId]) {
      console.log('Using existing transport for session:', sessionId);
      const transport = transports[sessionId];
      console.log('About to call transport.handleRequest...');
      await transport.handleRequest(req, res, req.body);
      console.log('transport.handleRequest completed');
      
      // Check if response was sent
      if (!res.headersSent) {
        console.log('WARNING: Response headers not sent after handleRequest');
      }
      return;
    }
    
    // Create new transport only for initialization requests
    console.log('Checking if initialize request:', JSON.stringify(req.body));
    console.log('isInitializeRequest result:', isInitializeRequest(req.body));
    if (!sessionId && isInitializeRequest(req.body)) {
      const newSessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        enableDnsRebindingProtection: false, // Disable for development
        allowedOrigins: ['*'] // Allow all origins for now
      });
      
      // Connect the transport to the server
      await server.connect(transport);
      
      // Set the session ID header before handling the request
      res.setHeader('Mcp-Session-Id', newSessionId);
      
      // Handle the request
      await transport.handleRequest(req, res, req.body);
      
      // Check if response was sent
      if (!res.headersSent) {
        console.log('WARNING: Response headers not sent after initialize handleRequest');
      }
      
      // Store transport for future requests
      transports[newSessionId] = transport;
      return;
    }
    
    // Invalid request - no session and not an initialize request
    res.status(400).json({ error: 'Invalid request: Missing session ID or not an initialize request' });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint (non-MCP)
app.get('/', (_, res) => {
  res.json({
    name: 'knowledge-base',
    version: '1.0.0',
    status: 'running',
    type: 'MCP Server (Streamable HTTP)',
    endpoint: '/mcp'
  });
});

// Start server
const PORT = process.env.MCP_PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Knowledge Base Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log('\nThis is now a proper MCP server using Streamable HTTP transport!');
  console.log('It can be used with Claude Desktop and other MCP clients.');
});