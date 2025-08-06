/**
 * MCP Server with Express HTTP Transport
 * For local development and non-Cloudflare deployments
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { server } from './server-definition.js';

// Create Express app
const app = express();
app.use(express.json());

// Store transports for each session
const transports = {};
const sessionCredentials = {};

// MCP endpoint
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const body = req.body;
  
  console.log('MCP request:', body.method, 'Session:', sessionId);
  
  // Reuse existing transport for session
  if (sessionId && transports[sessionId]) {
    const transport = transports[sessionId];
    
    // Pass credentials through extra context
    transport.extra = { 
      ...transport.extra, 
      credentials: sessionCredentials[sessionId]
    };
    
    await transport.handleRequest(req, res, body);
    return;
  }
  
  // Create new transport for initialization requests
  if (!sessionId && isInitializeRequest(body)) {
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      enableDnsRebindingProtection: false,
      allowedOrigins: ['*']
    });
    
    // Store credentials from environment
    const credentials = {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_KEY,
      openaiKey: process.env.OPENAI_API_KEY,
    };
    
    // Pass credentials through extra context
    transport.extra = { credentials };
    
    // Connect the transport to the server
    await server.connect(transport);
    
    // Store transport and credentials
    transports[newSessionId] = transport;
    sessionCredentials[newSessionId] = credentials;
    
    // Handle the initialization request
    await transport.handleRequest(req, res, body);
    return;
  }
  
  // Invalid request
  res.status(400).json({ 
    error: 'Invalid request: Missing session ID or not an initialize request' 
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'knowledge-base',
    version: '1.0.0',
    status: 'running',
    type: 'MCP Server (Express)',
    endpoint: '/mcp'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});