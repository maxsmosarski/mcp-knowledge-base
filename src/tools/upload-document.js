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
  try {
    // Read PDF file
    const pdfBytes = await fs.readFile(filePath);
    
    // Load the PDF document using pdf-lib (more compatible with Workers)
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    
    // Get basic metadata
    const numPages = pdfDoc.getPageCount();
    const metadata = {
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
    
    // Note: pdf-lib doesn't have built-in text extraction
    // For now, we'll create a placeholder with metadata
    // In production, you might want to use a separate service for text extraction
    let fullText = `PDF Document: ${metadata.info.Title || path.basename(filePath)}\n`;
    fullText += `Author: ${metadata.info.Author || 'Unknown'}\n`;
    fullText += `Pages: ${numPages}\n`;
    fullText += `Subject: ${metadata.info.Subject || 'N/A'}\n\n`;
    fullText += `Note: Full text extraction from PDFs is limited in Cloudflare Workers environment. `;
    fullText += `This document has been indexed with its metadata for searchability.`;
    
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
    console.error('Error processing PDF with pdf-lib:', error);
    // Fallback to basic metadata if PDF processing fails
    return {
      text: `PDF Document: ${path.basename(filePath)}\nNote: Unable to extract content from this PDF.`,
      metadata: { pages: 0, info: {}, version: '1.0' }
    };
  }
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