import { osReadClipboardImage } from "./os-bridge";
import { showErrorToast } from "./error-toast";

export async function readClipboardImageFile(): Promise<File[]> {
  let image;
  try {
    image = await osReadClipboardImage();
  } catch (err) {
    showErrorToast(
      "read_clipboard_image",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
  if (!image) return [];

  const binary = atob(image.data_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return [new File([bytes], image.file_name, { type: image.mime })];
}
