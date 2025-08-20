// Router that selects the appropriate upload implementation based on environment

// Detect if we're in a Cloudflare Worker environment
const isWorker = typeof globalThis.ReadableStream !== 'undefined' && !globalThis.process;

// Dynamically import the correct implementation
let uploadDocument;

if (isWorker) {
  console.log('[upload-document] Using Cloudflare Worker implementation (metadata only)');
  const workerModule = await import('./upload-document-worker.js');
  uploadDocument = workerModule.uploadDocument;
} else {
  console.log('[upload-document] Using Node.js implementation (full text extraction)');
  const nodeModule = await import('./upload-document-node.js');
  uploadDocument = nodeModule.uploadDocument;
}

// Export the appropriate implementation
export { uploadDocument };

// For MCP tool registration
export const uploadDocumentTool = {
  name: 'upload_document',
  description: 'Upload and process a document (text, markdown, JSON, CSV, or PDF) for semantic search',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the file to upload (Node.js only)'
      },
      file_data: {
        type: 'string',
        description: 'File data as Uint8Array (Cloudflare Workers only)'
      },
      original_filename: {
        type: 'string',
        description: 'Original filename (required when using file_data)'
      }
    },
    required: []
  }
};