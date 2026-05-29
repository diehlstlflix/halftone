import sharp from "sharp";

import {
  DEFAULT_GENERATION_OPTIONS,
  GenerationValidationError,
  generateLineHalftoneSvg,
  normalizeGenerationOptions,
} from "../../core/line-halftone.js";

export function getDefaultApiOptions() {
  return { ...DEFAULT_GENERATION_OPTIONS };
}

export async function decodeUploadedImage(buffer) {
  try {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      width: info.width,
      height: info.height,
      data,
    };
  } catch (error) {
    throw new GenerationValidationError("Unable to decode uploaded image. Send a valid PNG, JPG, WEBP or SVG file.", {
      cause: error.message,
    });
  }
}

export async function generateSvgFromUpload({ fileBuffer, options }) {
  if (!fileBuffer?.length) {
    throw new GenerationValidationError("Image upload is required.");
  }

  const image = await decodeUploadedImage(fileBuffer);
  const normalizedOptions = normalizeGenerationOptions(options, image.height / image.width);
  const svg = generateLineHalftoneSvg({
    image,
    options: normalizedOptions,
  });

  return {
    svg,
    options: normalizedOptions,
    image,
  };
}
