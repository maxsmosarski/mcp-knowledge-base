# MCP Knowledge Base Server

A Model Context Protocol (MCP) server that enables semantic search and document management using your own Supabase and OpenAI accounts.

## Features

- 📄 Upload and process documents (text, PDF, images)
- 🔍 Semantic search across your knowledge base
- 🖼️ AI-powered image description and search
- 🔐 Use your own API keys - no shared credentials
- ☁️ Deploy to Cloudflare Workers or run locally

## Two Implementations

This repository contains two implementations of the MCP server:

### 1. Local/Standard MCP Server (`src/mcp-server.js`)
- Uses the standard `@modelcontextprotocol/sdk` with StreamableHTTPServerTransport
- Runs locally with Node.js
- Perfect for local development and testing
- Can be deployed to any Node.js hosting environment

### 2. Cloudflare Workers MCP Server (`src/mcp-agent.js`)
- Uses Cloudflare's `agents` SDK with native Worker support
- Designed specifically for Cloudflare Workers deployment
- No mock objects needed - native Fetch API support
- Provides both SSE and streamable HTTP endpoints

## Prerequisites

- Supabase account with a configured database
- OpenAI API key
- Node.js 18+ (for local development)

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

## Local Development

### Option 1: MCP Server (HTTP)

```bash
# Set environment variables (optional defaults)
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-supabase-key"
export OPENAI_API_KEY="your-openai-key"

# Start the server
npm start
# Server runs on http://localhost:3000

# Development mode with auto-reload
npm run dev
```

### Option 2: STDIO Mode (for Claude Desktop)

Add to your Claude Desktop configuration:

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

```bash
# Deploy to production
npm run deploy:agents

# Or use wrangler directly
wrangler deploy --config wrangler-agents.toml

# Development server (local testing)
npm run dev:agents
```

The deployed worker will be available at:
- Health check: `https://your-worker.workers.dev/`
- SSE endpoint: `https://your-worker.workers.dev/sse`
- MCP endpoint: `https://your-worker.workers.dev/mcp`

### Setting Cloudflare Secrets

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put OPENAI_API_KEY
```

## Usage

### With Your Own Credentials

Send your API keys with each request via headers:

```javascript
fetch('https://your-server.workers.dev/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-supabase-url': 'https://your-project.supabase.co',
    'x-supabase-key': 'your-service-key',
    'x-openai-key': 'sk-...'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/search_chunks',
    params: {
      query: 'your search query'
    },
    id: 1
  })
});
```

## Using with Middle Layer

The middle layer server (`middle-layer/server.py`) can connect to either implementation:

### For Local MCP Server
```env
MCP_URL=http://localhost:3000/mcp
```

### For Cloudflare Workers
```env
MCP_URL=https://your-worker.workers.dev/mcp
MCP_USE_HEADERS=true
```

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
│   ├── mcp-handler.js      # Legacy Worker handler (deprecated)
│   ├── server-definition.js # Shared server definition
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
├── wrangler.toml           # Cloudflare config for legacy handler
├── wrangler-agents.toml    # Cloudflare config for Agents SDK
├── package.json
└── README.md
```

## Environment Variables (Optional)

If you want to set default credentials:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service key
- `OPENAI_API_KEY` - Your OpenAI API key

Note: Request headers always override environment variables.

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

1. **Double JSON encoding**: Fixed in the Agents SDK implementation
2. **Mock request issues**: Eliminated by using native Agents SDK
3. **SSE streaming**: Fully supported via `/sse` endpoint

### Local Development Issues

1. **Port conflicts**: Change the port using `MCP_PORT` environment variable
2. **Credential issues**: Ensure all environment variables are set correctly
3. **CORS errors**: The server includes appropriate CORS headers

## Migration Guide

### From Legacy Handler to Agents SDK

The new Agents SDK implementation (`mcp-agent.js`) is the recommended approach for Cloudflare Workers:

1. Uses native Worker APIs without mock objects
2. Better performance and compatibility
3. Cleaner code structure extending `McpAgent`
4. Supports both SSE and streamable HTTP transports

To migrate:
1. Update your `wrangler.toml` to point to `src/mcp-agent.js`
2. Or use the provided `wrangler-agents.toml` configuration
3. Deploy using `npm run deploy:agents`

## License

MIT