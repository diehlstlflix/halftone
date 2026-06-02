import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_GENERATION_OPTIONS,
  generateLineHalftoneSvg,
  getOutputHeightMm,
} from "../core/line-halftone.js";

const MIN_THICKNESS_MM = 0.8;
const MIN_WIDTH_MM = 100;
const MAX_WIDTH_MM = 300;

function Section({ title, children, defaultOpen = true }) {
  return (
    <details className="rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow" open={defaultOpen}>
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-zinc-100">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-zinc-400">v</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Slider({ label, value, setValue, min, max, step = 1, fmt }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-200">{label}</div>
        <div className="tabular-nums text-xs text-zinc-400">{fmt ? fmt(value) : value}</div>
      </div>
      <input
        className="w-full accent-zinc-200"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
      />
    </div>
  );
}

function PresetButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-zinc-700 bg-zinc-900/40 px-3 py-1.5 text-sm hover:bg-zinc-900"
      type="button"
    >
      {label}
    </button>
  );
}

async function readImageDataFromFile(file, canvas) {
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to load image preview."));
      element.src = url;
    });

    const targetWidth = 1000;
    const aspectRatio = image.height / image.width;
    canvas.width = targetWidth;
    canvas.height = Math.max(1, Math.round(targetWidth * aspectRatio));

    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    return {
      width: imageData.width,
      height: imageData.height,
      data: imageData.data,
      aspectRatio,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function LineHalftoneApp() {
  const canvasRef = useRef(null);
  const panStart = useRef(null);
  const previewRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [image, setImage] = useState(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);

  const [brightness, setBrightness] = useState(DEFAULT_GENERATION_OPTIONS.brightness);
  const [contrast, setContrast] = useState(DEFAULT_GENERATION_OPTIONS.contrast);
  const [minBrightness, setMinBrightness] = useState(DEFAULT_GENERATION_OPTIONS.minBrightness);
  const [maxBrightness, setMaxBrightness] = useState(DEFAULT_GENERATION_OPTIONS.maxBrightness);
  const [angleDeg, setAngleDeg] = useState(DEFAULT_GENERATION_OPTIONS.angleDeg);
  const [lineSpacingMm, setLineSpacingMm] = useState(DEFAULT_GENERATION_OPTIONS.lineSpacingMm);
  const [minThicknessMm, setMinThicknessMm] = useState(MIN_THICKNESS_MM);
  const [maxThicknessMm, setMaxThicknessMm] = useState(DEFAULT_GENERATION_OPTIONS.maxThicknessMm);
  const [intensity, setIntensity] = useState(DEFAULT_GENERATION_OPTIONS.intensity);
  const [gamma, setGamma] = useState(DEFAULT_GENERATION_OPTIONS.gamma);
  const [samplingMm, setSamplingMm] = useState(DEFAULT_GENERATION_OPTIONS.samplingMm);
  const [smoothing, setSmoothing] = useState(DEFAULT_GENERATION_OPTIONS.smoothing);
  const [widthMm, setWidthMm] = useState(DEFAULT_GENERATION_OPTIONS.widthMm);
  const [lockAspect, setLockAspect] = useState(true);
  const [heightMm, setHeightMm] = useState(DEFAULT_GENERATION_OPTIONS.heightMm);
  const [marginMm, setMarginMm] = useState(DEFAULT_GENERATION_OPTIONS.marginMm);
  const [simplifyMm, setSimplifyMm] = useState(DEFAULT_GENERATION_OPTIONS.simplifyMm);
  const [invert, setInvert] = useState(DEFAULT_GENERATION_OPTIONS.invert);
  const [transparentSvg, setTransparentSvg] = useState(true);
  const [previewBackground, setPreviewBackground] = useState("white");

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Mouse wheel zoom via non-passive listener
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.25, parseFloat((z + delta).toFixed(2)))));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const generationOptions = useMemo(
    () => ({
      widthMm,
      heightMm: lockAspect ? getOutputHeightMm(widthMm, imageAspectRatio) : heightMm,
      angleDeg,
      lineSpacingMm,
      minThicknessMm,
      maxThicknessMm,
      intensity,
      brightness,
      contrast,
      minBrightness,
      maxBrightness,
      gamma,
      samplingMm,
      smoothing,
      marginMm,
      simplifyMm,
      invert,
      transparentSvg,
    }),
    [
      angleDeg,
      brightness,
      contrast,
      gamma,
      heightMm,
      imageAspectRatio,
      intensity,
      invert,
      lineSpacingMm,
      lockAspect,
      marginMm,
      maxBrightness,
      maxThicknessMm,
      minBrightness,
      minThicknessMm,
      samplingMm,
      simplifyMm,
      smoothing,
      transparentSvg,
      widthMm,
    ]
  );

  const deferredOptions = useDeferredValue(generationOptions);
  const svgText = useMemo(() => {
    if (!image) return "";
    return generateLineHalftoneSvg({ image, options: deferredOptions });
  }, [deferredOptions, image]);
  const previewMarkup = useMemo(() => (svgText ? { __html: svgText } : null), [svgText]);

  async function onPickFile(event) {
    const file = event.target.files?.[0];
    if (!file || !canvasRef.current) return;
    setFileName(file.name);
    const loaded = await readImageDataFromFile(file, canvasRef.current);
    setImage(loaded);
    setImageAspectRatio(loaded.aspectRatio);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function downloadSvg() {
    if (!svgText) return;
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(fileName || "halftone").replace(/\.[^/.]+$/, "")}_line_halftone.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handlePreviewMouseDown(e) {
    setDragging(true);
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.preventDefault();
  }

  function handlePreviewMouseMove(e) {
    if (!dragging || !panStart.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }

  function handlePreviewMouseUp() {
    setDragging(false);
  }

  function handleTouchStart(e) {
    const touch = e.touches[0];
    setDragging(true);
    panStart.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
  }

  function handleTouchMove(e) {
    if (!dragging || !panStart.current) return;
    const touch = e.touches[0];
    setPan({ x: touch.clientX - panStart.current.x, y: touch.clientY - panStart.current.y });
  }

  function handleTouchEnd() {
    setDragging(false);
  }

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  const previewClass =
    previewBackground === "white" ? "bg-white" : previewBackground === "gray" ? "bg-zinc-200" : "bg-zinc-950";
  const effectiveHeightMm = lockAspect ? Math.round(getOutputHeightMm(widthMm, imageAspectRatio)) : heightMm;

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-zinc-100 md:p-8">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Controls column */}
        <div className="lg:col-span-1">
          <div className="space-y-4 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
              <div className="text-lg font-semibold">Line Halftone / Barcode Portrait</div>
              <div className="mt-1 text-sm text-zinc-400">
                Linhas paralelas com espessura variavel, angulo livre e SVG fechado para PrusaSlicer.
              </div>

              <label className="mt-4 block">
                <div className="mb-2 text-sm text-zinc-200">Imagem</div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-200 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-900 hover:file:bg-white"
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={downloadSvg}
                  disabled={!svgText}
                  className={`rounded-xl border px-4 py-2 font-semibold shadow transition ${
                    svgText
                      ? "border-zinc-200 bg-zinc-200 text-zinc-900 hover:bg-white"
                      : "cursor-not-allowed border-zinc-800 bg-zinc-800 text-zinc-500"
                  }`}
                >
                  Download SVG
                </button>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    className="accent-zinc-200"
                    checked={invert}
                    onChange={(event) => setInvert(event.target.checked)}
                  />
                  Inverter claro/escuro
                </label>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    className="accent-zinc-200"
                    checked={transparentSvg}
                    onChange={(event) => setTransparentSvg(event.target.checked)}
                  />
                  SVG transparente
                </label>

                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-zinc-400">Preview</span>
                  <select
                    value={previewBackground}
                    onChange={(event) => setPreviewBackground(event.target.value)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-200"
                  >
                    <option value="white">Branco</option>
                    <option value="gray">Cinza</option>
                    <option value="dark">Escuro</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 text-xs text-zinc-500">
                Para impressao 3D, use espessura minima proxima do que o seu bico consegue reproduzir.
              </div>
            </div>

            <Section title="Imagem" defaultOpen>
              <Slider label="Brightness" value={brightness} setValue={setBrightness} min={-100} max={100} />
              <Slider label="Contrast" value={contrast} setValue={setContrast} min={-100} max={100} />
              <Slider label="Min brightness" value={minBrightness} setValue={setMinBrightness} min={0} max={255} />
              <Slider label="Max brightness" value={maxBrightness} setValue={setMaxBrightness} min={0} max={255} />
              <Slider label="Intensity" value={intensity} setValue={setIntensity} min={-100} max={100} />
            </Section>

            <Section title="Linhas" defaultOpen>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-zinc-200">Presets de angulo</div>
                <div className="flex flex-wrap gap-2">
                  <PresetButton label="0 deg" onClick={() => setAngleDeg(0)} />
                  <PresetButton label="45 deg" onClick={() => setAngleDeg(45)} />
                  <PresetButton label="90 deg" onClick={() => setAngleDeg(90)} />
                  <PresetButton label="135 deg" onClick={() => setAngleDeg(135)} />
                </div>
              </div>

              <Slider label="Angle (deg)" value={angleDeg} setValue={setAngleDeg} min={0} max={180} />
              <Slider
                label="Line spacing (mm)"
                value={lineSpacingMm}
                setValue={setLineSpacingMm}
                min={0.6}
                max={6}
                step={0.05}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Min thickness (mm)"
                value={minThicknessMm}
                setValue={setMinThicknessMm}
                min={MIN_THICKNESS_MM}
                max={2}
                step={0.05}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Max thickness (mm)"
                value={maxThicknessMm}
                setValue={setMaxThicknessMm}
                min={0.2}
                max={8}
                step={0.05}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Gamma"
                value={gamma}
                setValue={setGamma}
                min={0.2}
                max={3}
                step={0.05}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Sampling (mm)"
                value={samplingMm}
                setValue={setSamplingMm}
                min={0.2}
                max={3}
                step={0.05}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider label="Smoothing" value={smoothing} setValue={setSmoothing} min={0} max={10} />
            </Section>

            <Section title="Saida" defaultOpen>
              <Slider label="Width (mm)" value={widthMm} setValue={setWidthMm} min={MIN_WIDTH_MM} max={MAX_WIDTH_MM} />
              <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="accent-zinc-200"
                  checked={lockAspect}
                  onChange={(event) => setLockAspect(event.target.checked)}
                />
                Travar proporcao
              </label>
              {!lockAspect && (
                <Slider label="Height (mm)" value={heightMm} setValue={setHeightMm} min={40} max={320} />
              )}
              <div className="mt-1 text-xs text-zinc-500">Altura atual: {effectiveHeightMm} mm</div>

              <Slider
                label="Margin (mm)"
                value={marginMm}
                setValue={setMarginMm}
                min={0}
                max={20}
                step={0.25}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Simplify (mm)"
                value={simplifyMm}
                setValue={setSimplifyMm}
                min={0}
                max={1}
                step={0.01}
                fmt={(v) => v.toFixed(2)}
              />
            </Section>
          </div>
        </div>

        {/* Preview column */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
            {/* Preview header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">Preview</div>
                <div className="text-sm text-zinc-400">O fundo do preview e separado do SVG exportado.</div>
              </div>
              <div className="flex items-center gap-2">
                {/* Zoom controls */}
                <button
                  onClick={() => setZoom((z) => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-1 text-sm hover:bg-zinc-800"
                  type="button"
                  title="Zoom out"
                >
                  −
                </button>
                <span className="w-12 text-center tabular-nums text-xs text-zinc-400">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(4, parseFloat((z + 0.25).toFixed(2))))}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-1 text-sm hover:bg-zinc-800"
                  type="button"
                  title="Zoom in"
                >
                  +
                </button>
                <button
                  onClick={resetView}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                  type="button"
                  title="Reset view"
                >
                  Reset
                </button>
                <span className="tabular-nums text-xs text-zinc-600">
                  {svgText ? `${(svgText.length / 1024).toFixed(1)} KB` : ""}
                </span>
              </div>
            </div>

            {/* Preview area */}
            <div
              ref={previewRef}
              className={`mt-4 overflow-hidden rounded-2xl border border-zinc-800 ${previewClass} select-none ${
                dragging ? "cursor-grabbing" : "cursor-grab"
              }`}
              style={{ maxHeight: "65vh" }}
              onMouseDown={handlePreviewMouseDown}
              onMouseMove={handlePreviewMouseMove}
              onMouseUp={handlePreviewMouseUp}
              onMouseLeave={handlePreviewMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="grid w-full place-items-center"
                style={{
                  aspectRatio: `${widthMm}/${effectiveHeightMm}`,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center",
                  willChange: "transform",
                }}
              >
                {previewMarkup ? (
                  <div className="h-full w-full" dangerouslySetInnerHTML={previewMarkup} />
                ) : (
                  <div className="p-8 text-sm text-zinc-500">Envie uma imagem para gerar o SVG.</div>
                )}
              </div>
            </div>

            {image && (
              <div className="mt-2 text-xs text-zinc-600">
                Arraste para mover · Scroll para zoom
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow">
            <div className="text-lg font-semibold">SVG</div>
            <div className="text-sm text-zinc-400">Copie o texto ou baixe o arquivo final em mm.</div>
            <textarea
              className="mt-3 h-64 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200"
              value={svgText}
              readOnly
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
