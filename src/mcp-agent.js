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
        file_path: z.string().optional().describe('Path to the image file (for compatibility, will fail in Workers)'),
        file_base64: z.string().optional().describe('Base64-encoded image data (required for Cloudflare Workers)'),
        original_filename: z.string().describe('Original filename with extension')
      },
      async ({ file_path, file_base64, original_filename }) => {
        try {
          console.log('[mcp-agent] upload_image called with:', {
            has_file_path: !!file_path,
            has_file_base64: !!file_base64,
            original_filename
          });
          
          const credentials = getCredentials();
          
          // Check if we're in Cloudflare Workers (no file system access)
          if (file_path && !file_base64) {
            // This won't work in Cloudflare Workers
            console.error('[mcp-agent] file_path provided but no file_base64 - this will fail in Cloudflare Workers');
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'File paths are not supported in Cloudflare Workers. Please provide base64-encoded image data instead.',
                  hint: 'The middle layer should read the file and convert it to base64 before sending to the MCP server.'
                }, null, 2)
              }],
              isError: true
            };
          }
          
          if (!file_base64) {
            throw new Error('file_base64 is required for image upload in Cloudflare Workers');
          }
          
          // Convert base64 to Uint8Array for Cloudflare Workers
          console.log('[mcp-agent] Converting base64 to Uint8Array...');
          let bytes;
          try {
            // Remove data URL prefix if present
            const base64Data = file_base64.includes(',') 
              ? file_base64.split(',')[1] 
              : file_base64;
            
            const binaryString = atob(base64Data);
            bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('[mcp-agent] Converted base64 to Uint8Array, size:', bytes.length);
          } catch (base64Error) {
            console.error('[mcp-agent] Base64 conversion error:', base64Error);
            throw new Error(`Invalid base64 data: ${base64Error.message}`);
          }
          
          const result = await uploadImage({ 
            file_data: bytes, 
            original_filename, 
            credentials 
          });
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          console.error('[mcp-agent] upload_image error:', error);
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}\nDetails: ${error.stack}`
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

// Export the default Worker handler
export default {
  /**
   * Cloudflare Worker fetch handler
   * Routes requests to the appropriate MCP transport
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`[Worker] ${request.method} ${url.pathname}`);
    
    // Extract credentials from headers for this request
    const credentials = {
      supabaseUrl: request.headers.get('x-supabase-url'),
      supabaseKey: request.headers.get('x-supabase-key'),
      openaiKey: request.headers.get('x-openai-key')
    };
    console.log('[Worker] Credentials provided:', {
      supabaseUrl: credentials.supabaseUrl ? 'yes' : 'no',
      supabaseKey: credentials.supabaseKey ? 'yes' : 'no',
      openaiKey: credentials.openaiKey ? 'yes' : 'no'
    });
    
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
      console.log('[Worker] Handling MCP request');
      try {
        const response = await KnowledgeBaseMCP.serve('/mcp').fetch(request, env, ctx);
        console.log('[Worker] MCP response status:', response.status);
        return response;
      } catch (error) {
        console.error('[Worker] MCP handler error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 404 for unknown paths
    return new Response('Not Found', { status: 404 });
  }
};