// The screensaver (LP-60): our own pixel-art gavels and briefcases flying
// across a dark screen, or the firm's initials bouncing round it. A mouse move,
// tap or key ends it, and that tap or key never reaches the app underneath.
// With reduced motion it shows one still picture fading slowly instead, and
// requestAnimationFrame pauses by itself while the tab is hidden.

import { useEffect, useRef, useState } from "react";
import { BRANDING } from "@/branding";
import type { ScreensaverArt } from "@/lib/screensaver";

/** Pixel art, one string per row: "." is clear, any other letter a colour from PALETTE. */
const GAVEL = [
  "..hhhh..........",
  ".hHHHHh.........",
  ".hHggHh.........",
  ".hHHHHhwwwwwwwww",
  ".hHHHHhWWWWWWWWw",
  ".hHggHh.........",
  ".hHHHHh.........",
  "..hhhh..........",
];
const BRIEFCASE = [
  "....kkkkk....",
  "....k...k....",
  "bbbbbbbbbbbbb",
  "bBBBBBBBBBBBb",
  "bBBBBBggBBBBb",
  "bbbbbbggbbbbb",
  "bBBBBBBBBBBBb",
  "bBBBBBBBBBBBb",
  "bbbbbbbbbbbbb",
];
const PALETTE: Record<string, string> = {
  h: "#5a3214",
  H: "#8b5a2b",
  g: "#ffd700",
  w: "#a0522d",
  W: "#6b3410",
  k: "#4a4a4a",
  b: "#3b2210",
  B: "#7b4a22",
};
const LOGO_COLOURS = ["#ffff00", "#00ffff", "#ff00ff", "#00ff00", "#ffffff"];
/** Screen pixels per art pixel. */
const SCALE = 4;
/** How far the pointer must move before it counts, so the screensaver appearing under it doesn't end it. */
const MOVE_PX = 6;
/** How long a tap keeps the cover up, so its click lands on the cover and not the app. */
const TAP_MS = 400;

function drawSprite(ctx: CanvasRenderingContext2D, sprite: string[], x: number, y: number) {
  sprite.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const colour = PALETTE[row[c]];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(Math.round(x + c * SCALE), Math.round(y + r * SCALE), SCALE, SCALE);
    }
  });
}

interface Flyer {
  sprite: string[];
  x: number;
  y: number;
  speed: number;
}

/** A flyer entering from the top or right edge, heading down and left. */
function launch(w: number, h: number, sprite: string[], anywhere = false): Flyer {
  const fromTop = Math.random() < w / (w + h);
  return {
    sprite,
    x: anywhere ? Math.random() * w : fromTop ? Math.random() * w + 100 : w + 20,
    y: anywhere ? Math.random() * h : fromTop ? -60 : Math.random() * h,
    speed: 0.06 + Math.random() * 0.05,
  };
}

/** Starts the animation on the canvas; returns a function that stops it. One frame only when `still`. */
function animate(canvas: HTMLCanvasElement, art: ScreensaverArt, still: boolean): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);
  const resize = () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };
  window.addEventListener("resize", resize);

  const flyers = Array.from({ length: 10 }, (_, i) => launch(w, h, i % 2 ? BRIEFCASE : GAVEL, true));
  const logo = { x: w / 3, y: h / 3, dx: 0.12, dy: 0.09, colour: 0 };
  let frame = 0;
  let before = performance.now();

  const draw = (now: number) => {
    const dt = Math.min(now - before, 100);
    before = now;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    if (art === "flying") {
      for (let i = 0; i < flyers.length; i++) {
        const f = flyers[i];
        f.x -= f.speed * dt * 1.4;
        f.y += f.speed * dt;
        if (f.x < -80 || f.y > h + 60) flyers[i] = launch(w, h, f.sprite);
        drawSprite(ctx, f.sprite, f.x, f.y);
      }
    } else {
      ctx.font = "bold 72px monospace";
      const tw = ctx.measureText(BRANDING.shortName).width;
      logo.x += logo.dx * dt;
      logo.y += logo.dy * dt;
      if (logo.x < 0 || logo.x + tw > w) {
        logo.dx = -logo.dx;
        logo.x = Math.max(0, Math.min(logo.x, w - tw));
        logo.colour++;
      }
      if (logo.y < 72 || logo.y > h) {
        logo.dy = -logo.dy;
        logo.y = Math.max(72, Math.min(logo.y, h));
        logo.colour++;
      }
      ctx.fillStyle = LOGO_COLOURS[logo.colour % LOGO_COLOURS.length];
      ctx.fillText(BRANDING.shortName, logo.x, logo.y);
    }
    if (!still) frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
  };
}

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export default function Screensaver({ art, onEnd }: { art: ScreensaverArt; onEnd(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [still] = useState(reducedMotion);

  useEffect(() => (canvas.current ? animate(canvas.current, art, still) : undefined), [art, still]);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let tapTimer: ReturnType<typeof setTimeout> | undefined;
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      swallow(e);
      onEnd();
    };
    const onMove = (e: PointerEvent) => {
      start ??= { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= MOVE_PX) onEnd();
    };
    // A tap ends it on its click, which the cover catches; the timer covers a tap with no click.
    const onDown = (e: PointerEvent) => {
      swallow(e);
      tapTimer ??= setTimeout(onEnd, TAP_MS);
    };
    const onClick = (e: MouseEvent) => {
      swallow(e);
      onEnd();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onClick, true);
    return () => {
      clearTimeout(tapTimer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [onEnd]);

  return (
    <div className={"screensaver" + (still ? " still" : "")} id="screensaver" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
