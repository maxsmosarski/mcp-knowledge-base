/**
 * Cloudflare Worker entry point for MCP Knowledge Base Server
 * This wraps the MCP server for deployment on Cloudflare Workers
 */

import { handleMcpRequest } from './mcp-handler.js';

// Cloudflare Worker fetch handler
export default {
  async fetch(request, env, ctx) {
    // Set environment variables from Worker secrets (optional defaults)
    if (env.SUPABASE_URL) process.env.SUPABASE_URL = env.SUPABASE_URL;
    if (env.SUPABASE_SERVICE_KEY) process.env.SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
    if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
    
    const url = new URL(request.url);
    
    try {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, x-supabase-url, x-supabase-key, x-openai-key',
            'Access-Control-Expose-Headers': 'Mcp-Session-Id'
          }
        });
      }
      
      // Process the request
      if (url.pathname === '/') {
        // Health check endpoint
        return new Response(JSON.stringify({
          name: 'knowledge-base',
          version: '1.0.0',
          status: 'running',
          type: 'MCP Server (Cloudflare Worker)',
          endpoint: '/mcp'
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } else if (url.pathname === '/mcp') {
        // Handle MCP requests
        return await handleMcpRequest(request, env);
      }
      
      // 404 for other routes
      return new Response('Not Found', { status: 404 });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};