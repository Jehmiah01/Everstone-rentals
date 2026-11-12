import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Wraps the homepage sections from the hero to the booking section and draws a
 * road alongside them. Wide screens with motion allowed get the scroll-driven
 * 3D road (road-scene.ts, loaded on demand). Phones, reduced motion, and
 * browsers without WebGL get the static CSS road from styles.css instead.
 * Both sit behind the content with pointer-events: none.
 */

const WIDE = "(min-width: 1280px)";
const CALM = "(prefers-reduced-motion: reduce)";

// The server build never includes three.js; the browser loads it only when needed.
const loadScene = import.meta.env.SSR ? null : () => import("./road-scene");

type Mode = "pending" | "3d" | "static";

export function RoadCourse({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("pending");

  useEffect(() => {
    const wide = matchMedia(WIDE);
    const calm = matchMedia(CALM);
    let stop: (() => void) | null = null;
    let attempt = 0;
    let disposed = false;

    const halt = () => {
      attempt++;
      stop?.();
      stop = null;
    };

    async function update() {
      const want = wide.matches && !calm.matches && typeof WebGLRenderingContext !== "undefined" && loadScene !== null;
      if (!want) {
        halt();
        setMode("static");
        return;
      }
      if (stop) return;
      const mine = ++attempt;
      try {
        const { startRoad } = await loadScene!();
        const root = rootRef.current, canvas = canvasRef.current;
        if (disposed || mine !== attempt || !root || !canvas) return;
        stop = startRoad(canvas, root, () => {
          halt();
          setMode("static");
        });
        setMode(stop ? "3d" : "static");
      } catch {
        if (!disposed && mine === attempt) setMode("static");
      }
    }

    void update();
    wide.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      disposed = true;
      wide.removeEventListener("change", update);
      calm.removeEventListener("change", update);
      halt();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative" data-road={mode}>
      <div aria-hidden="true" className="road-static" />
      <canvas ref={canvasRef} aria-hidden="true" className="road-canvas" />
      {children}
    </div>
  );
}
