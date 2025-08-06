import { supabase } from '../services/supabase.js';

export async function getDocument({ filename, id }) {
  try {
    // Build query
    let query = supabase
      .from('documents')
      .select('*');
    
    // Search by either filename or id
    if (filename) {
      query = query.eq('filename', filename);
    } else if (id) {
      query = query.eq('id', id);
    } else {
      throw new Error('Either filename or id must be provided');
    }
    
    const { data, error } = await query.single();
    
    if (error) {
      throw new Error(`Failed to get document: ${error.message}`);
    }
    
    if (!data) {
      throw new Error(`Document not found`);
    }
    
    // Return document with all details including file_url for images
    return {
      success: true,
      document: {
        id: data.id,
        filename: data.filename,
        content: data.content,
        content_type: data.content_type,
        file_url: data.file_url,
        metadata: data.metadata,
        created_at: data.created_at
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}