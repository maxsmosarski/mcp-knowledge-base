# MCP Server - Supabass Knowledge Base

Model Context Protocol (MCP) server that provides comprehensive document management and semantic search capabilities using Supabase and OpenAI.

## Features

- 📄 **Document Management** - Upload, list, and delete documents with automatic chunking
- 📃 **PDF Support** - Full text extraction and embedded image extraction from PDFs
- 🔍 **Semantic Search** - Vector similarity search using pgvector across all content
- 🖼️ **Image Analysis** - Automatic image description with GPT-4 Vision
- 🔗 **Document Relationships** - Track relationships between PDFs and extracted images
- 🔧 **MCP Tools** - Standardized tool interface for LLMs
- 🚀 **Multiple Transports** - Supports stdio and Streamable HTTP
- 💾 **Supabase Integration** - PostgreSQL with vector embeddings

## Tech Stack

- **Node.js** - Server runtime with ES modules
- **MCP SDK** - Model Context Protocol implementation
- **Supabase** - PostgreSQL database with pgvector
- **OpenAI API** - Embeddings (text-embedding-3-small) and image analysis (GPT-4 Vision)
- **Express** - HTTP server for Streamable transport
- **pdfjs-dist** - PDF text extraction
- **pdf-lib** - PDF manipulation and image extraction
- **sharp** - Image processing and conversion

## Prerequisites

- Node.js 18+
- Supabase project with pgvector extension enabled
- OpenAI API key with GPT-4 Vision access

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   Create `.env` file:
   ```env
   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   
   # Supabase Configuration
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   
   # Server Configuration (optional)
   PORT=3000
   ```

3. **Set up database**
   - Enable pgvector extension in Supabase
   - Run the schema files in order:
     ```sql
     -- Run in Supabase SQL editor
     -- 1. First run schema.sql
     -- 2. Then run add_document_relationships.sql
     ```
   - Create storage bucket named 'documents' (if using images)

4. **Start the server**
   ```bash
   # For HTTP transport (recommended for web apps)
   npm start
   # or
   npm run start:mcp
   
   # For stdio transport (Claude Desktop)
   npm run start:stdio
   ```

## Project Structure

```
mcp-server/
├── src/
│   ├── mcp-server.js        # HTTP transport server
│   ├── stdio-server.js      # stdio transport server
│   ├── services/
│   │   ├── supabase.js      # Supabase client initialization
│   │   └── openai.js        # OpenAI integration & utilities
│   └── tools/
│       ├── upload-document.js    # Document upload with PDF support
│       ├── upload-image.js       # Image upload with AI analysis
│       ├── search-chunks.js      # Semantic search
│       ├── get-files.js         # List all documents
│       ├── get-document.js      # Get specific document
│       ├── delete-document.js   # Delete single document
│       └── delete-documents.js  # Bulk delete documents
├── start-mcp.js             # HTTP server entry point
├── start-stdio.js           # stdio server entry point
├── test-files/              # Sample documents for testing
└── package.json
```

## Available MCP Tools

### 1. `upload_document`
Upload text documents and PDFs to the knowledge base.
```json
{
  "file_path": "/path/to/document.pdf"
}
```
- Supports: `.txt`, `.md`, `.json`, `.csv`, `.pdf`
- PDF features:
  - Extracts all text content with Unicode handling
  - Extracts embedded images as separate documents
  - Maintains parent-child relationships
- Automatically chunks large documents (500 words)
- Generates embeddings for each chunk

### 2. `upload_image`
Upload images with automatic AI description.
```json
{
  "file_path": "/path/to/image.jpg",
  "original_filename": "vacation_photo.jpg"
}
```
- Supports: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
- Uses GPT-4 Vision to generate:
  - Caption (1 sentence)
  - Summary (2-3 sentences)
  - Detailed description (paragraph)
  - List of objects
  - Searchable tags
- Creates searchable text chunks from image content

### 3. `search_documents`
Search for similar content using natural language.
```json
{
  "query": "recipes with pasta",
  "match_count": 5,
  "similarity_threshold": 0.7
}
```
- Searches across all document types and image descriptions
- Returns most similar chunks with similarity scores
- Includes document metadata and file URLs for images
- Configurable similarity threshold (0-1)

### 4. `get_files`
List all documents in the knowledge base.
```json
{}
```
- Returns document list with metadata
- Shows file types, sizes, and content types
- Includes creation timestamps
- Supports filtering by content type

### 5. `get_document`
Retrieve a specific document by filename or ID.
```json
{
  "filename": "cookbook.pdf"
}
```
- Returns full document content
- Includes file_url for images
- Shows metadata and chunk count
- Supports lookup by filename or UUID

### 6. `delete_document`
Delete a single document and all related data.
```json
{
  "document_id": "123e4567-e89b-12d3-a456-426614174000"
}
```
- Removes document and all chunks
- Cascades to related documents (e.g., PDF's extracted images)
- Returns deletion confirmation

### 7. `delete_documents`
Bulk delete multiple documents.
```json
{
  "document_ids": ["id1", "id2", "id3"]
}
```
- Efficient bulk deletion
- Maintains referential integrity
- Returns count of deleted documents

## Transport Options

### Streamable HTTP (Default)
- Best for web applications
- Supports session management
- Available at `http://localhost:3000/mcp`

### stdio (Claude Desktop)
- For direct integration with Claude Desktop
- Add to Claude Desktop config:
  ```json
  {
    "mcpServers": {
      "supabass": {
        "command": "node",
        "args": ["/path/to/mcp-server/start-stdio.js"],
        "env": {
          "OPENAI_API_KEY": "your-key",
          "SUPABASE_URL": "your-url",
          "SUPABASE_SERVICE_KEY": "your-key"
        }
      }
    }
  }
  ```

## Database Schema

### documents table
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  content TEXT,
  content_type TEXT DEFAULT 'text',
  file_url TEXT,
  file_type TEXT,
  file_size INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### document_chunks table
```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### document_relationships table
```sql
CREATE TABLE document_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  child_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## PDF Processing Pipeline

1. **Text Extraction**: Uses pdfjs-dist to extract text from all pages
2. **Unicode Handling**: Cleans control characters and handles escape sequences
3. **Image Extraction**: Attempts to extract embedded images (currently limited)
4. **Chunking**: Splits text into 500-word chunks for embedding
5. **Relationship Tracking**: Links PDF to any extracted images
6. **Metadata Storage**: Preserves PDF metadata (page count, etc.)

## Image Processing Pipeline

1. **Upload**: Image stored in Supabase storage bucket
2. **Analysis**: GPT-4 Vision generates structured description
3. **Chunking**: Creates multiple searchable chunks:
   - Caption (1 sentence)
   - Summary (2-3 sentences)  
   - Detailed description (2-3 paragraphs)
   - Objects list
   - Tags
4. **Embedding**: Each chunk gets vector embedding
5. **Storage**: Chunks stored with document reference

## Development

### Running in Development
```bash
# HTTP server with auto-reload
npm run dev

# stdio server with auto-reload
npm run dev:stdio
```

### Testing
```bash
# Test Supabase connection
npm run test:supabase

# Full integration test
npm run test:full

# Test MCP client connection
npm run test:client

# Clean database
npm run db:clean

# Debug database state
npm run db:debug
```

### Adding New Tools

1. Create tool file in `/src/tools/`:
```javascript
export async function myTool({ param1, param2 }) {
  // Implementation
}

export const myToolTool = {
  name: 'my_tool',
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter 1' },
      param2: { type: 'number', description: 'Parameter 2' }
    },
    required: ['param1']
  }
};
```

2. Import and register in server files

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPENAI_API_KEY` | OpenAI API key | - | Yes |
| `OPENAI_EMBEDDING_MODEL` | Embedding model | text-embedding-3-small | No |
| `SUPABASE_URL` | Supabase project URL | - | Yes |
| `SUPABASE_SERVICE_KEY` | Service role key (not anon) | - | Yes |
| `PORT` | HTTP server port | 3000 | No |

### OpenAI Models
- Embeddings: `text-embedding-3-small` (1536 dimensions)
- Image analysis: `gpt-4o` (with vision)
- Text processing: `gpt-4o-mini`

## Troubleshooting

### Common Issues

**PDF Upload Errors**
- "unsupported Unicode escape sequence": Fixed with text cleaning
- "no such file" during startup: Use pdfjs-dist instead of pdf-parse
- Background images not extracted: Known limitation of current implementation

**Search not returning results**
- Check pgvector extension is enabled
- Verify embeddings were generated (check document_chunks table)
- Try lowering similarity threshold

**Image upload fails**
- Ensure Supabase storage bucket 'documents' exists
- Check file size (Supabase default limit: 50MB)
- Verify GPT-4 Vision access in OpenAI account

**Connection errors**
- Verify all environment variables are set
- Check Supabase project is active (not paused)
- Ensure service role key is used (not anon key)

### Debug Commands
```bash
# Check database connection
npm run test:supabase

# View server logs with verbose output
npm start -- --verbose

# Debug database state
npm run db:debug
```

## Performance Tips

- **Chunking**: Default 500 words per chunk, adjustable in code
- **PDF Processing**: Large PDFs may take time, consider async processing
- **Batch Operations**: Use bulk delete for multiple files
- **Embeddings**: Consider caching for frequently accessed content
- **Indexing**: Ensure database indexes on document_id and embedding columns

## Security Considerations

- Always use environment variables for secrets
- Use service role key only for server operations
- Implement rate limiting for production deployments
- Validate and sanitize file uploads
- Consider virus scanning for uploaded files
- Implement user authentication for multi-tenant scenarios

## Future Enhancements

- [ ] Better PDF image extraction (render pages as images)
- [ ] Support for more document formats (.docx, .pptx)
- [ ] Streaming upload for large files
- [ ] Background job processing for heavy operations
- [ ] Webhook support for upload notifications
- [ ] Full-text search in addition to semantic search

## License

MIT License - see LICENSE file for details