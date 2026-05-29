import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import sharp from "sharp";

import { generateLineHalftoneSvg, normalizeGenerationOptions } from "../core/line-halftone.js";

async function createFixtureImage() {
  const buffer = await readFile(new URL("./fixtures/example-input.png", import.meta.url));
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data,
  };
}

test("generator emits a valid SVG that sharp can parse", async () => {
  const image = await createFixtureImage();
  const svg = generateLineHalftoneSvg({
    image,
    options: {
      widthMm: 100,
      heightMm: 60,
      angleDeg: 30,
    },
  });

  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

  const metadata = await sharp(Buffer.from(svg)).metadata();
  assert.equal(metadata.format, "svg");
});

test("generator preserves millimeter output dimensions", async () => {
  const image = await createFixtureImage();
  const svg = generateLineHalftoneSvg({
    image,
    options: {
      widthMm: 123,
      heightMm: 77,
    },
  });

  assert.match(svg, /width="123mm"/);
  assert.match(svg, /height="77mm"/);
  assert.match(svg, /viewBox="0 0 123 77"/);
});

test("generator emits closed filled paths for slicer compatibility", async () => {
  const image = await createFixtureImage();
  const svg = generateLineHalftoneSvg({
    image,
    options: {
      widthMm: 90,
      heightMm: 90,
      minThicknessMm: 0.3,
      maxThicknessMm: 2.2,
      intensity: 30,
    },
  });

  const paths = svg.match(/<path d="([^"]+)" fill="[^"]+" stroke="none" \/>/g) ?? [];
  assert.ok(paths.length > 0, "Expected at least one generated path");
  for (const pathTag of paths) {
    assert.match(pathTag, / Z"/);
  }
});

test("normalizeGenerationOptions derives height from aspect ratio when omitted", () => {
  const options = normalizeGenerationOptions(
    {
      widthMm: 80,
      heightMm: null,
    },
    1.5
  );

  assert.equal(options.heightMm, 120);
});
