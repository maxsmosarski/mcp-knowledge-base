import { supabase, createSupabaseClient, storage } from '../services/supabase.js';
import { generateEmbedding, describeImage, createImageChunks } from '../services/openai.js';
import { v4 as uuidv4 } from 'uuid';

// Conditionally import Node.js modules only when not in Workers environment
let fs, path;
if (typeof globalThis.ReadableStream !== 'undefined' && !globalThis.process) {
  // We're in a Cloudflare Worker environment
  console.log('[upload-image] Running in Cloudflare Workers environment');
} else {
  // We're in Node.js environment
  fs = (await import('fs')).default;
  path = (await import('path')).default;
}

// Helper function to upload image to storage using dynamic credentials
async function uploadImageToStorage(fileData, originalFileName, supabaseClient, isWorker = false) {
  const fileExtension = originalFileName.includes('.') 
    ? '.' + originalFileName.split('.').pop() 
    : '.jpg';
  const uniqueFileName = `${uuidv4()}${fileExtension}`;
  const storagePath = `public/${uniqueFileName}`;

  console.log(`[uploadImageToStorage] Uploading ${originalFileName} as ${uniqueFileName}`);
  console.log(`[uploadImageToStorage] File data type: ${typeof fileData}, size: ${fileData?.length || fileData?.size || 'unknown'}`);

  const { data, error } = await supabaseClient.storage
    .from('images')
    .upload(storagePath, fileData, {
      contentType: storage.getMimeType(fileExtension),
      upsert: false
    });

  if (error) {
    console.error('[uploadImageToStorage] Upload error:', error);
    throw error;
  }

  console.log('[uploadImageToStorage] Upload successful:', data);

  const { data: { publicUrl } } = supabaseClient.storage
    .from('images')
    .getPublicUrl(storagePath);

  console.log('[uploadImageToStorage] Public URL:', publicUrl);
  return { path: data.path, publicUrl, fileName: originalFileName, uniqueFileName };
}

export async function uploadImage({ file_path, file_data, original_filename, credentials = null }) {
  try {
    // Better detection: if file_data is provided, we're in Worker mode
    // This is more reliable than checking global environment
    const isWorker = !!file_data;
    console.log(`[uploadImage] Starting upload - Using file_data: ${isWorker}`);
    console.log(`[uploadImage] Inputs - file_path: ${file_path}, file_data: ${file_data ? 'provided' : 'not provided'}, original_filename: ${original_filename}`);

    // Validate input based on what's provided
    if (file_data) {
      // Using file_data (Worker mode)
      if (!original_filename) {
        throw new Error('original_filename is required when using file_data');
      }
      console.log('[uploadImage] Using file_data mode (Cloudflare Workers)');
    } else if (file_path) {
      // Using file_path (Node.js mode)
      if (!fs) {
        throw new Error('File system not available - use file_data parameter instead of file_path in Cloudflare Workers');
      }
      console.log('[uploadImage] Using file_path mode (Node.js)');
    } else {
      // Neither provided
      throw new Error('Either file_data or file_path must be provided');
    }
      
      // Check if file exists (only in Node.js mode)
      if (file_path && fs && !fs.existsSync(file_path)) {
        throw new Error(`File not found: ${file_path}`);
      }

      // Check if file is a supported image type (only in Node.js mode)
      if (file_path && !storage.isImageFile(file_path)) {
        throw new Error('File must be a supported image type (.png, .jpg, .jpeg, .gif, .webp)');
      }

    // Determine filename
    const fileName = original_filename || (file_path && path ? path.basename(file_path) : 'uploaded-image.jpg');
    console.log(`[uploadImage] Processing image: ${fileName}`);

    // Use provided credentials or fall back to default client
    const supabaseClient = credentials ? createSupabaseClient(credentials) : supabase;
    if (!supabaseClient) {
      throw new Error('No Supabase client available - provide credentials or set environment variables');
    }
    
    // Step 1: Upload to Supabase Storage
    console.log('[uploadImage] Uploading to Supabase Storage...');
    let uploadResult;
    if (file_data) {
      // Use the provided file data (Worker mode)
      uploadResult = await uploadImageToStorage(file_data, fileName, supabaseClient, true);
    } else if (file_path && fs) {
      // Read the file from disk (Node.js mode)
      const fileBuffer = fs.readFileSync(file_path);
      uploadResult = await uploadImageToStorage(fileBuffer, fileName, supabaseClient, false);
    } else {
      throw new Error('Unable to access file data');
    }
    const { publicUrl, path: storagePath } = uploadResult;

    // Step 2: Generate AI description
    console.log('[uploadImage] Generating AI description from URL:', publicUrl);
    const description = await describeImage(publicUrl, credentials);
    console.log('[uploadImage] AI description generated:', description?.caption ? 'success' : 'failed');

    // Step 3: Get image metadata
    let metadata;
    if (file_data) {
      // Using file_data, we can't get file stats, use what we have
      metadata = {
        file_size: file_data?.size || file_data?.length || 0,
        mime_type: storage.getMimeType(fileName.includes('.') ? '.' + fileName.split('.').pop() : '.jpg'),
        storage_path: storagePath,
        uploaded_at: new Date().toISOString()
      };
    } else if (file_path && fs) {
      // In Node.js, get file stats
      const stats = fs.statSync(file_path);
      metadata = {
        file_size: stats.size,
        mime_type: storage.getMimeType(path.extname(file_path)),
        storage_path: storagePath,
        uploaded_at: new Date().toISOString()
      };
    } else {
      // Fallback metadata
      metadata = {
        file_size: 0,
        mime_type: 'application/octet-stream',
        storage_path: storagePath,
        uploaded_at: new Date().toISOString()
      };
    }
    console.log('[uploadImage] Metadata:', metadata);

    // Step 4: Store document record
    console.log('[uploadImage] Storing document record...');
    const { data: document, error: docError } = await supabaseClient
      .from('documents')
      .insert({
        filename: fileName,
        content: description.summary, // Use summary as main content
        content_type: 'image',
        file_url: publicUrl,
        metadata: metadata
      })
      .select()
      .single();

    if (docError) {
      console.error('[uploadImage] Failed to store document:', docError);
      throw new Error(`Failed to store document: ${docError.message}`);
    }
    console.log('[uploadImage] Document stored with ID:', document?.id);

    // Step 5: Create searchable chunks
    console.log('[uploadImage] Creating searchable chunks...');
    const chunks = createImageChunks(description);
    console.log(`[uploadImage] Created ${chunks.length} chunks to process`);
    
    let chunksCreated = 0;
    for (const chunk of chunks) {
      // Generate embedding for chunk
      const embedding = await generateEmbedding(chunk.content, credentials);
      
      // Store chunk with embedding
      const { error: chunkError } = await supabaseClient
        .from('document_chunks')
        .insert({
          document_id: document.id,
          content: chunk.content,
          embedding: embedding
        });

      if (chunkError) {
        console.error(`[uploadImage] Error storing chunk: ${chunkError.message}`);
      } else {
        chunksCreated++;
      }
    }

    console.log(`[uploadImage] Workflow completed. Created ${chunksCreated} searchable chunks.`);

    return {
      success: true,
      message: `Image uploaded successfully: ${fileName}`,
      document: {
        id: document.id,
        filename: fileName,
        content_type: 'image',
        file_url: publicUrl,
        chunks_created: chunksCreated,
        ai_description: {
          caption: description.caption,
          summary: description.summary,
          objects_found: description.objects,
          tags: description.tags
        }
      }
    };

  } catch (error) {
    console.error('[uploadImage] Upload failed:', error);
    console.error('[uploadImage] Error stack:', error.stack);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}