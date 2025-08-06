import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
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

async function processPDF(filePath) {
  // Use pdfjs-dist which doesn't have initialization issues
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { getDocument } = pdfjsLib;
  
  // Read PDF file
  const data = new Uint8Array(await fs.readFile(filePath));
  
  // Load the PDF document
  const loadingTask = getDocument({ data });
  const pdfDoc = await loadingTask.promise;
  
  // Extract text from all pages
  let fullText = '';
  const numPages = pdfDoc.numPages;
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  // Get metadata
  const metadata = {
    pages: numPages,
    info: await pdfDoc.getMetadata().then(data => data.info).catch(() => ({})),
    version: '1.0'
  };
  
  // Clean up the text to handle Unicode issues
  fullText = fullText
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
    .replace(/\\u[\dA-F]{4}/gi, (match) => { // Handle Unicode escape sequences
      try {
        return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
      } catch {
        return ''; // Remove invalid sequences
      }
    })
    .trim();
  
  return {
    text: fullText,
    metadata: metadata
  };
}

export async function uploadDocument({ file_path, credentials = null }) {
  try {
    const filename = path.basename(file_path);
    const fileExt = path.extname(filename).toLowerCase();
    
    let content = '';
    let metadata = {};
    let documentType = 'text';
    
    // Handle different file types
    if (fileExt === '.pdf') {
      console.log('Processing PDF file...');
      try {
        const pdfResult = await processPDF(file_path);
        content = pdfResult.text;
        metadata = pdfResult.metadata;
        documentType = 'pdf';
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        throw new Error(`Failed to parse PDF: ${pdfError.message}`);
      }
    } else {
      // Handle text files as before
      content = await fs.readFile(file_path, 'utf-8');
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