import { supabase, createSupabaseClient, storage } from '../services/supabase.js';

/**
 * Delete a document by ID or filename from the knowledge base
 * This will also delete all associated chunks and images from storage
 */
export async function deleteDocument({ id, filename, credentials = null }) {
  try {
    console.log('Deleting document:', { id, filename });
    
    // Use provided credentials or fall back to default client
    const supabaseClient = credentials ? createSupabaseClient(credentials) : supabase;
    if (!supabaseClient) {
      throw new Error('No Supabase client available - provide credentials or set environment variables');
    }

    // Validate that at least one parameter is provided
    if (!id && !filename) {
      throw new Error('Either id or filename must be provided');
    }

    // First, find the document
    let query = supabaseClient
      .from('documents')
      .select('id, filename, content_type, file_url');

    if (id) {
      query = query.eq('id', id);
    } else if (filename) {
      query = query.eq('filename', filename);
    }

    const { data: documents, error: findError } = await query;

    if (findError) {
      throw new Error(`Failed to find document: ${findError.message}`);
    }

    if (!documents || documents.length === 0) {
      throw new Error('Document not found');
    }

    const document = documents[0];
    console.log('Found document to delete:', document);

    // If it's an image, delete from storage
    if (document.content_type === 'image' && document.file_url) {
      try {
        // Extract the file path from the URL
        const url = new URL(document.file_url);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/images\/(.+)/);
        if (pathMatch && pathMatch[1]) {
          const filePath = `public/${pathMatch[1]}`;
          console.log('Deleting image from storage:', filePath);
          
          const { error: storageError } = await supabaseClient.storage
            .from('images')
            .remove([filePath]);
          
          if (storageError) {
            console.error('Failed to delete image from storage:', storageError);
            // Continue with document deletion even if storage deletion fails
          }
        }
      } catch (error) {
        console.error('Error processing image deletion:', error);
        // Continue with document deletion
      }
    }

    // Delete the document (cascade will delete chunks)
    const { error: deleteError } = await supabaseClient
      .from('documents')
      .delete()
      .eq('id', document.id);

    if (deleteError) {
      throw new Error(`Failed to delete document: ${deleteError.message}`);
    }

    console.log('Document deleted successfully');

    return {
      success: true,
      message: `Document "${document.filename}" deleted successfully`,
      document_id: document.id,
      filename: document.filename
    };

  } catch (error) {
    console.error('Error in deleteDocument:', error);
    throw error;
  }
}