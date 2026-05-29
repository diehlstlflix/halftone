import express from "express";
import multer from "multer";

import { GenerationValidationError } from "../core/line-halftone.js";
import { generateSvgFromUpload } from "./services/svg-generation-service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function parseRequestOptions(body = {}) {
  return {
    widthMm: body.widthMm,
    heightMm: body.heightMm,
    unit: body.unit,
    angleDeg: body.angleDeg,
    lineSpacingMm: body.lineSpacingMm,
    minThicknessMm: body.minThicknessMm,
    maxThicknessMm: body.maxThicknessMm,
    intensity: body.intensity,
    brightness: body.brightness,
    contrast: body.contrast,
    minBrightness: body.minBrightness,
    maxBrightness: body.maxBrightness,
    gamma: body.gamma,
    samplingMm: body.samplingMm,
    smoothing: body.smoothing,
    marginMm: body.marginMm,
    simplifyMm: body.simplifyMm,
    invert: body.invert,
    transparentSvg: body.transparentSvg,
    svgBackground: body.svgBackground,
    previewBackground: body.previewBackground,
  };
}

export function createApp() {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "line-halftone-generator",
    });
  });

  app.post("/generate-svg", upload.single("image"), async (req, res, next) => {
    try {
      if (!req.file) {
        throw new GenerationValidationError("Field 'image' is required.");
      }

      const { svg, options, image } = await generateSvgFromUpload({
        fileBuffer: req.file.buffer,
        options: parseRequestOptions(req.body),
      });

      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.setHeader("X-Output-Width-Mm", `${options.widthMm}`);
      res.setHeader("X-Output-Height-Mm", `${options.heightMm}`);
      res.setHeader("X-Source-Width-Px", `${image.width}`);
      res.setHeader("X-Source-Height-Px", `${image.height}`);
      res.send(svg);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, next) => {
    void next;
    if (error instanceof multer.MulterError) {
      res.status(400).json({
        error: "UPLOAD_ERROR",
        message: error.message,
      });
      return;
    }

    if (error instanceof GenerationValidationError) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: error.message,
        details: error.details ?? undefined,
      });
      return;
    }

    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error.message || "Unexpected server error.",
    });
  });

  return app;
}
