# MCP Knowledge Base Server

A Model Context Protocol (MCP) server that enables semantic search and document management using your own Supabase and OpenAI accounts.

## Features

- 📄 Upload and process documents (text, PDF, images)
- 🔍 Semantic search across your knowledge base
- 🖼️ AI-powered image description and search
- 🔐 Use your own API keys - no shared credentials
- ☁️ Deploy to Cloudflare Workers or run locally

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

## Available Tools

- `upload_document` - Upload text or PDF documents
- `upload_image` - Upload and analyze images
- `search_chunks` - Semantic search across documents
- `get_files` - List all documents
- `get_document` - Retrieve specific document
- `delete_document` - Delete a document
- `delete_documents` - Bulk delete documents

## Environment Variables (Optional)

If you want to set default credentials:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service key
- `OPENAI_API_KEY` - Your OpenAI API key

Note: Request headers always override environment variables.
