import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../core/supabase';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
  fieldname: string;
  encoding: string;
}

class ImageService {
  /**
   * Save uploaded image files and return their URLs using strictly Supabase Storage.
   * No local file system fallback is provided for cloud-native deployment.
   */
  async saveImages(files: UploadedFile[]): Promise<string[]> {
    console.log('📸 Starting image upload process exclusively to Supabase Storage...');
    
    const imageUrls: string[] = [];
    
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
      
      if (!allowedExts.includes(ext)) {
        console.warn('⚠️ Invalid file extension:', ext);
        continue;
      }

      const uniqueName = `${crypto.randomUUID()}${ext}`;
      
      console.log(`📤 Uploading ${uniqueName} to Supabase bucket 'resort-images'...`);
      const { data, error } = await supabaseAdmin.storage
        .from('resort-images')
        .upload(uniqueName, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (error) {
        console.error(`❌ Supabase upload failed for ${uniqueName}:`, error.message);
        throw new Error(`Cloud storage upload failed: ${error.message}`);
      }

      // Retrieve public URL from Supabase
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('resort-images')
        .getPublicUrl(uniqueName);

      imageUrls.push(publicUrl);
      console.log('✅ Image uploaded successfully to Supabase Storage:', publicUrl);
    }
    
    console.log('📊 Total images processed successfully:', imageUrls.length);
    return imageUrls;
  }

  /**
   * Get all uploaded files info from Supabase bucket
   */
  async getUploadedFiles(): Promise<Array<{name: string, size: number, url: string}>> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from('resort-images')
        .list();

      if (error || !data) {
        console.error('❌ Error listing Supabase files:', error?.message);
        return [];
      }

      return data.map(file => {
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from('resort-images')
          .getPublicUrl(file.name);

        return {
          name: file.name,
          size: file.metadata?.size || 0,
          url: publicUrl
        };
      });
    } catch (error) {
      console.error('❌ Error fetching files from Supabase:', error);
      return [];
    }
  }
}

export default new ImageService();
