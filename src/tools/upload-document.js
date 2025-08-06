import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { supabase } from '../services/supabase.js';
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

async function extractImagesFromPDF(pdfPath, documentId) {
  try {
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const extractedImages = [];
    
    // Get all pages
    const pages = pdfDoc.getPages();
    
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const xObjects = page.node.Resources?.XObject;
      
      if (!xObjects) continue;
      
      // Iterate through XObjects looking for images
      const entries = Object.entries(xObjects);
      for (let imgIndex = 0; imgIndex < entries.length; imgIndex++) {
        const [name, ref] = entries[imgIndex];
        
        try {
          const xObject = pdfDoc.context.lookup(ref);
          
          // Check if it's an image
          if (xObject?.dict?.lookup('Type')?.name === 'XObject' && 
              xObject?.dict?.lookup('Subtype')?.name === 'Image') {
            
            // Extract image data
            const width = xObject.dict.lookup('Width')?.value;
            const height = xObject.dict.lookup('Height')?.value;
            const imgData = xObject.contents;
            
            if (imgData && width && height) {
              // Save image temporarily
              const tempImagePath = path.join('/tmp', `pdf_extract_${documentId}_p${pageIndex + 1}_img${imgIndex + 1}.png`);
              
              // Convert raw image data to PNG using sharp
              await sharp(imgData, {
                raw: {
                  width: width,
                  height: height,
                  channels: 3
                }
              })
              .png()
              .toFile(tempImagePath);
              
              extractedImages.push({
                path: tempImagePath,
                page: pageIndex + 1,
                originalName: `page_${pageIndex + 1}_image_${imgIndex + 1}.png`
              });
            }
          }
        } catch (imgError) {
          console.log(`Could not extract image ${name} from page ${pageIndex + 1}: ${imgError.message}`);
        }
      }
    }
    
    return extractedImages;
  } catch (error) {
    console.error('Error extracting images from PDF:', error);
    return [];
  }
}

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

export async function uploadDocument({ file_path }) {
  try {
    const filename = path.basename(file_path);
    const fileExt = path.extname(filename).toLowerCase();
    
    let content = '';
    let metadata = {};
    let documentType = 'text';
    let extractedImages = [];
    
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
    
    // Store document in database
    const { data: doc, error: docError } = await supabase
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
    
    // Extract images from PDF if applicable
    if (fileExt === '.pdf') {
      console.log('Attempting to extract images from PDF...');
      extractedImages = await extractImagesFromPDF(file_path, doc.id);
      console.log(`Found ${extractedImages.length} images in PDF`);
    }
    
    // Chunk the text content
    const chunks = chunkText(content, 500);
    console.log(`Processing ${chunks.length} text chunks for ${filename}...`);
    
    // Process text chunks
    const chunkPromises = chunks.map(async (chunkContent, index) => {
      const embedding = await generateEmbedding(chunkContent);
      
      const { error: chunkError } = await supabase
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
    
    // Process extracted images
    const uploadedImages = [];
    for (const extractedImage of extractedImages) {
      try {
        console.log(`Uploading extracted image from page ${extractedImage.page}...`);
        const imageResult = await uploadImage({
          file_path: extractedImage.path,
          original_filename: `${filename}_${extractedImage.originalName}`
        });
        
        if (imageResult.success) {
          uploadedImages.push({
            page: extractedImage.page,
            filename: extractedImage.originalName,
            document_id: imageResult.document.id
          });
          
          // Link the image to the parent PDF document
          await supabase
            .from('document_relationships')
            .insert({
              parent_document_id: doc.id,
              child_document_id: imageResult.document.id,
              relationship_type: 'pdf_extracted_image',
              metadata: { page: extractedImage.page }
            });
        }
        
        // Clean up temporary file
        await fs.unlink(extractedImage.path).catch(() => {});
      } catch (imgError) {
        console.error(`Failed to process extracted image: ${imgError.message}`);
      }
    }
    
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