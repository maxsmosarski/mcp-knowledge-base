// Cloudflare Workers specific version of upload-document
// This file is used when building for Cloudflare to avoid importing Node.js dependencies

export { uploadDocument } from './upload-document-worker.js';

// For MCP tool registration
export const uploadDocumentTool = {
  name: 'upload_document',
  description: 'Upload and process a document (text, markdown, JSON, CSV, or PDF) for semantic search',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the file to upload (Node.js only - not supported in Cloudflare)'
      },
      file_data: {
        type: 'string',
        description: 'File data as Uint8Array (Cloudflare Workers only)'
      },
      file_base64: {
        type: 'string',
        description: 'Base64 encoded file data (Cloudflare Workers only)'
      },
      original_filename: {
        type: 'string',
        description: 'Original filename (required when using file_data or file_base64)'
      }
    },
    required: []
  }
};