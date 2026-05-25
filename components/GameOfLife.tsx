"use client";

import { useEffect, useRef, useCallback } from "react";

const CELL_SIZE = 12;
const ALIVE_COLOR = "rgba(232, 255, 0, 0.28)";
const TICK_MS = 120;
const MOUSE_RADIUS = 3;
const SEED_CHANCE = 0.55;
const INITIAL_DENSITY = 0.12;

export function GameOfLife() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<Uint8Array | null>(null);
  const nextRef = useRef<Uint8Array | null>(null);
  const colsRef = useRef(0);
  const rowsRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);

  const idx = useCallback((col: number, row: number) =>
    ((row + rowsRef.current) % rowsRef.current) * colsRef.current +
    ((col + colsRef.current) % colsRef.current), []);

  const step = useCallback(() => {
    const grid = gridRef.current!;
    const next = nextRef.current!;
    const cols = colsRef.current;
    const rows = rowsRef.current;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const neighbors =
          grid[idx(c - 1, r - 1)] + grid[idx(c, r - 1)] + grid[idx(c + 1, r - 1)] +
          grid[idx(c - 1, r)]                             + grid[idx(c + 1, r)] +
          grid[idx(c - 1, r + 1)] + grid[idx(c, r + 1)] + grid[idx(c + 1, r + 1)];
        const alive = grid[idx(c, r)];
        next[idx(c, r)] =
          alive && (neighbors === 2 || neighbors === 3) ? 1 :
          !alive && neighbors === 3 ? 1 : 0;
      }
    }

    gridRef.current = next;
    nextRef.current = grid;
  }, [idx]);

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
  }, [idx]);

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
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    colsRef.current = Math.ceil(w / CELL_SIZE);
    rowsRef.current = Math.ceil(h / CELL_SIZE);
    const size = colsRef.current * rowsRef.current;
    const grid = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      if (Math.random() < INITIAL_DENSITY) grid[i] = 1;
    }
    gridRef.current = grid;
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
  }, [idx]);

  useEffect(() => {
    init();
    rafRef.current = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      init();
      rafRef.current = requestAnimationFrame(loop);
    });
    const parent = canvasRef.current?.parentElement;
    if (parent) ro.observe(parent);

    // Listen on window so events pass through buttons/links unblocked
    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // only seed when cursor is over the canvas
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom
      ) {
        seedAt(e.clientX - rect.left, e.clientY - rect.top);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      for (const t of Array.from(e.touches)) {
        if (
          t.clientX >= rect.left && t.clientX <= rect.right &&
          t.clientY >= rect.top  && t.clientY <= rect.bottom
        ) {
          seedAt(t.clientX - rect.left, t.clientY - rect.top);
        }
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [init, loop, seedAt]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-0"
      style={{ display: "block" }}
    />
  );
}
