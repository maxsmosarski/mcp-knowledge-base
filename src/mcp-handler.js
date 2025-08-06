/**
 * MCP Request Handler for Cloudflare Workers
 * Handles MCP protocol requests without Express dependencies
 */

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

// Store transports and credentials for each session
const transports = new Map();
const sessionCredentials = new Map();

// Helper to get credentials for a session
function getSessionCredentials(sessionId) {
  return sessionCredentials.get(sessionId) || {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
  };
}

// Create and configure MCP server
const server = new McpServer({
  name: 'knowledge-base',
  version: '1.0.0',
  description: 'MCP server for document upload and semantic search with Supabase'
}, {
  capabilities: {
    tools: {}
  }
});

// Register tools with credential support
server.tool(
  'upload_document',
  'Upload a document to the knowledge base',
  {
    file_path: z.string().describe('Path to the file to upload')
  },
  async ({ file_path }, extra) => {
    try {
      const credentials = getSessionCredentials(extra.sessionId);
      const result = await uploadDocument({ file_path, credentials });
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

server.tool(
  'upload_image',
  'Upload an image file and generate AI description for search',
  {
    file_path: z.string().describe('Path to the image file to upload (.png, .jpg, .jpeg, .gif, .webp)'),
    original_filename: z.string().optional().describe('Original filename to preserve in the database')
  },
  async ({ file_path, original_filename }, extra) => {
    try {
      const credentials = getSessionCredentials(extra.sessionId);
      const result = await uploadImage({ file_path, original_filename, credentials });
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

server.tool(
  'search_chunks',
  'Search for similar chunks in the knowledge base',
  {
    query: z.string().describe('Search query text'),
    match_count: z.number().default(5).describe('Number of results to return')
  },
  async ({ query, match_count }, extra) => {
    try {
      const credentials = getSessionCredentials(extra.sessionId);
      const result = await searchChunks({ query, match_count, credentials });
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

server.tool(
  'get_files',
  'Get list of all documents in the knowledge base',
  {},
  async (extra) => {
    try {
      const credentials = getSessionCredentials(extra.sessionId);
      const result = await getFiles({ credentials });
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

server.tool(
  'get_document',
  'Get a specific document by filename or id, including images with their URLs',
  {
    filename: z.string().optional().describe('The filename of the document to retrieve'),
    id: z.string().optional().describe('The UUID of the document to retrieve')
  },
  async ({ filename, id }, extra) => {
    try {
      const credentials = getSessionCredentials(extra.sessionId);
      const result = await getDocument({ filename, id, credentials });
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

server.tool(
  'delete_document',
  'Delete a document by filename or id from the knowledge base',
  {
    filename: z.string().optional().describe('The filename of the document to delete'),
    id: z.string().optional().describe('The UUID of the document to delete')
  },
  async ({ filename, id }, extra) => {
    try {
      const credentials = getSessionCredentials(extra.sessionId);
      const result = await deleteDocument({ filename, id, credentials });
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

server.tool(
  'delete_documents',
  'Delete multiple documents by their IDs from the knowledge base',
  {
    document_ids: z.array(z.string()).describe('Array of document UUIDs to delete')
  },
  async ({ document_ids }, extra) => {
    try {
      const credentials = getSessionCredentials(extra.sessionId);
      const result = await deleteDocuments({ document_ids, credentials });
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

/**
 * Handle MCP request in Cloudflare Worker context
 */
export async function handleMcpRequest(request, env) {
  try {
    const sessionId = request.headers.get('mcp-session-id');
    const body = await request.json();
    
    console.log('MCP request:', body.method, 'Session:', sessionId);
    
    // Extract credentials from headers
    const credentials = {
      supabaseUrl: request.headers.get('x-supabase-url') || env.SUPABASE_URL,
      supabaseKey: request.headers.get('x-supabase-key') || env.SUPABASE_SERVICE_KEY,
      openaiKey: request.headers.get('x-openai-key') || env.OPENAI_API_KEY,
    };
    
    // Validate credentials
    if (!credentials.supabaseUrl || !credentials.supabaseKey || !credentials.openaiKey) {
      const missing = [];
      if (!credentials.supabaseUrl) missing.push('x-supabase-url');
      if (!credentials.supabaseKey) missing.push('x-supabase-key');
      if (!credentials.openaiKey) missing.push('x-openai-key');
      
      return new Response(JSON.stringify({ 
        error: 'Missing required credentials',
        missing: missing,
        message: 'Please provide credentials via headers'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Store credentials for this session
    if (sessionId) {
      sessionCredentials.set(sessionId, credentials);
    }
    
    // Reuse existing transport for session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId);
      
      // Create mock request/response for transport
      const mockReq = {
        body: body,
        headers: Object.fromEntries(request.headers.entries())
      };
      
      let responseData;
      const mockRes = {
        status: () => mockRes,
        setHeader: () => mockRes,
        json: (data) => { responseData = data; },
        end: () => {}
      };
      
      await transport.handleRequest(mockReq, mockRes, body);
      
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Mcp-Session-Id': sessionId
        }
      });
    }
    
    // Create new transport for initialization requests
    if (!sessionId && isInitializeRequest(body)) {
      const newSessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        enableDnsRebindingProtection: false,
        allowedOrigins: ['*']
      });
      
      // Connect the transport to the server
      await server.connect(transport);
      
      // Store transport and credentials
      transports.set(newSessionId, transport);
      sessionCredentials.set(newSessionId, credentials);
      
      // Handle the initialization request
      const mockReq = {
        body: body,
        headers: Object.fromEntries(request.headers.entries())
      };
      
      let responseData;
      const mockRes = {
        status: () => mockRes,
        setHeader: () => mockRes,
        json: (data) => { responseData = data; },
        end: () => {}
      };
      
      await transport.handleRequest(mockReq, mockRes, body);
      
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Mcp-Session-Id': newSessionId
        }
      });
    }
    
    // Invalid request
    return new Response(JSON.stringify({ 
      error: 'Invalid request: Missing session ID or not an initialize request' 
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Error handling MCP request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}