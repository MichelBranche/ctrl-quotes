"use client";

import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

export function SignaturePad({
  onChange,
  error,
  disabled,
}: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Point[][]>([]);
  const current = useRef<Point[] | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    function size() {
      const node = canvasRef.current;
      const box = wrapperRef.current;
      if (!node || !box) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(box.clientWidth));
      const height = 148;
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      const context = node.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw(context, width, height);
    }

    size();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(size);
    observer?.observe(wrapper);
    window.addEventListener("resize", size);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", size);
    };
  }, [drawn]);

  function redraw(context: CanvasRenderingContext2D, width: number, height: number) {
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1a1a1a";
    context.lineWidth = 2.2;
    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      context.beginPath();
      context.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
      if (stroke.length === 1) context.lineTo(stroke[0]!.x + 0.1, stroke[0]!.y);
      context.stroke();
    }
  }

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hasInk = strokes.current.some((stroke) => stroke.length > 0);
    if (!hasInk) {
      setDrawn(false);
      onChange(null);
      return;
    }
    setDrawn(true);
    onChange(canvas.toDataURL("image/png"));
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    current.current = [point];
    strokes.current = [...strokes.current, current.current];
    const context = event.currentTarget.getContext("2d");
    if (context) redraw(context, event.currentTarget.clientWidth, event.currentTarget.clientHeight);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !current.current) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    current.current.push(point);
    const context = event.currentTarget.getContext("2d");
    if (context) redraw(context, event.currentTarget.clientWidth, event.currentTarget.clientHeight);
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!current.current) return;
    current.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    emit();
  }

  function clear() {
    strokes.current = [];
    current.current = [];
    current.current = null;
    setDrawn(false);
    onChange(null);
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) redraw(context, canvas.clientWidth, canvas.clientHeight);
  }

  return (
    <div className="pq-sign" ref={wrapperRef}>
      <div className="pq-sign-head">
        <span>Firma</span>
        <button type="button" className="pq-decision-cancel" disabled={disabled || !drawn} onClick={clear}>
          Cancella
        </button>
      </div>
      <div className={error ? "pq-sign-frame is-error" : "pq-sign-frame"}>
        <canvas
          ref={canvasRef}
          className="pq-sign-canvas"
          aria-label="Disegna la tua firma"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!drawn ? <span className="pq-sign-hint">Disegna la tua firma qui</span> : null}
      </div>
      {error ? (
        <p className="pq-decision-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
