import { supabase } from '@/lib/supabase'

/**
 * Delete a file from Supabase Storage by its public URL.
 * Extracts the storage path from the URL and removes the file.
 * Fire-and-forget — errors are logged but not thrown.
 *
 * @param {string|null} photoUrl - The full public URL of the file
 * @param {string} bucket - The Supabase Storage bucket name
 */
export async function deleteStoragePhoto(photoUrl, bucket) {
  if (!photoUrl) return
  try {
    const marker = `/object/public/${bucket}/`
    const idx = photoUrl.indexOf(marker)
    if (idx === -1) return
    const storagePath = photoUrl.slice(idx + marker.length)
    await supabase.storage.from(bucket).remove([storagePath])
  } catch (err) {
    console.error(`Failed to delete photo from ${bucket}:`, err)
  }
}
