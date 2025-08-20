// Router that selects the appropriate upload implementation based on environment

// Detect if we're in a Cloudflare Worker environment
const isWorker = typeof globalThis.ReadableStream !== 'undefined' && !globalThis.process;

// Create a lazy-loaded upload function
export async function uploadDocument(params) {
  if (isWorker) {
    console.log('[upload-document] Using Cloudflare Worker implementation (metadata only)');
    const workerModule = await import('./upload-document-worker.js');
    return workerModule.uploadDocument(params);
  } else {
    console.log('[upload-document] Using Node.js implementation (full text extraction)');
    const nodeModule = await import('./upload-document-node.js');
    return nodeModule.uploadDocument(params);
  }
}

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