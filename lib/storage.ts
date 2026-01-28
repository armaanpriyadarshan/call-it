import { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system/next';

type Bucket = 'avatars' | 'question-images';

function generateFileName(originalUri: string): string {
  const extension = originalUri.split('.').pop()?.toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.${extension}`;
}

export async function uploadImage(
  supabase: SupabaseClient,
  bucket: Bucket,
  userId: string,
  imageUri: string
): Promise<string> {
  const fileName = generateFileName(imageUri);
  const filePath = `${userId}/${fileName}`;

  const file = new File(imageUri);
  const bytes = await file.bytes();

  const contentType = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, bytes, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return urlData.publicUrl;
}

export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  imageUri: string
): Promise<string> {
  return uploadImage(supabase, 'avatars', userId, imageUri);
}

export async function uploadQuestionImage(
  supabase: SupabaseClient,
  userId: string,
  imageUri: string
): Promise<string> {
  return uploadImage(supabase, 'question-images', userId, imageUri);
}

export async function deleteImage(
  supabase: SupabaseClient,
  bucket: Bucket,
  filePath: string
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([filePath]);

  if (error) {
    throw error;
  }
}
