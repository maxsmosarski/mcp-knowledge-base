/**
 * Shared MCP Server Definition
 * This file contains the core MCP server and tool definitions
 * Used by both local Express server and Cloudflare Worker
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { uploadDocument } from './tools/upload-document.js';
import { uploadImage } from './tools/upload-image.js';
import { searchChunks } from './tools/search-chunks.js';
import { getFiles } from './tools/get-files.js';
import { getDocument } from './tools/get-document.js';
import { deleteDocument } from './tools/delete-document.js';
import { deleteDocuments } from './tools/delete-documents.js';

// Create and configure MCP server
export const server = new McpServer({
  name: 'knowledge-base',
  version: '1.0.0',
  description: 'MCP server for document upload and semantic search with Supabase'
}, {
  capabilities: {
    tools: {}
  }
});

// Helper to get credentials for a session
export function getSessionCredentials(sessionId, sessionCredentialsMap) {
  // If a map is provided (Cloudflare), use it
  if (sessionCredentialsMap) {
    return sessionCredentialsMap.get(sessionId) || {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_KEY,
      openaiKey: process.env.OPENAI_API_KEY,
    };
  }
  
  // Otherwise use environment variables directly (local)
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
  };
}

// Register the upload_document tool
server.tool(
  'upload_document',
  'Upload a document to the knowledge base',
  {
    file_path: z.string().describe('Path to the file to upload')
  },
  async ({ file_path }, extra) => {
    try {
      const credentials = extra.credentials || getSessionCredentials(extra.sessionId, extra.sessionCredentialsMap);
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

// Register the upload_image tool
server.tool(
  'upload_image',
  'Upload an image file and generate AI description for search',
  {
    file_path: z.string().describe('Path to the image file to upload (.png, .jpg, .jpeg, .gif, .webp)'),
    original_filename: z.string().optional().describe('Original filename to preserve in the database')
  },
  async ({ file_path, original_filename }, extra) => {
    try {
      const credentials = extra.credentials || getSessionCredentials(extra.sessionId, extra.sessionCredentialsMap);
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

// Register the search_chunks tool
server.tool(
  'search_chunks',
  'Search for similar chunks in the knowledge base',
  {
    query: z.string().describe('Search query text'),
    match_count: z.number().default(5).describe('Number of results to return')
  },
  async ({ query, match_count }, extra) => {
    try {
      const credentials = extra.credentials || getSessionCredentials(extra.sessionId, extra.sessionCredentialsMap);
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

// Register the get_files tool
server.tool(
  'get_files',
  'Get list of all documents in the knowledge base',
  {},
  async (_, extra) => {
    try {
      const credentials = extra.credentials || getSessionCredentials(extra.sessionId, extra.sessionCredentialsMap);
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

// Register the get_document tool
server.tool(
  'get_document',
  'Get the content of a specific document by its ID',
  {
    document_id: z.string().describe('The UUID of the document to retrieve')
  },
  async ({ document_id }, extra) => {
    try {
      const credentials = extra.credentials || getSessionCredentials(extra.sessionId, extra.sessionCredentialsMap);
      const result = await getDocument({ document_id, credentials });
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
  'Delete a document and its chunks from the knowledge base',
  {
    document_id: z.string().describe('The UUID of the document to delete')
  },
  async ({ document_id }, extra) => {
    try {
      const credentials = extra.credentials || getSessionCredentials(extra.sessionId, extra.sessionCredentialsMap);
      const result = await deleteDocument({ document_id, credentials });
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
  async ({ document_ids }, extra) => {
    try {
      const credentials = extra.credentials || getSessionCredentials(extra.sessionId, extra.sessionCredentialsMap);
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