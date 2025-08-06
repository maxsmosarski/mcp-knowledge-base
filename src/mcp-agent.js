/**
 * MCP Knowledge Base Server - Cloudflare Agents SDK Implementation
 * This is the Cloudflare Workers version using the Agents SDK
 */

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Import our tool implementations
import { uploadDocument } from './tools/upload-document.js';
import { uploadImage } from './tools/upload-image.js';
import { searchChunks } from './tools/search-chunks.js';
import { getFiles } from './tools/get-files.js';
import { getDocument } from './tools/get-document.js';
import { deleteDocument } from './tools/delete-document.js';
import { deleteDocuments } from './tools/delete-documents.js';

/**
 * Knowledge Base MCP Agent
 * Extends McpAgent for native Cloudflare Worker support
 */
export class KnowledgeBaseMCP extends McpAgent {
  server = new McpServer({
    name: 'knowledge-base',
    version: '1.0.0',
    description: 'MCP server for document upload and semantic search with Supabase'
  });

  /**
   * Initialize all tools
   * Called when the agent starts
   */
  async init() {
    // Get credentials from request headers (passed via this.props)
    const getCredentials = () => ({
      supabaseUrl: this.props?.supabaseUrl,
      supabaseKey: this.props?.supabaseKey,
      openaiKey: this.props?.openaiKey,
    });

    // Register upload_document tool
    this.server.tool(
      'upload_document',
      'Upload a document to the knowledge base',
      { file_path: z.string().describe('Path to the file to upload') },
      async ({ file_path }) => {
        try {
          const credentials = getCredentials();
          const result = await uploadDocument({ file_path, credentials });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Register upload_image tool
    this.server.tool(
      'upload_image',
      'Upload an image file and generate AI description for search',
      {
        file_path: z.string().describe('Path to the image file to upload'),
        original_filename: z.string().optional().describe('Original filename to preserve')
      },
      async ({ file_path, original_filename }) => {
        try {
          const credentials = getCredentials();
          const result = await uploadImage({ file_path, original_filename, credentials });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Register search_chunks tool
    this.server.tool(
      'search_chunks',
      'Search for similar chunks in the knowledge base',
      {
        query: z.string().describe('Search query text'),
        match_count: z.number().default(5).describe('Number of results to return')
      },
      async ({ query, match_count }) => {
        try {
          const credentials = getCredentials();
          const result = await searchChunks({ query, match_count, credentials });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Register get_files tool
    this.server.tool(
      'get_files',
      'Get list of all documents in the knowledge base',
      {},
      async () => {
        try {
          const credentials = getCredentials();
          const result = await getFiles({ credentials });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Register get_document tool
    this.server.tool(
      'get_document',
      'Get a specific document by filename or id',
      {
        filename: z.string().optional().describe('The filename of the document'),
        id: z.string().optional().describe('The UUID of the document')
      },
      async ({ filename, id }) => {
        try {
          const credentials = getCredentials();
          const result = await getDocument({ filename, id, credentials });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Register delete_document tool
    this.server.tool(
      'delete_document',
      'Delete a document by filename or id',
      {
        filename: z.string().optional().describe('The filename to delete'),
        id: z.string().optional().describe('The UUID to delete')
      },
      async ({ filename, id }) => {
        try {
          const credentials = getCredentials();
          const result = await deleteDocument({ filename, id, credentials });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Register delete_documents tool
    this.server.tool(
      'delete_documents',
      'Delete multiple documents by their IDs',
      {
        document_ids: z.array(z.string()).describe('Array of document UUIDs to delete')
      },
      async ({ document_ids }) => {
        try {
          const credentials = getCredentials();
          const result = await deleteDocuments({ document_ids, credentials });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );
  }
}

// Export the Durable Object class for Cloudflare
export { KnowledgeBaseMCP };

// Export the default Worker handler
export default {
  /**
   * Cloudflare Worker fetch handler
   * Routes requests to the appropriate MCP transport
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Extract credentials from headers for this request
    const credentials = {
      supabaseUrl: request.headers.get('x-supabase-url'),
      supabaseKey: request.headers.get('x-supabase-key'),
      openaiKey: request.headers.get('x-openai-key')
    };
    
    // Store credentials in context for the Durable Object
    ctx.props = credentials;
    
    // Health check endpoint
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        name: 'knowledge-base',
        version: '1.0.0',
        status: 'running',
        type: 'MCP Server (Cloudflare Agents SDK)',
        endpoints: {
          sse: '/sse',
          streamable: '/mcp'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // SSE endpoint (legacy support)
    if (url.pathname === '/sse') {
      return KnowledgeBaseMCP.serveSSE('/sse').fetch(request, env, ctx);
    }
    
    // Streamable HTTP endpoint (recommended)
    if (url.pathname === '/mcp') {
      return KnowledgeBaseMCP.serve('/mcp').fetch(request, env, ctx);
    }
    
    // 404 for unknown paths
    return new Response('Not Found', { status: 404 });
  }
};