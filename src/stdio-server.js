#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { uploadDocument } from './tools/upload-document.js';
import { uploadImage } from './tools/upload-image.js';
import { searchChunks } from './tools/search-chunks.js';

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

// Create stdio transport
const transport = new StdioServerTransport();

// Connect server to transport
server.connect(transport).catch(error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});