// Conditionally import Node.js modules only when not in Workers environment
let fs, path;
if (typeof globalThis.ReadableStream !== 'undefined' && !globalThis.process) {
  // We're in a Cloudflare Worker environment
  console.log('[upload-document] Running in Cloudflare Workers environment');
} else {
  // We're in Node.js environment
  fs = (await import('fs/promises')).default;
  path = (await import('path')).default;
}

import { PDFDocument } from 'pdf-lib';
import { extractText, getMetadata } from 'unpdf';
import { supabase, createSupabaseClient } from '../services/supabase.js';
import { generateEmbedding } from '../services/openai.js';
import { uploadImage } from './upload-image.js';

function chunkText(text, maxWords = 500) {
  const words = text.split(/\s+/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(' ');
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }
  
  return chunks;
}

// Image extraction from PDFs has been removed for Cloudflare Workers compatibility
// PDFs will still be processed for text content

async function processPDF(filePath, fileData, fileName) {
  try {
    let pdfBytes;
    
    if (fileData) {
      // Use provided file data (Cloudflare Workers mode)
      pdfBytes = fileData;
      console.log('[processPDF] Using file data mode for:', fileName);
    } else if (filePath && fs) {
      // Read PDF file from disk (Node.js mode)
      pdfBytes = await fs.readFile(filePath);
      console.log('[processPDF] Using file path mode for:', filePath);
    } else {
      throw new Error('Either fileData or filePath must be provided');
    }
    
    // Try to extract text using unpdf (Works in Cloudflare Workers)
    let fullText = '';
    let metadata = {};
    
    try {
      console.log('[processPDF] Extracting text with unpdf...');
      // Convert Uint8Array to ArrayBuffer if needed
      const buffer = pdfBytes instanceof ArrayBuffer ? pdfBytes : pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
      
      // Extract text from PDF
      const { text, totalPages } = await extractText(buffer);
      fullText = text || '';
      
      // Get metadata
      const pdfMetadata = await getMetadata(buffer);
      
      metadata = {
        pages: totalPages || 0,
        info: {
          Title: pdfMetadata?.title || '',
          Author: pdfMetadata?.author || '',
          Subject: pdfMetadata?.subject || '',
          Creator: pdfMetadata?.creator || '',
          Producer: pdfMetadata?.producer || '',
          CreationDate: pdfMetadata?.creationDate || '',
          ModificationDate: pdfMetadata?.modificationDate || ''
        },
        version: '1.0'
      };
      
      console.log(`[processPDF] Extracted ${fullText.length} characters of text from ${totalPages} pages`);
      
      // If no text was extracted, add a note
      if (!fullText || fullText.trim().length === 0) {
        const displayName = fileName || (filePath && path ? path.basename(filePath) : 'document.pdf');
        fullText = `PDF Document: ${metadata.info.Title || displayName}\n`;
        fullText += `Author: ${metadata.info.Author || 'Unknown'}\n`;
        fullText += `Pages: ${metadata.pages}\n`;
        fullText += `Subject: ${metadata.info.Subject || 'N/A'}\n\n`;
        fullText += `Note: This PDF appears to contain images or scanned content without extractable text.`;
      }
      
    } catch (unpdfError) {
      console.error('[processPDF] unpdf extraction failed, falling back to pdf-lib:', unpdfError);
      
      // Fallback to pdf-lib for metadata only
      try {
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const numPages = pdfDoc.getPageCount();
        
        metadata = {
          pages: numPages,
          info: {
            Title: pdfDoc.getTitle() || '',
            Author: pdfDoc.getAuthor() || '',
            Subject: pdfDoc.getSubject() || '',
            Creator: pdfDoc.getCreator() || '',
            Producer: pdfDoc.getProducer() || '',
            CreationDate: pdfDoc.getCreationDate()?.toISOString() || '',
            ModificationDate: pdfDoc.getModificationDate()?.toISOString() || ''
          },
          version: '1.0'
        };
        
        const displayName = fileName || (filePath && path ? path.basename(filePath) : 'document.pdf');
        fullText = `PDF Document: ${metadata.info.Title || displayName}\n`;
        fullText += `Author: ${metadata.info.Author || 'Unknown'}\n`;
        fullText += `Pages: ${numPages}\n`;
        fullText += `Subject: ${metadata.info.Subject || 'N/A'}\n\n`;
        fullText += `Note: Text extraction failed. Document indexed with metadata only.`;
      } catch (pdfLibError) {
        console.error('[processPDF] pdf-lib also failed:', pdfLibError);
        throw pdfLibError;
      }
    }
    
    // Clean up the text to handle any Unicode issues
    fullText = fullText
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
      .trim();
    
    return {
      text: fullText,
      metadata: metadata
    };
  } catch (error) {
    console.error('Error processing PDF:', error);
    // Fallback to basic metadata if PDF processing fails
    const displayName = fileName || (filePath && path ? path.basename(filePath) : 'document.pdf');
    return {
      text: `PDF Document: ${displayName}\nNote: Unable to extract content from this PDF.`,
      metadata: { pages: 0, info: {}, version: '1.0' }
    };
  }
}

export async function uploadDocument({ file_path, file_data, original_filename, credentials = null }) {
  try {
    // Detect if we're in Worker mode
    const isWorker = !!file_data;
    console.log(`[uploadDocument] Starting upload - Using file_data: ${isWorker}`);
    console.log(`[uploadDocument] Inputs - file_path: ${file_path}, file_data: ${file_data ? 'provided' : 'not provided'}, original_filename: ${original_filename}`);
    
    // Validate input
    if (file_data) {
      if (!original_filename) {
        throw new Error('original_filename is required when using file_data');
      }
      console.log('[uploadDocument] Using file_data mode (Cloudflare Workers)');
    } else if (file_path) {
      if (!fs) {
        throw new Error('File system not available - use file_data parameter instead of file_path in Cloudflare Workers');
      }
      console.log('[uploadDocument] Using file_path mode (Node.js)');
    } else {
      throw new Error('Either file_data or file_path must be provided');
    }
    
    // Determine filename
    const filename = original_filename || (file_path && path ? path.basename(file_path) : 'document.pdf');
    const fileExt = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')).toLowerCase() : '.pdf';
    
    let content = '';
    let metadata = {};
    let documentType = 'text';
    
    // Handle different file types
    if (fileExt === '.pdf') {
      console.log('Processing PDF file...');
      try {
        const pdfResult = await processPDF(file_path, file_data, filename);
        content = pdfResult.text;
        metadata = pdfResult.metadata;
        documentType = 'pdf';
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        throw new Error(`Failed to parse PDF: ${pdfError.message}`);
      }
    } else {
      // Handle text files
      if (file_data) {
        // Convert Uint8Array to string for text files in Workers
        const decoder = new TextDecoder('utf-8');
        content = decoder.decode(file_data);
      } else if (file_path && fs) {
        content = await fs.readFile(file_path, 'utf-8');
      } else {
        throw new Error('Unable to read file content');
      }
    }
    
    // Ensure content is not empty
    if (!content || content.trim().length === 0) {
      content = '[No readable text content found in PDF]';
    }
    
    // Use provided credentials or fall back to default client
    const supabaseClient = credentials ? createSupabaseClient(credentials) : supabase;
    if (!supabaseClient) {
      throw new Error('No Supabase client available - provide credentials or set environment variables');
    }
    
    // Store document in database
    const { data: doc, error: docError } = await supabaseClient
      .from('documents')
      .insert({ 
        filename, 
        content,
        content_type: documentType === 'pdf' ? 'text' : 'text',
        metadata: metadata
      })
      .select()
      .single();
    
    if (docError) {
      throw new Error(`Failed to store document: ${docError.message}`);
    }
    
    // Image extraction from PDFs removed for Cloudflare Workers compatibility
    
    // Chunk the text content
    const chunks = chunkText(content, 500);
    console.log(`Processing ${chunks.length} text chunks for ${filename}...`);
    
    // Process text chunks
    const chunkPromises = chunks.map(async (chunkContent, index) => {
      const embedding = await generateEmbedding(chunkContent, credentials);
      
      const { error: chunkError } = await supabaseClient
        .from('document_chunks')
        .insert({
          document_id: doc.id,
          content: chunkContent,
          embedding: embedding
        });
      
      if (chunkError) {
        console.error(`Failed to store chunk ${index + 1}: ${chunkError.message}`);
      }
    });
    
    await Promise.all(chunkPromises);
    
    // Image extraction code removed for Cloudflare Workers compatibility
    const uploadedImages = [];
    
    return {
      success: true,
      message: `Successfully uploaded and processed: ${filename}`,
      document_id: doc.id,
      chunks_created: chunks.length,
      images_extracted: uploadedImages.length,
      document_type: documentType,
      metadata: metadata,
      extracted_images: uploadedImages
    };
    
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export const uploadDocumentTool = {
  name: 'upload_document',
  description: 'Upload and process a document (text, markdown, JSON, CSV, or PDF) for semantic search',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the document file to upload'
      }
    },
    required: ['file_path']
  }
};