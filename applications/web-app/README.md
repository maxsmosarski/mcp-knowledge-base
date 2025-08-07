# Web App - Supabass Knowledge Base Frontend

Modern React-based frontend for the Supabass Knowledge Base system with real-time chat, file management, and image viewing capabilities.

## Features

- 💬 **Real-time Chat Interface** - Stream responses with full markdown support
- 📁 **File Management** - Upload, view, and delete documents with drag-and-drop
- 📄 **Document Sidebar** - Browse, search, and manage all uploaded files
- 🖼️ **Image Support** - Inline preview and full-screen modal viewing
- 🎯 **Bulk Operations** - Select and delete multiple files at once
- 📤 **Upload Progress** - Real-time upload progress with file queuing
- 🎨 **Modern UI** - Clean, responsive design with Tailwind CSS
- ⚡ **Real-time Updates** - Server-sent events for instant feedback
- 🔄 **Session Management** - Persistent conversation history

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment** (optional)
   Create `.env.local` to customize settings:
   ```env
   VITE_API_URL=http://localhost:3001
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```
   The app will be available at http://localhost:5173

## Project Structure

```
web-app/
├── src/
│   ├── components/
│   │   ├── ChatInterface.jsx      # Main chat UI with streaming
│   │   ├── DocumentSidebar.jsx    # File browser with search
│   │   ├── FileUpload.jsx        # Drag-drop upload component
│   │   └── ImagePreviewModal.jsx  # Full-screen image viewer
│   ├── services/
│   │   └── middle-layer-client.js # API client with SSE support
│   ├── App.jsx                    # Main app layout
│   ├── App.css                    # Component styles
│   ├── main.jsx                   # App entry point
│   └── index.css                  # Global Tailwind styles
├── public/                        # Static assets
├── index.html                     # HTML template
├── vite.config.js                # Vite configuration
├── tailwind.config.js            # Tailwind customization
├── postcss.config.js             # PostCSS configuration
└── package.json                   # Dependencies and scripts
```

Key features:
```jsx
// Supports various message types
- User messages
- Assistant responses with markdown
- Tool calls visualization
- Error messages
```

### DocumentSidebar
Comprehensive file management interface:
- **File List**: Display all documents with metadata
- **Search**: Real-time filtering by filename
- **Selection**: Multi-select with checkbox support
- **Bulk Delete**: Delete multiple files at once
- **File Info**: Size, type, and upload date display
- **Icons**: File-type specific icons
- **Responsive**: Collapsible on mobile devices

Supported file types:
- Documents: `.txt`, `.md`, `.pdf`, `.json`, `.csv`
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`

### FileUpload
Advanced drag-and-drop upload component:
- **Drag & Drop**: Visual feedback during drag operations
- **Multi-file**: Upload multiple files simultaneously
- **Progress Tracking**: Individual file progress bars
- **Queue Management**: See all uploading files
- **Error Handling**: Per-file error messages
- **File Validation**: Type and size checking
- **Auto-refresh**: Updates file list after upload

### ImagePreviewModal
Full-screen image viewer:
- **Modal Display**: Centered with dark overlay
- **Responsive Sizing**: Maintains aspect ratio
- **Keyboard Support**: ESC to close
- **Click Outside**: Close on background click
- **Loading States**: Smooth image loading
- **Error Handling**: Fallback for failed loads

### MiddleLayerClient
Robust API client service:
- **SSE Support**: Server-sent events for streaming
- **Auto-reconnect**: Handles connection failures
- **Session Management**: Maintains conversation context
- **Error Handling**: Comprehensive error recovery
- **Health Checks**: Server status monitoring
- **Type Safety**: Well-defined API contracts

API Endpoints:
```javascript
// Chat with streaming
sendMessage(message, sessionId, onChunk, onError, onDone)

// File operations
getFiles()
deleteFiles(documentIds)
uploadFile(file, onProgress)

// Health check
checkHealth()
```

## Development

### Available Scripts

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Format code
npm run format
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Middle layer API URL | `http://localhost:3001` |


#### Component Behavior
Key files to modify:
- `ChatInterface.jsx` - Chat behavior and rendering
- `App.jsx` - Overall layout and routing
- `middle-layer-client.js` - API communication

## API Integration

### Chat Endpoint
```http
POST /api/chat
Content-Type: application/json

{
  "message": "user message",
  "session_id": "optional-session-id"
}
```

Response: Server-Sent Events stream
```
data: {"type": "content", "data": "Response text..."}
data: {"type": "tool_call", "data": {...}}
data: {"type": "done", "data": ""}
```

### File Operations
```http
GET /api/files
DELETE /api/files
POST /api/upload
```