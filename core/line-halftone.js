export const DEFAULT_GENERATION_OPTIONS = Object.freeze({
  unit: "mm",
  widthMm: 120,
  heightMm: 120,
  angleDeg: 90,
  lineSpacingMm: 1.6,
  minThicknessMm: 0.25,
  maxThicknessMm: 2.4,
  intensity: 0,
  brightness: 0,
  contrast: 0,
  minBrightness: 0,
  maxBrightness: 255,
  gamma: 1.35,
  samplingMm: 0.55,
  smoothing: 2,
  marginMm: 3,
  simplifyMm: 0.12,
  invert: false,
  transparentSvg: false,
  svgBackground: "#ffffff",
  strokeColor: "#000000",
});

export class GenerationValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "GenerationValidationError";
    this.details = details;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function rdp(points, eps) {
  if (!points || points.length < 3 || eps <= 0) return points;

  const first = points[0];
  const last = points[points.length - 1];

  const lineDistance = (point) => {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const denom = dx * dx + dy * dy;

    if (denom === 0) {
      return Math.hypot(point.x - first.x, point.y - first.y);
    }

    const t = ((point.x - first.x) * dx + (point.y - first.y) * dy) / denom;
    const px = first.x + t * dx;
    const py = first.y + t * dy;
    return Math.hypot(point.x - px, point.y - py);
  };

  let maxDistance = -1;
  let splitIndex = -1;

  for (let index = 1; index < points.length - 1; index += 1) {
    const candidate = lineDistance(points[index]);
    if (candidate > maxDistance) {
      maxDistance = candidate;
      splitIndex = index;
    }
  }

  if (maxDistance > eps && splitIndex !== -1) {
    const left = rdp(points.slice(0, splitIndex + 1), eps);
    const right = rdp(points.slice(splitIndex), eps);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}

function pointsToPathD(points, decimals = 3) {
  if (!points.length) return "";

  const round = (value) => Number(value.toFixed(decimals));
  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;

  for (let index = 1; index < points.length; index += 1) {
    path += ` L ${round(points[index].x)} ${round(points[index].y)}`;
  }

  return `${path} Z`;
}

function clipLineToRect(point, direction, rect) {
  const { xMin, xMax, yMin, yMax } = rect;
  let t0 = -1e9;
  let t1 = 1e9;

  if (Math.abs(direction.x) < 1e-12) {
    if (point.x < xMin || point.x > xMax) return null;
  } else {
    const tx1 = (xMin - point.x) / direction.x;
    const tx2 = (xMax - point.x) / direction.x;
    t0 = Math.max(t0, Math.min(tx1, tx2));
    t1 = Math.min(t1, Math.max(tx1, tx2));
  }

  if (Math.abs(direction.y) < 1e-12) {
    if (point.y < yMin || point.y > yMax) return null;
  } else {
    const ty1 = (yMin - point.y) / direction.y;
    const ty2 = (yMax - point.y) / direction.y;
    t0 = Math.max(t0, Math.min(ty1, ty2));
    t1 = Math.min(t1, Math.max(ty1, ty2));
  }

  if (t0 > t1) return null;

  return {
    a: { x: point.x + direction.x * t0, y: point.y + direction.y * t0 },
    b: { x: point.x + direction.x * t1, y: point.y + direction.y * t1 },
  };
}

function buildSampler(image) {
  const { data, width, height } = image;
  return {
    sampleLuma(u, v) {
      const x = clamp(Math.round(u * (width - 1)), 0, width - 1);
      const y = clamp(Math.round(v * (height - 1)), 0, height - 1);
      const idx = (y * width + x) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },
  };
}

function applyBrightnessContrast(luma, brightness, contrast) {
  const brightnessShift = brightness / 100;
  const contrastFactor = contrast / 100;
  let adjusted = luma + brightnessShift;

  if (contrastFactor !== 0) {
    const k = (1 + contrastFactor) / (1 - contrastFactor);
    adjusted = (adjusted - 0.5) * k + 0.5;
  }

  return clamp(adjusted, 0, 1);
}

function remapMinMax(luma, minBrightness, maxBrightness) {
  const min = clamp(minBrightness, 0, 255) / 255;
  const max = clamp(maxBrightness, 0, 255) / 255;

  if (max <= min) {
    return clamp((luma - min) / 1e-6, 0, 1);
  }

  return clamp((luma - min) / (max - min), 0, 1);
}

function smooth1D(values, radius) {
  const size = Math.max(0, Math.floor(radius));
  if (size <= 0) return values;

  return values.map((_, index) => {
    let sum = 0;
    let count = 0;

    for (let offset = -size; offset <= size; offset += 1) {
      const lookup = index + offset;
      if (lookup >= 0 && lookup < values.length) {
        sum += values[lookup];
        count += 1;
      }
    }

    return sum / count;
  });
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  return fallback;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOutputHeightMm(widthMm, imageAspectRatio, explicitHeightMm = null) {
  if (explicitHeightMm !== null && explicitHeightMm !== undefined) {
    return Math.max(1, explicitHeightMm);
  }

  if (!Number.isFinite(imageAspectRatio) || imageAspectRatio <= 0) {
    return widthMm;
  }

  return Math.max(1, Number((widthMm * imageAspectRatio).toFixed(3)));
}

export function normalizeGenerationOptions(rawOptions = {}, imageAspectRatio = null) {
  const options = {
    ...DEFAULT_GENERATION_OPTIONS,
    ...rawOptions,
  };

  const unit = options.unit ?? "mm";
  if (unit !== "mm") {
    throw new GenerationValidationError("Only millimeter output is supported.", { unit });
  }

  const widthMm = Math.max(1, toNumber(options.widthMm, DEFAULT_GENERATION_OPTIONS.widthMm));
  const heightMm = getOutputHeightMm(
    widthMm,
    imageAspectRatio,
    options.heightMm ?? rawOptions.heightMm ?? null
  );
  const lineSpacingMm = Math.max(0.15, toNumber(options.lineSpacingMm, DEFAULT_GENERATION_OPTIONS.lineSpacingMm));
  const minThicknessMm = Math.max(0, toNumber(options.minThicknessMm, DEFAULT_GENERATION_OPTIONS.minThicknessMm));
  const maxThicknessMm = Math.max(
    minThicknessMm + 1e-6,
    toNumber(options.maxThicknessMm, DEFAULT_GENERATION_OPTIONS.maxThicknessMm)
  );

  return {
    unit,
    widthMm,
    heightMm,
    angleDeg: clamp(toNumber(options.angleDeg, DEFAULT_GENERATION_OPTIONS.angleDeg), 0, 180),
    lineSpacingMm,
    minThicknessMm,
    maxThicknessMm,
    intensity: clamp(toNumber(options.intensity, DEFAULT_GENERATION_OPTIONS.intensity), -100, 100),
    brightness: clamp(toNumber(options.brightness, DEFAULT_GENERATION_OPTIONS.brightness), -100, 100),
    contrast: clamp(toNumber(options.contrast, DEFAULT_GENERATION_OPTIONS.contrast), -100, 100),
    minBrightness: clamp(toNumber(options.minBrightness, DEFAULT_GENERATION_OPTIONS.minBrightness), 0, 255),
    maxBrightness: clamp(toNumber(options.maxBrightness, DEFAULT_GENERATION_OPTIONS.maxBrightness), 0, 255),
    gamma: clamp(toNumber(options.gamma, DEFAULT_GENERATION_OPTIONS.gamma), 0.05, 6),
    samplingMm: Math.max(0.05, toNumber(options.samplingMm, DEFAULT_GENERATION_OPTIONS.samplingMm)),
    smoothing: clamp(toNumber(options.smoothing, DEFAULT_GENERATION_OPTIONS.smoothing), 0, 12),
    marginMm: clamp(toNumber(options.marginMm, DEFAULT_GENERATION_OPTIONS.marginMm), 0, widthMm / 2),
    simplifyMm: Math.max(0, toNumber(options.simplifyMm, DEFAULT_GENERATION_OPTIONS.simplifyMm)),
    invert: toBoolean(options.invert, DEFAULT_GENERATION_OPTIONS.invert),
    transparentSvg: toBoolean(options.transparentSvg, DEFAULT_GENERATION_OPTIONS.transparentSvg),
    svgBackground: options.svgBackground ?? DEFAULT_GENERATION_OPTIONS.svgBackground,
    strokeColor: options.strokeColor ?? DEFAULT_GENERATION_OPTIONS.strokeColor,
  };
}

export function validateImageData(image) {
  if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || !image.data) {
    throw new GenerationValidationError("Image data must include width, height and RGBA pixel data.");
  }

  const expectedLength = image.width * image.height * 4;
  if (image.data.length !== expectedLength) {
    throw new GenerationValidationError("RGBA data length does not match image dimensions.", {
      expectedLength,
      actualLength: image.data.length,
    });
  }
}

export function generateLineHalftoneSvg({ image, options: rawOptions = {} }) {
  validateImageData(image);

  const imageAspectRatio = image.height / image.width;
  const options = normalizeGenerationOptions(rawOptions, imageAspectRatio);
  const sampler = buildSampler(image);

  const W = options.widthMm;
  const H = options.heightMm;
  const rect = {
    xMin: options.marginMm,
    xMax: Math.max(options.marginMm + 0.1, W - options.marginMm),
    yMin: options.marginMm,
    yMax: Math.max(options.marginMm + 0.1, H - options.marginMm),
  };

  const center = { x: W / 2, y: H / 2 };
  const angle = (Math.PI / 180) * options.angleDeg;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const corners = [
    { x: rect.xMin, y: rect.yMin },
    { x: rect.xMax, y: rect.yMin },
    { x: rect.xMax, y: rect.yMax },
    { x: rect.xMin, y: rect.yMax },
  ];
  const project = (point) => point.x * normal.x + point.y * normal.y;

  let sMin = Infinity;
  let sMax = -Infinity;
  for (const corner of corners) {
    const projection = project(corner);
    sMin = Math.min(sMin, projection);
    sMax = Math.max(sMax, projection);
  }

  const sCenter = project(center);
  const startIndex = Math.floor((sMin - sCenter) / options.lineSpacingMm) - 1;
  const endIndex = Math.ceil((sMax - sCenter) / options.lineSpacingMm) + 1;
  const paths = [];

  for (let lineIndex = startIndex; lineIndex <= endIndex; lineIndex += 1) {
    const projection = sCenter + lineIndex * options.lineSpacingMm;
    const delta = projection - sCenter;
    const anchor = {
      x: center.x + normal.x * delta,
      y: center.y + normal.y * delta,
    };

    const segment = clipLineToRect(anchor, direction, rect);
    if (!segment) continue;

    const segmentLength = dist(segment.a, segment.b);
    if (segmentLength < options.samplingMm * 1.2) continue;

    const steps = Math.max(2, Math.ceil(segmentLength / options.samplingMm));
    const centerPoints = new Array(steps + 1);
    const widths = new Array(steps + 1);

    for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
      const t = stepIndex / steps;
      const x = lerp(segment.a.x, segment.b.x, t);
      const y = lerp(segment.a.y, segment.b.y, t);
      const u = clamp(x / W, 0, 1);
      const v = clamp(y / H, 0, 1);

      let luma = sampler.sampleLuma(u, v);
      luma = remapMinMax(luma, options.minBrightness, options.maxBrightness);
      luma = applyBrightnessContrast(luma, options.brightness, options.contrast);

      let strength = options.invert ? luma : 1 - luma;
      strength = clamp(strength + options.intensity / 100, 0, 1);
      strength = Math.pow(strength, options.gamma);

      centerPoints[stepIndex] = { x, y };
      widths[stepIndex] = options.minThicknessMm + strength * (options.maxThicknessMm - options.minThicknessMm);
    }

    const smoothed = smooth1D(widths, options.smoothing);
    const widest = smoothed.reduce((max, width) => Math.max(max, width), 0);
    if (widest < options.minThicknessMm + 0.03) continue;

    const left = [];
    const right = [];

    for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
      const point = centerPoints[stepIndex];
      const halfWidth = smoothed[stepIndex] / 2;
      left.push({ x: point.x + normal.x * halfWidth, y: point.y + normal.y * halfWidth });
      right.push({ x: point.x - normal.x * halfWidth, y: point.y - normal.y * halfWidth });
    }

    const leftOutline = options.simplifyMm > 0 ? rdp(left, options.simplifyMm) : left;
    const rightOutline = options.simplifyMm > 0 ? rdp(right, options.simplifyMm) : right;
    const polygon = (leftOutline.length >= 2 ? leftOutline : left).concat(
      [...(rightOutline.length >= 2 ? rightOutline : right)].reverse()
    );

    if (polygon.length < 6) continue;
    if (dist2(polygon[0], polygon[Math.floor(polygon.length / 2)]) < 1e-6) continue;

    paths.push(`<path d="${pointsToPathD(polygon)}" fill="${options.strokeColor}" stroke="none" />`);
  }

  const background = options.transparentSvg
    ? ""
    : `  <rect width="100%" height="100%" fill="${options.svgBackground}" />\n`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n` +
    background +
    `  ${paths.join("\n  ")}\n` +
    `</svg>`
  );
}
