# MCP Knowledge Base Server

A Model Context Protocol (MCP) server that enables semantic search and document management using your own Supabase and OpenAI accounts.

**Live Demo**: `https://mcp-supabase.max-smosarski.workers.dev`

## Features

- 📄 Upload and process documents (text, PDF, images)
- 🔍 Semantic search across your knowledge base
- 🖼️ AI-powered image description and search
- 🔐 Use your own API keys - no shared credentials
- ☁️ Deploy to Cloudflare Workers or run locally
- 🌍 Edge computing with Durable Objects
- 👥 Multi-tenant support via request headers

## Quick Start

```bash
# Clone the repository
git clone https://github.com/maxsmosarski/mcp-knowledge-base.git
cd mcp-server

# Install dependencies
npm install

# Option 1: Run locally
npm start

# Option 2: Deploy to Cloudflare Workers
wrangler login
wrangler deploy
```

## Three Implementations

This repository contains three implementations of the MCP server:

### 1. HTTP Server (`src/mcp-server.js`)
- Uses `@modelcontextprotocol/sdk` with StreamableHTTPServerTransport
- Runs as an HTTP server on port 3000 (configurable)
- Perfect for API integrations and web clients
- Can be deployed to any Node.js hosting environment

### 2. STDIO Server (`src/stdio-server.js`)
- Uses `@modelcontextprotocol/sdk` with StdioServerTransport
- Communicates via standard input/output
- Designed for Claude Desktop and CLI integrations
- Ideal for local tool usage

### 3. Cloudflare Workers (`src/mcp-agent.js`)
- Uses Cloudflare's `agents` SDK (v0.0.109) with native Worker support
- Implements McpAgent with Durable Objects for stateful sessions
- Credentials passed via request headers for multi-tenant support
- Provides both SSE (`/sse`) and streamable HTTP (`/mcp`) endpoints
- Live deployment: `https://mcp-supabase.max-smosarski.workers.dev`

## Prerequisites

- Supabase account with a configured database
- OpenAI API key
- Node.js 18+ (for local development)
- Cloudflare account (free tier works) for Workers deployment
- Wrangler CLI (`npm install -g wrangler`) for deployment

## Supabase Setup

Create a new Supabase project and run these SQL commands in the SQL editor:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  content TEXT,
  content_type TEXT NOT NULL DEFAULT 'text',
  file_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create document chunks table for semantic search
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create search function
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding vector(1536),
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  filename TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    d.filename,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE 1 - (dc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create storage bucket for images (in Supabase Dashboard > Storage)
-- Create a bucket named 'images' with public access
```

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd mcp-server

# Install dependencies
npm install
```

## Running Locally

### Option 1: HTTP Server (for API access)

```bash
# Set environment variables (optional defaults)
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-supabase-key"
export OPENAI_API_KEY="your-openai-key"

# Start the HTTP server
npm start
# Server runs on http://localhost:3000

# Development mode with auto-reload
npm run dev
```

### Option 2: STDIO Server (for Claude Desktop)

Run directly:
```bash
# Set environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-supabase-key"
export OPENAI_API_KEY="your-openai-key"

# Start STDIO server
npm run start:stdio
```

Or add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "knowledge-base": {
      "command": "node",
      "args": ["/path/to/mcp-server/start-stdio.js"],
      "env": {
        "SUPABASE_URL": "your-supabase-url",
        "SUPABASE_SERVICE_KEY": "your-supabase-key",
        "OPENAI_API_KEY": "your-openai-key"
      }
    }
  }
}
```

## Deploying to Cloudflare Workers

### Using the Agents SDK Implementation

1. **Login to Cloudflare:**
```bash
wrangler login
```

2. **Deploy the Worker:**
```bash
# Deploy to production
npm run deploy

# Or use wrangler directly
wrangler deploy

# Development server (local testing)
npm run deploy:dev
```

3. **Important Notes:**
- Uses Durable Objects for stateful MCP sessions
- Free tier requires `new_sqlite_classes` in migrations
- Credentials are passed via headers, not environment variables
- Each request must include credential headers

The deployed worker will be available at:
- Health check: `https://your-worker.workers.dev/`
- SSE endpoint: `https://your-worker.workers.dev/sse`
- MCP endpoint: `https://your-worker.workers.dev/mcp`

### Cloudflare Configuration

**Note:** The Cloudflare Workers implementation uses request headers for credentials, not environment variables. This allows multi-tenant usage where each user provides their own API keys.

**Required Headers for Each Request:**
- `x-supabase-url`: Your Supabase project URL
- `x-supabase-key`: Your Supabase service key
- `x-openai-key`: Your OpenAI API key

**Durable Objects Configuration (in `wrangler.toml`):**
```toml
[[durable_objects.bindings]]
name = "MCP_OBJECT"
class_name = "KnowledgeBaseMCP"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["KnowledgeBaseMCP"]  # Required for free tier
```

## Usage

### API Examples

#### 1. Initialize MCP Session (Required First)
```javascript
const response = await fetch('https://mcp-supabase.max-smosarski.workers.dev/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'x-supabase-url': 'https://your-project.supabase.co',
    'x-supabase-key': 'your-service-key',
    'x-openai-key': 'sk-...'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: { protocolVersion: '2025-06-18' },
    id: 1
  })
});
// Save the session ID from response headers
const sessionId = response.headers.get('Mcp-Session-Id');
```

#### 2. Search Documents
```javascript
fetch('https://mcp-supabase.max-smosarski.workers.dev/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Mcp-Session-Id': sessionId,
    'x-supabase-url': 'https://your-project.supabase.co',
    'x-supabase-key': 'your-service-key',
    'x-openai-key': 'sk-...'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'search_chunks',
      arguments: { query: 'your search query', match_count: 5 }
    },
    id: 2
  })
});
```

#### 3. List All Files
```javascript
fetch('https://mcp-supabase.max-smosarski.workers.dev/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Mcp-Session-Id': sessionId,
    'x-supabase-url': 'https://your-project.supabase.co',
    'x-supabase-key': 'your-service-key',
    'x-openai-key': 'sk-...'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'get_files',
      arguments: {}
    },
    id: 3
  })
});
```


### For Local MCP Server
```env
MCP_SERVER_URL=http://localhost:3000/mcp
```

### For Cloudflare Workers
```env
MCP_SERVER_URL=https://mcp-supabase.max-smosarski.workers.dev/mcp
# Also set your credentials in .env:
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-key
OPENAI_API_KEY=your-openai-key
```

The middle layer automatically passes credentials as headers to the Cloudflare Worker.

## Available Tools

- `upload_document` - Upload text or PDF documents
- `upload_image` - Upload and analyze images
- `search_chunks` - Semantic search across documents
- `get_files` - List all documents
- `get_document` - Retrieve specific document
- `delete_document` - Delete a document
- `delete_documents` - Bulk delete documents

## Directory Structure

```
mcp-server/
├── src/
│   ├── mcp-server.js       # Standard MCP implementation
│   ├── mcp-agent.js        # Cloudflare Agents SDK implementation
│   ├── stdio-server.js     # STDIO transport implementation
│   ├── index.js            # REST API wrapper
│   ├── tools/              # Tool implementations
│   │   ├── upload-document.js
│   │   ├── upload-image.js
│   │   ├── search-chunks.js
│   │   ├── get-files.js
│   │   ├── get-document.js
│   │   ├── delete-document.js
│   │   └── delete-documents.js
│   └── services/           # Service implementations
│       ├── supabase.js
│       └── openai.js
├── wrangler.toml           # Cloudflare Workers configuration
│                           # Includes Durable Objects bindings
├── package.json
├── start-mcp.js            # MCP server starter
├── start-stdio.js          # STDIO server starter
└── README.md
```

## Environment Variables

### For Local Development (HTTP/STDIO servers):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service key
- `OPENAI_API_KEY` - Your OpenAI API key
- `MCP_PORT` - Port for HTTP server (default: 3000)

### For Cloudflare Workers:
Credentials are passed via request headers, not environment variables:
- `x-supabase-url` - Supabase URL in request header
- `x-supabase-key` - Supabase key in request header
- `x-openai-key` - OpenAI key in request header

This design allows multiple users to use the same deployment with their own credentials.

## Testing

```bash
# Test Supabase connection
npm run test:supabase

# Full MCP test suite
npm run test:full

# Test with MCP client
npm run test:client

# Database utilities
npm run db:clean  # Clean test data
npm run db:debug  # Debug database state
```

## Troubleshooting

### Cloudflare Workers Issues

1. **"Invalid binding" error**: 
   - Ensure Durable Objects are configured in `wrangler.toml`
   - Use `new_sqlite_classes` for free tier accounts
   - Check that the binding name matches (`MCP_OBJECT`)

2. **"Missing credentials" error**:
   - Ensure request headers include all required credentials
   - Check middle layer is passing credentials in headers
   - Verify credential values are correct

3. **Build errors with duplicate exports**:
   - Don't re-export classes that use `export class`
   - Check for multiple exports of the same name

4. **405 Method Not Allowed**:
   - Normal for GET/DELETE on certain endpoints
   - MCP protocol uses specific HTTP methods

5. **Durable Objects on free tier**:
   - Must use `new_sqlite_classes` instead of `new_classes`
   - Error code 10097 indicates this issue

### Local Development Issues

1. **Port conflicts**: Change the port using `MCP_PORT` environment variable
2. **Credential issues**: Ensure all environment variables are set correctly
3. **CORS errors**: The server includes appropriate CORS headers

## Migration Guide

### From Local to Cloudflare Workers

1. **Update middle layer `.env`:**
   ```env
   # Change from:
   MCP_SERVER_URL=http://localhost:3000/mcp
   # To:
   MCP_SERVER_URL=https://mcp-supabase.max-smosarski.workers.dev/mcp
   ```

2. **Ensure credentials in middle layer `.env`:**
   ```env
   SUPABASE_URL=your-url
   SUPABASE_SERVICE_KEY=your-key
   OPENAI_API_KEY=your-key
   ```

3. **Deploy to Cloudflare:**
   ```bash
   wrangler deploy
   ```