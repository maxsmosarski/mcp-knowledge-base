import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Only create default client if env vars are present
export const supabase = (supabaseUrl && supabaseKey) ? 
  createClient(supabaseUrl, supabaseKey) : null;

// Function to create a Supabase client with custom credentials
export function createSupabaseClient(credentials) {
  if (!credentials || !credentials.supabaseUrl || !credentials.supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  return createClient(credentials.supabaseUrl, credentials.supabaseKey);
}

// Storage utility functions
export const storage = {
  /**
   * Upload image file to Supabase Storage
   */
  async uploadImage(filePath, originalFileName = null) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = originalFileName || path.basename(filePath);
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    const storagePath = `public/${uniqueFileName}`;

    const { data, error } = await supabase.storage
      .from('images')
      .upload(storagePath, fileBuffer, {
        contentType: this.getMimeType(fileExtension),
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(storagePath);

    return { path: data.path, publicUrl, fileName, uniqueFileName };
  },

  /**
   * Get MIME type from file extension
   */
  getMimeType(extension) {
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  },

  /**
   * Check if file is a supported image type
   */
  isImageFile(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension);
  }
};