/**
 * MCP Request Handler for Cloudflare Workers
 * Handles MCP protocol requests without Express dependencies
 */

import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { server } from './server-definition.js';

// Store transports and credentials for each session
const transports = new Map();
const sessionCredentials = new Map();

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
      let responseHeaders = {};
      const mockRes = {
        _headersSent: false,
        _status: 200,
        _eventHandlers: {},
        
        writeHead: function(status, headers = {}) {
          this._status = status;
          responseHeaders = { ...responseHeaders, ...headers };
          this._headersSent = true;
          return this;
        },
        
        status: function(code) {
          this._status = code;
          return this;
        },
        
        setHeader: function(key, value) {
          responseHeaders[key] = value;
          return this;
        },
        
        write: function(data) {
          if (typeof data === 'string') {
            responseData = (responseData || '') + data;
          }
          return true;
        },
        
        end: function(data) {
          if (data) {
            if (typeof data === 'string') {
              responseData = (responseData || '') + data;
            } else {
              responseData = data;
            }
          }
          this._headersSent = true;
        },
        
        json: function(data) {
          responseData = data;
          this._headersSent = true;
        },
        
        flushHeaders: function() {
          this._headersSent = true;
          return this;
        },
        
        on: function(event, callback) {
          if (!this._eventHandlers[event]) {
            this._eventHandlers[event] = [];
          }
          this._eventHandlers[event].push(callback);
          return this;
        },
        
        get headersSent() {
          return this._headersSent;
        }
      };
      
      // Pass credentials through extra context
      transport.extra = { 
        ...transport.extra, 
        credentials, 
        sessionCredentialsMap: sessionCredentials 
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
      
      // Pass credentials through extra context
      transport.extra = { 
        credentials, 
        sessionCredentialsMap: sessionCredentials 
      };
      
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
      let responseHeaders = {};
      const mockRes = {
        _headersSent: false,
        _status: 200,
        _eventHandlers: {},
        
        writeHead: function(status, headers = {}) {
          this._status = status;
          responseHeaders = { ...responseHeaders, ...headers };
          this._headersSent = true;
          return this;
        },
        
        status: function(code) {
          this._status = code;
          return this;
        },
        
        setHeader: function(key, value) {
          responseHeaders[key] = value;
          return this;
        },
        
        write: function(data) {
          if (typeof data === 'string') {
            responseData = (responseData || '') + data;
          }
          return true;
        },
        
        end: function(data) {
          if (data) {
            if (typeof data === 'string') {
              responseData = (responseData || '') + data;
            } else {
              responseData = data;
            }
          }
          this._headersSent = true;
        },
        
        json: function(data) {
          responseData = data;
          this._headersSent = true;
        },
        
        flushHeaders: function() {
          this._headersSent = true;
          return this;
        },
        
        on: function(event, callback) {
          if (!this._eventHandlers[event]) {
            this._eventHandlers[event] = [];
          }
          this._eventHandlers[event].push(callback);
          return this;
        },
        
        get headersSent() {
          return this._headersSent;
        }
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