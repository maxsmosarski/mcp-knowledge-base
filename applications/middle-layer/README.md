# Middle Layer - Supabass Knowledge Base API

Python FastAPI server that bridges the web app and MCP server, providing intelligent chat orchestration with session management.

## Features

- 🤖 **OpenAI Agents SDK** - Advanced agent orchestration with MCP client support
- 💬 **Session Management** - Persistent conversation history with SQLite
- 🔄 **Streaming Responses** - Real-time chat responses (SSE)
- 🔧 **MCP Integration** - Dynamic tool discovery and invocation
- 📁 **File Management** - Unified API for uploads and deletions
- ⚡ **Async Architecture** - High-performance request handling
- 🎯 **Structured Output** - Type-safe responses with Pydantic models
- 🏥 **Health Monitoring** - Built-in health check endpoint

## Prerequisites

- Python 3.10 or higher
- Running MCP server (default port 3000)
- OpenAI API key

## Setup

1. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**
   Create `.env` file:
   ```env
   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key
   
   # Server Configuration
   PORT=3001
   
   # MCP Server URL (optional, defaults to localhost:3000)
   MCP_SERVER_URL=http://localhost:3000
   ```

4. **Customize system prompt** (optional)
   Edit `system_prompt.txt` to customize the assistant's behavior

5. **Start the server**
   ```bash
   python server.py
   # Or with custom port:
   PORT=8080 python server.py
   ```

## Project Structure

```
middle-layer/
├── server.py               # Main FastAPI application
├── system_prompt.txt       # Customizable assistant instructions
├── requirements.txt        # Python dependencies
├── conversation_history.db # SQLite session storage (auto-created)
├── server.log             # Application logs
├── start.sh               # Unix startup script
├── kill.sh               # Unix shutdown script
└── .env                  # Environment variables (create this)
```

## API Endpoints

### Health Check
```http
GET /health
```
Returns server status and configuration info.

**Response:**
```json
{
  "status": "ok",
  "server": "running"
}
```

### Chat Endpoint
```http
POST /api/chat
Content-Type: application/json

{
  "message": "What documents do you have about Python?",
  "session_id": "optional-session-id",
  "conversation_history": []  // Deprecated, use session_id
}
```

**Response:** Server-Sent Events stream
```
data: {"type": "content", "data": "I found several Python documents..."}
data: {"type": "tool_call", "data": {"tool": "search_documents", "args": {...}}}
data: {"type": "done", "data": ""}
```

### List Files
```http
GET /api/files
```

**Response:**
```json
{
  "files": [
    {
      "id": "uuid",
      "filename": "document.pdf",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Upload File
```http
POST /api/upload
Content-Type: multipart/form-data

file: [binary data]
```

Automatically detects file type and routes to appropriate MCP tool:
- Images → `upload_image` with AI description
- Documents → `upload_document` with text extraction

**Response:**
```json
{
  "status": "success",
  "filename": "cookbook.pdf",
  "document_id": "uuid",
  "message": "Successfully uploaded cookbook.pdf",
  "details": "Processed 250 pages, extracted 15 images"
}
```

### Delete Files
```http
DELETE /api/files
Content-Type: application/json

{
  "document_id": "single-id"  // For single deletion
  // OR
  "document_ids": ["id1", "id2", "id3"]  // For bulk deletion
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Successfully deleted 3 document(s)",
  "details": "All related data has been removed"
}
```

### Legacy Delete (Backward Compatibility)
```http
DELETE /api/files/{document_id}
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web App   │────▶│Middle Layer │────▶│ MCP Server  │
│   (React)   │     │  (FastAPI)  │     │  (Node.js)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   SQLite    │
                    │  Sessions   │
                    └─────────────┘
```

### Request Flow

1. **Web App** sends user message with optional session ID
2. **Middle Layer** creates/retrieves session from SQLite
3. **Agent** is instantiated with MCP connection
4. **MCP Tools** are dynamically discovered and invoked
5. **Response** is streamed back to web app
6. **Session** is updated with conversation history

## Session Management

Sessions are automatically managed using SQLite:

- **Session Creation**: Auto-generated UUID if not provided
- **History Storage**: Full conversation history per session
- **Persistence**: Survives server restarts
- **Cleanup**: Old sessions can be purged (manual process)

Database location: `conversation_history.db`

## Agent Configuration

### System Prompt
Customize assistant behavior by editing `system_prompt.txt`:
```text
You are a helpful assistant with access to a knowledge base containing documents and images uploaded by the user. When users ask about images, always use the search or get tools to find and display them using markdown image syntax.
```

### Model Settings
- **Default Model**: `gpt-4o-mini`
- **Temperature**: 0.7 (adjustable in code)
- **Max Tokens**: Model default

### MCP Tools Available
Tools are dynamically discovered from the MCP server:
- `upload_document` - Upload text/PDF documents
- `upload_image` - Upload and analyze images
- `search_documents` - Semantic search
- `get_files` - List all files
- `get_document` - Get specific file
- `delete_document` - Delete single file
- `delete_documents` - Bulk delete

## Development

### Running in Development
```bash
# With auto-reload
uvicorn server:app --reload --port 3001 --host 0.0.0.0

# With logging
python server.py --log-level debug
```

### Debugging

1. **Enable debug logging**:
   ```python
   logging.basicConfig(level=logging.DEBUG)
   ```

2. **Check logs**:
   ```bash
   tail -f server.log
   ```

3. **Test endpoints**:
   ```bash
   # Health check
   curl http://localhost:3001/health
   
   # Chat request
   curl -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello", "session_id": "test-123"}'
   ```

## Deployment

### Production Configuration

1. **Environment Variables**:
   ```bash
   export OPENAI_API_KEY=sk-...
   export PORT=8080
   export LOG_LEVEL=info
   ```

2. **Gunicorn** (recommended):
   ```bash
   gunicorn server:app \
     -w 4 \
     -k uvicorn.workers.UvicornWorker \
     --bind 0.0.0.0:8080 \
     --timeout 300
   ```

3. **Systemd Service**:
   ```ini
   [Unit]
   Description=Supabass Middle Layer
   After=network.target
   
   [Service]
   Type=simple
   User=ubuntu
   WorkingDirectory=/path/to/middle-layer
   Environment="PATH=/path/to/venv/bin"
   ExecStart=/path/to/venv/bin/gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

### Docker Deployment

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Run server
EXPOSE 3001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "3001"]
```

Build and run:
```bash
docker build -t supabass-middle-layer .
docker run -p 3001:3001 --env-file .env supabass-middle-layer
```

## Monitoring

### Logs
- Application logs: `server.log`
- Access logs: Stdout (configurable)
- Error tracking: Integrate with Sentry/Rollbar
