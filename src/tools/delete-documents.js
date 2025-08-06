import { supabase, storage } from '../services/supabase.js';

/**
 * Delete multiple documents by IDs from the knowledge base
 * This will also delete all associated chunks and images from storage
 */
export async function deleteDocuments({ document_ids }) {
  try {
    console.log('Deleting documents:', { document_ids });

    // Validate that document_ids is provided and is an array
    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      throw new Error('document_ids must be a non-empty array');
    }

    // First, find all the documents
    const { data: documents, error: findError } = await supabase
      .from('documents')
      .select('id, filename, content_type, file_url')
      .in('id', document_ids);

    if (findError) {
      throw new Error(`Failed to find documents: ${findError.message}`);
    }

    if (!documents || documents.length === 0) {
      throw new Error('No documents found with the provided IDs');
    }

    console.log(`Found ${documents.length} documents to delete`);

    // Delete images from storage
    const imageDeletions = [];
    for (const document of documents) {
      if (document.content_type === 'image' && document.file_url) {
        try {
          // Extract the file path from the URL
          const url = new URL(document.file_url);
          const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/images\/(.+)/);
          if (pathMatch && pathMatch[1]) {
            const filePath = `public/${pathMatch[1]}`;
            console.log('Deleting image from storage:', filePath);
            
            imageDeletions.push(
              supabase.storage
                .from('images')
                .remove([filePath])
                .then(({ error }) => {
                  if (error) {
                    console.error(`Failed to delete image ${filePath}:`, error);
                  }
                })
            );
          }
        } catch (error) {
          console.error('Error processing image deletion:', error);
          // Continue with document deletion
        }
      }
    }

    // Wait for all image deletions to complete
    if (imageDeletions.length > 0) {
      await Promise.all(imageDeletions);
    }

    // Delete all documents (cascade will delete chunks)
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .in('id', document_ids);

    if (deleteError) {
      throw new Error(`Failed to delete documents: ${deleteError.message}`);
    }

    console.log('Documents deleted successfully');

    const deletedFilenames = documents.map(doc => doc.filename);
    
    return {
      success: true,
      message: `Successfully deleted ${documents.length} document(s)`,
      deleted_count: documents.length,
      deleted_documents: documents.map(doc => ({
        id: doc.id,
        filename: doc.filename
      }))
    };

  } catch (error) {
    console.error('Error in deleteDocuments:', error);
    throw error;
  }
}