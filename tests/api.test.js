import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

import { createApp } from "../server/app.js";

async function createFixtureBuffer() {
  return readFile(new URL("./fixtures/example-input.png", import.meta.url));
}

test("GET /health returns service status", async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "ok");
  } finally {
    server.close();
  }
});

test("POST /generate-svg returns a valid SVG", async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const port = server.address().port;
    const form = new FormData();
    const buffer = await createFixtureBuffer();

    form.set("image", new File([buffer], "fixture.png", { type: "image/png" }));
    form.set("widthMm", "110");
    form.set("heightMm", "80");
    form.set("angleDeg", "45");
    form.set("lineSpacingMm", "1.5");
    form.set("minThicknessMm", "0.25");
    form.set("maxThicknessMm", "2.1");
    form.set("transparentSvg", "true");

    const response = await fetch(`http://127.0.0.1:${port}/generate-svg`, {
      method: "POST",
      body: form,
    });

    const svg = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.match(svg, /width="110mm"/);
    assert.match(svg, /height="80mm"/);
    assert.ok(!svg.includes("<rect width=\"100%\" height=\"100%\""), "transparent SVG should not contain background rect");
  } finally {
    server.close();
  }
});

test("POST /generate-svg rejects invalid files", async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const port = server.address().port;
    const form = new FormData();
    form.set("image", new File(["not an image"], "fixture.txt", { type: "text/plain" }));

    const response = await fetch(`http://127.0.0.1:${port}/generate-svg`, {
      method: "POST",
      body: form,
    });

    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "VALIDATION_ERROR");
  } finally {
    server.close();
  }
});
