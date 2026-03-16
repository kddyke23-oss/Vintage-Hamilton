// src/hooks/useImageUpload.js
// Shared image upload hook for Vintage @ Hamilton
// Handles validation, Canvas-based compression, and Supabase Storage upload.
//
// Usage:
//   const { uploading, error, uploadImage } = useImageUpload({
//     bucket: 'recommendations',   // Supabase storage bucket name
//     folder: 'cards',             // optional sub-folder within bucket
//     maxDimension: 1200,          // optional, default 1200 (use 400 for avatars)
//   });
//
//   const url = await uploadImage(file);  // returns public URL string, or null on failure

import { useState } from 'react';
import { supabase } from '../lib/supabase';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB hard limit
const DEFAULT_MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Compress an image File using the Canvas API.
 * Returns a Blob at JPEG_QUALITY, capped at maxDimension on the longest side.
 */
async function compressImage(file, maxDimension) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Scale down proportionally if either dimension exceeds the cap
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas compression produced no output.'));
          }
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load image for compression.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Generate a unique file path for storage.
 * Format: {folder/}{timestamp}_{random}.jpg
 */
function buildStoragePath(folder) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `${timestamp}_${random}.jpg`;
  return folder ? `${folder}/${filename}` : filename;
}

/**
 * useImageUpload hook
 *
 * @param {object} options
 * @param {string} options.bucket         - Supabase Storage bucket name (required)
 * @param {string} [options.folder]       - Sub-folder within the bucket (optional)
 * @param {number} [options.maxDimension] - Max px on longest side (default 1200)
 *
 * @returns {{ uploading: boolean, error: string|null, uploadImage: Function }}
 *
 * uploadImage(file) — returns public URL string on success, or null on failure.
 * On failure, `error` is set with a human-readable message.
 */
export function useImageUpload({ bucket, folder = '', maxDimension = DEFAULT_MAX_DIMENSION } = {}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function uploadImage(file) {
    setError(null);

    if (!file) {
      setError('No file provided.');
      return null;
    }

    // Type check
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please choose a JPEG, PNG, WebP, or GIF image.');
      return null;
    }

    // Hard size check before attempting compression
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('Image must be smaller than 5 MB.');
      return null;
    }

    if (!bucket) {
      setError('Storage bucket not configured.');
      return null;
    }

    setUploading(true);

    try {
      // Compress via Canvas API
      const compressedBlob = await compressImage(file, maxDimension);

      // Build unique path and upload
      const storagePath = buildStoragePath(folder);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, compressedBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Retrieve public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);

      if (!urlData?.publicUrl) {
        throw new Error('Could not retrieve public URL after upload.');
      }

      return urlData.publicUrl;

    } catch (err) {
      console.error('[useImageUpload] Upload failed:', err);
      setError(err.message || 'Image upload failed. Please try again.');
      return null;

    } finally {
      setUploading(false);
    }
  }

  return { uploading, error, uploadImage };
}
