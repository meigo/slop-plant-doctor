// Resize a File/Blob to max 2048px on the longest side and JPEG-encode at quality 80.
// Returns a Blob (image/jpeg) and the data URL for direct submission/preview.

const MAX_DIM = 2048;
const QUALITY = 0.8;

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function targetDims(w: number, h: number): { w: number; h: number } {
  if (w <= MAX_DIM && h <= MAX_DIM) return { w, h };
  if (w >= h) {
    const ratio = MAX_DIM / w;
    return { w: MAX_DIM, h: Math.round(h * ratio) };
  } else {
    const ratio = MAX_DIM / h;
    return { w: Math.round(w * ratio), h: MAX_DIM };
  }
}

export type CompressedPhoto = { blob: Blob; dataUrl: string };

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const img = await loadImage(file);
  const dims = targetDims(img.naturalWidth, img.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(img, 0, 0, dims.w, dims.h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      QUALITY
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });

  return { blob, dataUrl };
}
