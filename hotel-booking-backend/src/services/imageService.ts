import fs from 'fs';
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
  path?: string;
  filename?: string;
}
import { Request, Response } from 'express';

class ImageService {
  private uploadDir: string;
  private baseUrl: string;

  constructor() {
    // Set upload directory - works for both development and compiled environments
    // From dist/src/services or src/services, go up to project root and then to uploads/
    // In development: src/services -> src -> project root -> uploads
    // In production: dist/src/services -> dist/src -> dist -> project root -> uploads

    const isProduction = __dirname.includes('dist');
    if (isProduction) {
      // From dist/src/services: go up to dist, then up to project root, then to uploads
      this.uploadDir = path.join(__dirname, '..', '..', '..', 'uploads');
    } else {
      // From src/services: go up to src, then up to project root, then to uploads
      this.uploadDir = path.join(__dirname, '..', '..', 'uploads');
    }



    this.baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

    // Ensure upload directory exists
    this.ensureUploadDir();
  }

  private ensureUploadDir(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      console.log('📁 Created uploads directory:', this.uploadDir);
    }
  }

  /**
   * Save uploaded image files and return their URLs (using Supabase Storage with local fallback)
   */
  async saveImages(files: UploadedFile[]): Promise<string[]> {
    console.log('📸 Starting image upload process to Supabase Storage...');
    
    const imageUrls: string[] = [];
    
    for (const file of files) {
      try {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        
        if (!allowedExts.includes(ext)) {
          console.warn('⚠️ Invalid file extension:', ext);
          continue;
        }

        const uniqueName = `${crypto.randomUUID()}${ext}`;
        
        // 1. Attempt to upload to Supabase Storage bucket 'resort-images'
        console.log(`📤 Uploading ${uniqueName} to Supabase bucket 'resort-images'...`);
        const { data, error } = await supabaseAdmin.storage
          .from('resort-images')
          .upload(uniqueName, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });

        if (error) {
          console.warn('⚠️ Supabase upload failed, falling back to local file system:', error.message);
          throw error; // Trigger fallback block
        }

        // 2. Retrieve public URL from Supabase
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from('resort-images')
          .getPublicUrl(uniqueName);

        imageUrls.push(publicUrl);
        console.log('✅ Image uploaded successfully to Supabase Storage:', publicUrl);
        
      } catch (error) {
        // Fallback: Write file to local uploads folder
        try {
          const ext = path.extname(file.originalname).toLowerCase();
          const uniqueName = `${crypto.randomUUID()}${ext}`;
          const filePath = path.join(this.uploadDir, uniqueName);
          
          fs.writeFileSync(filePath, file.buffer);
          
          const imageUrl = `${this.baseUrl}/uploads/${uniqueName}`;
          imageUrls.push(imageUrl);
          
          console.log('⚠️ Saved locally as fallback:', uniqueName);
          console.log('🔗 Generated Fallback URL:', imageUrl);
        } catch (localError) {
          console.error('❌ Failed to save image locally too:', localError);
        }
      }
    }
    
    console.log('📊 Total images processed successfully:', imageUrls.length);
    return imageUrls;
  }

  /**
   * Serve image file with proper headers
   */
  serveImage(req: Request, res: Response): void {
    const filename = req.params.filename;
    const filePath = path.join(this.uploadDir, filename);


    
    // Security check - prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.log('🚫 Security violation - invalid filename:', filename);
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('❌ File not found:', filePath);
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    console.log('📊 File size:', stats.size, 'bytes');
    
    // Set proper content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // Set enhanced headers for optimal caching and performance
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size.toString());
    
    // Enhanced caching strategy
    const oneYear = 365 * 24 * 60 * 60;
    res.setHeader('Cache-Control', `public, max-age=${oneYear}, immutable`);
    res.setHeader('ETag', `"${stats.size}-${stats.mtime.getTime()}"`);
    
    // Accept-Ranges for partial content support
    res.setHeader('Accept-Ranges', 'bytes');
    
    console.log('✅ Serving image:', {
      filename,
      contentType,
      size: stats.size,
      lastModified: stats.mtime,
      cacheControl: `public, max-age=${oneYear}, immutable`
    });
    
    // Send file
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('❌ Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).send('Error serving image');
        }
      } else {
        console.log('✅ Image served successfully');
      }
    });
  }

  /**
   * Get all uploaded files info
   */
  getUploadedFiles(): Array<{name: string, size: number, url: string}> {
    try {
      const files = fs.readdirSync(this.uploadDir);
      return files.map(file => {
        const filePath = path.join(this.uploadDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          url: `${this.baseUrl}/uploads/${file}`
        };
      });
    } catch (error) {
      console.error('❌ Error reading uploads directory:', error);
      return [];
    }
  }
}

export default new ImageService();
