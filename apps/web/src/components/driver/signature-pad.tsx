"use client";

import { PenLine } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

function paint(canvas: HTMLCanvasElement, lines: Point[][]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cssWidth = canvas.getBoundingClientRect().width || 1;
  const dpr = canvas.width / cssWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = getComputedStyle(canvas).color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const pts of lines) {
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 1.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // Smooth the line through the midpoints between samples.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

/**
 * A real signature pad: the receiver signs with a finger, pen or mouse. The
 * signature is kept as a PNG, so it survives a reload and travels with the
 * proof of delivery, offline or not.
 */
export function SignaturePad({
  value,
  onChange,
  locked,
}: {
  value: string | null;
  onChange: (png: string | null) => void;
  locked?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [inking, setInking] = useState(false);

  // Size the canvas for the screen and redraw: live strokes, or the saved image.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      if (strokes.current.length) paint(canvas, strokes.current);
      else if (value) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = value;
      } else paint(canvas, []);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [value]);

  const at = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    if (!strokes.current.length && value) strokes.current = [];
    strokes.current = [...strokes.current, [at(e)]];
    setInking(true);
    paint(e.currentTarget, strokes.current);
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    strokes.current[strokes.current.length - 1].push(at(e));
    paint(e.currentTarget, strokes.current);
  };

  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (strokes.current.some((line) => line.length > 1))
      onChange(e.currentTarget.toDataURL("image/png"));
  };

  const clear = () => {
    strokes.current = [];
    setInking(false);
    const canvas = canvasRef.current;
    if (canvas) paint(canvas, []);
    onChange(null);
  };

  const showHint = !value && !inking;

  return (
    <div className="flex h-[120px] w-full shrink-0 flex-col gap-1 rounded-2xl border border-dashed border-line-strong bg-surface px-3.5 py-3">
      <div className="flex items-center">
        <p className="t-caption text-fg-3">Signature</p>
        <span className="flex-1" />
        {!locked && (inking || value) && (
          <button
            type="button"
            onClick={clear}
            className="rounded t-caption-m text-accent-text hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          aria-label="Signature pad. The receiver signs here with a finger."
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="absolute inset-0 size-full touch-none text-fg"
          style={{ cursor: locked ? "default" : "crosshair" }}
        />
        {showHint && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 t-small text-fg-3">
            <PenLine size={15} strokeWidth={1.7} aria-hidden />
            Receiver signs here
          </span>
        )}
      </div>
    </div>
  );
}
