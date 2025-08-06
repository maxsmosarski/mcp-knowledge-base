#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
    try {
      const result = await searchChunks({ query, match_count });
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
  async () => {
    try {
      const result = await getFiles({});
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
  'Get a specific document by filename or id',
  {
    filename: z.string().optional().describe('The filename of the document'),
    id: z.string().optional().describe('The UUID of the document')
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
  'Delete a document by filename or id',
  {
    filename: z.string().optional().describe('The filename to delete'),
    id: z.string().optional().describe('The UUID to delete')
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
  'Delete multiple documents by their IDs',
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

// Create stdio transport
const transport = new StdioServerTransport();

// Connect server to transport
server.connect(transport).catch(error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});