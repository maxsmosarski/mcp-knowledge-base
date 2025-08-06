import { supabase, createSupabaseClient } from '../services/supabase.js';
import { generateEmbedding } from '../services/openai.js';

export async function searchChunks({ query, match_count = 5, credentials = null }) {
  try {
    console.log('searchChunks called with:', { query, match_count });
    
    // Use provided credentials or fall back to default client
    const supabaseClient = credentials ? createSupabaseClient(credentials) : supabase;
    if (!supabaseClient) {
      throw new Error('No Supabase client available - provide credentials or set environment variables');
    }
    
    // Generate embedding for the search query
    console.log('Generating embedding for query...');
    const queryEmbedding = await generateEmbedding(query, credentials);
    console.log('Embedding generated, length:', queryEmbedding?.length);
    
    // Search for similar chunks using the Supabase function
    console.log('Calling Supabase search_chunks function...');
    const { data, error } = await supabaseClient.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_count: match_count,
      similarity_threshold: 0.3
    });
    
    console.log('Supabase response:', { data, error });
    
    if (error) {
      console.error('Supabase search error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
    
    console.log('Formatting results...');
    // Format results - return full chunk information
    const results = (data || []).map(result => ({
      chunk_id: result.id || result.chunk_id,
      chunk_text: result.content || result.chunk_text,
      document_id: result.document_id,
      document_name: result.filename || result.document_name,
      chunk_index: result.chunk_index,
      similarity: result.similarity
    }));
    
    return {
      success: true,
      query: query,
      results: results,
      count: results.length
    };
    
  } catch (error) {
    console.error('Search error:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
}

export const searchChunksTool = {
  name: 'search_chunks',
  description: 'Search for similar content in the knowledge base',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query text'
      },
      match_count: {
        type: 'number',
        description: 'Number of results to return (default: 5)',
        default: 5
      }
    },
    required: ['query']
  }
};