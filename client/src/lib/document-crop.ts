export type DocumentCropProposal = {
  confidence: number;
  previewUrl: string;
  correctedFile: File;
};

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function proposeDocumentCrop(file: File): Promise<DocumentCropProposal | null> {
  if (!file.type.startsWith("image/")) return null;
  const image = await createImageBitmap(file);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1, bright = 0;
  const step = Math.max(2, Math.round(Math.min(width, height) / 260));
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const index = (y * width + x) * 4;
    if (luminance(pixels[index], pixels[index + 1], pixels[index + 2]) > 185) {
      bright += 1; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  image.close();
  if (right <= left || bottom <= top) return null;
  const padding = Math.round(Math.min(width, height) * 0.025);
  left = Math.max(0, left - padding); top = Math.max(0, top - padding); right = Math.min(width, right + padding); bottom = Math.min(height, bottom + padding);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const coverage = (cropWidth * cropHeight) / (width * height);
  const confidence = Math.max(0, Math.min(1, coverage > 0.2 && coverage < 0.96 ? 0.65 + Math.min(bright / ((width / step) * (height / step)), 0.25) : 0));
  if (confidence < 0.7) return null;
  const output = document.createElement("canvas");
  output.width = cropWidth;
  output.height = cropHeight;
  const outputContext = output.getContext("2d");
  if (!outputContext) return null;
  outputContext.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return null;
  const correctedFile = new File([blob], file.name.replace(/\.[^.]+$/, "") + "-recortado.jpg", { type: "image/jpeg", lastModified: file.lastModified });
  return { confidence, previewUrl: URL.createObjectURL(blob), correctedFile };
}
