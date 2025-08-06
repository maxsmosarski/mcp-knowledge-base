import { supabase, storage } from '../services/supabase.js';
import { generateEmbedding, describeImage, createImageChunks } from '../services/openai.js';
import fs from 'fs';
import path from 'path';

export async function uploadImage({ file_path, original_filename }) {
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

    // Step 1: Upload to Supabase Storage
    console.log('Uploading to Supabase Storage...');
    const uploadResult = await storage.uploadImage(file_path, fileName);
    const { publicUrl, path: storagePath } = uploadResult;

    // Step 2: Generate AI description
    console.log('Generating AI description...');
    const description = await describeImage(publicUrl);

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
    const { data: document, error: docError } = await supabase
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
      const embedding = await generateEmbedding(chunk.content);
      
      // Store chunk with embedding
      const { error: chunkError } = await supabase
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