import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hands a generated document to the user.
 *
 * The file is written into the app's own cache directory and then passed to
 * the system share sheet, which is the only way on both platforms to get a
 * file into Excel, Drive, WhatsApp or email. Cache is the right place for it:
 * the system may reclaim it, and the authoritative copy is always the server.
 */
export async function shareTextFile(
  filename: string,
  contents: string,
  mimeType: string,
): Promise<{ shared: boolean; uri: string }> {
  const uri = `${FileSystem.Paths.cache.uri}${filename}`;

  const file = new FileSystem.File(uri);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) {
    // Nothing to share into (a bare simulator, or a locked-down device).
    // The file still exists, so the caller can tell the user where it is.
    return { shared: false, uri };
  }

  await Sharing.shareAsync(uri, { mimeType, UTI: 'public.comma-separated-values-text' });
  return { shared: true, uri };
}
