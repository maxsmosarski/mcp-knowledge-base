import { supabase, createSupabaseClient, storage } from '../services/supabase.js';
import { generateEmbedding, describeImage, createImageChunks } from '../services/openai.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Helper function to upload image to storage using dynamic credentials
async function uploadImageToStorage(filePath, originalFileName, supabaseClient) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileExtension = path.extname(originalFileName);
  const uniqueFileName = `${uuidv4()}${fileExtension}`;
  const storagePath = `public/${uniqueFileName}`;

  const { data, error } = await supabaseClient.storage
    .from('images')
    .upload(storagePath, fileBuffer, {
      contentType: storage.getMimeType(fileExtension),
      upsert: false
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabaseClient.storage
    .from('images')
    .getPublicUrl(storagePath);

  return { path: data.path, publicUrl, fileName: originalFileName, uniqueFileName };
}

export async function uploadImage({ file_path, original_filename, credentials = null }) {
  try {
    // Validate input
    if (!file_path) {
      throw new Error('file_path is required');
    }

    // Check if file exists
    if (!fs.existsSync(file_path)) {
      throw new Error(`File not found: ${file_path}`);
    }

    // Check if file is a supported image type
    if (!storage.isImageFile(file_path)) {
      throw new Error('File must be a supported image type (.png, .jpg, .jpeg, .gif, .webp)');
    }

    // Use original filename if provided, otherwise extract from path
    const fileName = original_filename || path.basename(file_path);
    console.log(`Starting image upload workflow for: ${fileName}`);

    // Use provided credentials or fall back to default client
    const supabaseClient = credentials ? createSupabaseClient(credentials) : supabase;
    if (!supabaseClient) {
      throw new Error('No Supabase client available - provide credentials or set environment variables');
    }
    
    // Step 1: Upload to Supabase Storage
    console.log('Uploading to Supabase Storage...');
    const uploadResult = await uploadImageToStorage(file_path, fileName, supabaseClient);
    const { publicUrl, path: storagePath } = uploadResult;

    // Step 2: Generate AI description
    console.log('Generating AI description...');
    const description = await describeImage(publicUrl, credentials);

    // Step 3: Get image metadata
    const stats = fs.statSync(file_path);
    const metadata = {
      file_size: stats.size,
      mime_type: storage.getMimeType(path.extname(file_path)),
      storage_path: storagePath,
      uploaded_at: new Date().toISOString()
    };

    // Step 4: Store document record
    console.log('Storing document record...');
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
      throw new Error(`Failed to store document: ${docError.message}`);
    }

    // Step 5: Create searchable chunks
    console.log('Creating searchable chunks...');
    const chunks = createImageChunks(description);
    
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
        console.error(`Error storing chunk: ${chunkError.message}`);
      } else {
        chunksCreated++;
      }
    }

    console.log(`Image upload workflow completed. Created ${chunksCreated} searchable chunks.`);

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
    console.error('Image upload failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}