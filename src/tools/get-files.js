import { supabase } from '../services/supabase.js';

export async function getFiles() {
  const { data, error } = await supabase
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