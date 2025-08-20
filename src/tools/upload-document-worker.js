// Cloudflare Worker version - metadata only, no complex PDF parsing
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

async function processPDF(fileData, fileName) {
  try {
    console.log('[processPDF-Worker] Processing PDF with metadata only for:', fileName);
    
    // Load the PDF document using pdf-lib for basic metadata
    const pdfDoc = await PDFDocument.load(fileData, { ignoreEncryption: true });
    
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
    
    // Create searchable content from metadata
    let fullText = `PDF Document: ${metadata.info.Title || fileName}\n`;
    fullText += `Filename: ${fileName}\n`;
    fullText += `Author: ${metadata.info.Author || 'Unknown'}\n`;
    fullText += `Pages: ${numPages}\n`;
    fullText += `Subject: ${metadata.info.Subject || 'N/A'}\n`;
    fullText += `Creator: ${metadata.info.Creator || 'N/A'}\n`;
    fullText += `Producer: ${metadata.info.Producer || 'N/A'}\n\n`;
    fullText += `Note: This PDF was uploaded via Cloudflare Workers. `;
    fullText += `Full text extraction is not available in the Worker environment. `;
    fullText += `For full text search, please use the desktop application.`;
    
    return {
      text: fullText,
      metadata: metadata
    };
  } catch (error) {
    console.error('Error processing PDF in Worker:', error);
    return {
      text: `PDF Document: ${fileName}\nNote: Unable to process this PDF in Worker environment.`,
      metadata: { pages: 0, info: {}, version: '1.0' }
    };
  }
}

export async function uploadDocument({ file_data, original_filename, credentials = null }) {
  try {
    console.log(`[uploadDocument-Worker] Starting upload for: ${original_filename}`);
    
    if (!file_data || !original_filename) {
      throw new Error('file_data and original_filename are required');
    }
    
    const filename = original_filename;
    const fileExt = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')).toLowerCase() : '.pdf';
    
    let content = '';
    let metadata = {};
    let documentType = 'text';
    
    // Handle different file types
    if (fileExt === '.pdf') {
      console.log('[uploadDocument-Worker] Processing PDF file...');
      const pdfResult = await processPDF(file_data, filename);
      content = pdfResult.text;
      metadata = pdfResult.metadata;
      documentType = 'pdf';
    } else {
      // Handle text files
      const decoder = new TextDecoder('utf-8');
      content = decoder.decode(file_data);
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
    console.log(`[uploadDocument-Worker] Processing ${chunks.length} text chunks for ${filename}...`);
    
    // Process text chunks
    let successfulChunks = 0;
    for (const chunkContent of chunks) {
      try {
        const embedding = await generateEmbedding(chunkContent, credentials);
        
        const { error: chunkError } = await supabaseClient
          .from('document_chunks')
          .insert({
            document_id: doc.id,
            content: chunkContent,
            embedding: embedding
          });
        
        if (!chunkError) {
          successfulChunks++;
        }
      } catch (error) {
        console.error(`Failed to process chunk: ${error.message}`);
      }
    }
    
    console.log(`[uploadDocument-Worker] Successfully processed ${successfulChunks}/${chunks.length} chunks`);
    
    return {
      success: true,
      message: `Document uploaded successfully: ${filename}`,
      document: {
        id: doc.id,
        filename: filename,
        content_type: documentType,
        chunks_created: successfulChunks,
        total_chunks: chunks.length,
        metadata: metadata
      }
    };
    
  } catch (error) {
    console.error('[uploadDocument-Worker] Upload failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}