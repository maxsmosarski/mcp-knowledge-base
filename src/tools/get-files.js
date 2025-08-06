import { supabase, createSupabaseClient } from '../services/supabase.js';

export async function getFiles({ credentials = null } = {}) {
  // Use provided credentials or fall back to default client
  const supabaseClient = credentials ? createSupabaseClient(credentials) : supabase;
  if (!supabaseClient) {
    throw new Error('No Supabase client available - provide credentials or set environment variables');
  }
  
  const { data, error } = await supabaseClient
    .from('documents')
    .select('id, filename, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get files: ${error.message}`);
  }

  return {
    files: data || [],
    count: data?.length || 0
  };
}