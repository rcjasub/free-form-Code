// Pasted images are saved inside the block itself as a data URL (like
// drawings save their points), so they're shrunk here first: the backend
// accepts block requests up to 3MB, and every viewer downloads the image
// with the canvas.

const MAX_DIMENSION = 1600; // longest side, in pixels
const MAX_CHARS = 1_500_000; // ~1.1MB of image data once base64-encoded
// how wide a pasted image first appears on the canvas
export const IMAGE_DISPLAY_WIDTH = 480;

export async function imageToDataUrl(file: Blob): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    // Shrink further until it fits — a detailed screenshot can still be
    // too big at 1600px.
    for (let attempt = 0; attempt < 5; attempt++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);

      let dataUrl = canvas.toDataURL("image/webp", 0.85);
      // Safari can't encode WebP and silently returns PNG instead
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      if (dataUrl.length <= MAX_CHARS) return { dataUrl, width, height };
      scale *= 0.7;
    }
    throw new Error("That image is too large to paste.");
  } finally {
    bitmap.close();
  }
}
