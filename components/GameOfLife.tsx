"use client";

import { useEffect, useRef, useCallback } from "react";

const CELL_SIZE = 12;
const ALIVE_COLOR = "rgba(232, 255, 0, 0.18)";
const TICK_MS = 120;
const MOUSE_RADIUS = 3; // cells radius to seed on mouse move
const SEED_CHANCE = 0.55;

export function GameOfLife() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<Uint8Array | null>(null);
  const nextRef = useRef<Uint8Array | null>(null);
  const colsRef = useRef(0);
  const rowsRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);

  const idx = (col: number, row: number) =>
    ((row + rowsRef.current) % rowsRef.current) * colsRef.current +
    ((col + colsRef.current) % colsRef.current);

  const step = useCallback(() => {
    const grid = gridRef.current!;
    const next = nextRef.current!;
    const cols = colsRef.current;
    const rows = rowsRef.current;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const neighbors =
          grid[idx(c - 1, r - 1)] +
          grid[idx(c, r - 1)] +
          grid[idx(c + 1, r - 1)] +
          grid[idx(c - 1, r)] +
          grid[idx(c + 1, r)] +
          grid[idx(c - 1, r + 1)] +
          grid[idx(c, r + 1)] +
          grid[idx(c + 1, r + 1)];
        const alive = grid[idx(c, r)];
        next[idx(c, r)] =
          alive && (neighbors === 2 || neighbors === 3) ? 1 :
          !alive && neighbors === 3 ? 1 : 0;
      }
    }

    gridRef.current = next;
    nextRef.current = grid;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const grid = gridRef.current!;
    const cols = colsRef.current;
    const rows = rowsRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ALIVE_COLOR;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[idx(c, r)]) {
          ctx.fillRect(c * CELL_SIZE + 1, r * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
      }
    }
  }, []);

  const loop = useCallback((ts: number) => {
    if (ts - lastTickRef.current >= TICK_MS) {
      step();
      draw();
      lastTickRef.current = ts;
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [step, draw]);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w;
    canvas.height = h;
    colsRef.current = Math.ceil(w / CELL_SIZE);
    rowsRef.current = Math.ceil(h / CELL_SIZE);
    const size = colsRef.current * rowsRef.current;
    gridRef.current = new Uint8Array(size);
    nextRef.current = new Uint8Array(size);
  }, []);

  const seedAt = useCallback((cx: number, cy: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const col = Math.floor(cx / CELL_SIZE);
    const row = Math.floor(cy / CELL_SIZE);
    for (let dr = -MOUSE_RADIUS; dr <= MOUSE_RADIUS; dr++) {
      for (let dc = -MOUSE_RADIUS; dc <= MOUSE_RADIUS; dc++) {
        if (Math.random() < SEED_CHANCE) {
          grid[idx(col + dc, row + dr)] = 1;
        }
      }
    }
  }, []);

  useEffect(() => {
    init();
    rafRef.current = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      init();
      rafRef.current = requestAnimationFrame(loop);
    });
    if (canvasRef.current?.parentElement) {
      ro.observe(canvasRef.current.parentElement);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [init, loop]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    seedAt(e.clientX - rect.left, e.clientY - rect.top);
  }, [seedAt]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    for (const t of Array.from(e.touches)) {
      seedAt(t.clientX - rect.left, t.clientY - rect.top);
    }
  }, [seedAt]);

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      className="absolute inset-0 w-full h-full z-0"
      style={{ display: "block" }}
    />
  );
}
