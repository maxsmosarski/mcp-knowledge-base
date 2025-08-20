// Node.js version - full PDF text extraction using pdf-parse
import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';
import { supabase, createSupabaseClient } from '../services/supabase.js';
import { generateEmbedding } from '../services/openai.js';

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

async function processPDF(filePath, fileName) {
  try {
    console.log('[processPDF-Node] Extracting full text from PDF:', fileName);
    
    // Read the PDF file
    const dataBuffer = await fs.readFile(filePath);
    
    // Extract text using pdf-parse
    const pdfData = await pdfParse(dataBuffer);
    
    // Get metadata using pdf-lib for additional info
    let additionalMetadata = {};
    try {
      const pdfDoc = await PDFDocument.load(dataBuffer, { ignoreEncryption: true });
      additionalMetadata = {
        Title: pdfDoc.getTitle() || '',
        Author: pdfDoc.getAuthor() || '',
        Subject: pdfDoc.getSubject() || '',
        Creator: pdfDoc.getCreator() || '',
        Producer: pdfDoc.getProducer() || '',
        CreationDate: pdfDoc.getCreationDate()?.toISOString() || '',
        ModificationDate: pdfDoc.getModificationDate()?.toISOString() || ''
      };
    } catch (e) {
      console.warn('Could not extract additional metadata:', e.message);
    }
    
    const metadata = {
      pages: pdfData.numpages,
      info: {
        ...pdfData.info,
        ...additionalMetadata
      },
      version: pdfData.version || '1.0'
    };
    
    let fullText = pdfData.text || '';
    
    // If no text was extracted, add metadata as searchable content
    if (!fullText || fullText.trim().length === 0) {
      fullText = `PDF Document: ${metadata.info.Title || fileName}\n`;
      fullText += `Filename: ${fileName}\n`;
      fullText += `Author: ${metadata.info.Author || 'Unknown'}\n`;
      fullText += `Pages: ${metadata.pages}\n`;
      fullText += `Subject: ${metadata.info.Subject || 'N/A'}\n\n`;
      fullText += `Note: This PDF appears to contain images or scanned content without extractable text.`;
    } else {
      console.log(`[processPDF-Node] Extracted ${fullText.length} characters of text from ${metadata.pages} pages`);
    }
    
    // Clean up the text
    fullText = fullText
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return {
      text: fullText,
      metadata: metadata
    };
  } catch (error) {
    console.error('Error processing PDF with pdf-parse:', error);
    return {
      text: `PDF Document: ${fileName}\nNote: Unable to extract content from this PDF.`,
      metadata: { pages: 0, info: {}, version: '1.0' }
    };
  }
}

export async function uploadDocument({ file_path, credentials = null }) {
  try {
    if (!file_path) {
      throw new Error('file_path is required');
    }
    
    console.log(`[uploadDocument-Node] Starting upload for: ${file_path}`);
    
    const filename = path.basename(file_path);
    const fileExt = path.extname(filename).toLowerCase();
    
    let content = '';
    let metadata = {};
    let documentType = 'text';
    
    // Handle different file types
    if (fileExt === '.pdf') {
      console.log('[uploadDocument-Node] Processing PDF file with full text extraction...');
      const pdfResult = await processPDF(file_path, filename);
      content = pdfResult.text;
      metadata = pdfResult.metadata;
      documentType = 'pdf';
    } else {
      // Handle text files
      content = await fs.readFile(file_path, 'utf-8');
      documentType = 'text';
    }
    
    // Ensure content is not empty
    if (!content || content.trim().length === 0) {
      content = '[No readable content found]';
    }
    
    // Use provided credentials or fall back to default client
    const supabaseClient = credentials ? createSupabaseClient(credentials) : supabase;
    if (!supabaseClient) {
      throw new Error('No Supabase client available');
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
    
    // Chunk the text content
    const chunks = chunkText(content, 500);
    console.log(`[uploadDocument-Node] Processing ${chunks.length} text chunks for ${filename}...`);
    
    // Process text chunks in parallel for better performance
    const chunkPromises = chunks.map(async (chunkContent, index) => {
      try {
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
          return false;
        }
        return true;
      } catch (error) {
        console.error(`Failed to process chunk ${index + 1}: ${error.message}`);
        return false;
      }
    });
    
    const results = await Promise.all(chunkPromises);
    const successfulChunks = results.filter(r => r).length;
    
    console.log(`[uploadDocument-Node] Successfully processed ${successfulChunks}/${chunks.length} chunks`);
    
    return {
      success: true,
      message: `Document uploaded successfully: ${filename}`,
      document: {
        id: doc.id,
        filename: filename,
        content_type: documentType,
        chunks_created: successfulChunks,
        total_chunks: chunks.length,
        text_length: content.length,
        metadata: metadata
      }
    };
    
  } catch (error) {
    console.error('[uploadDocument-Node] Upload failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}