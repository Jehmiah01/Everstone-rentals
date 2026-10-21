import { useEffect, useRef, type RefObject } from "react";

/** Finger or mouse signature canvas. White background so it exports as JPEG. */
export function SignaturePad({ canvasRef, onInk, typedName }: {
  canvasRef: RefObject<HTMLCanvasElement | null>; onInk: (hasInk: boolean) => void; typedName: string;
}) {
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const reset = () => {
    const c = canvasRef.current;
    const g = ctx();
    if (!c || !g) return;
    const rect = c.getBoundingClientRect();
    g.fillStyle = "white";
    g.fillRect(0, 0, rect.width, rect.height);
    g.strokeStyle = "black";
    g.fillStyle = "black";
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.lineJoin = "round";
    onInk(false);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    ctx()?.setTransform(dpr, 0, 0, dpr, 0, 0);
    reset();
    // Set up once: resizing would erase the signature (mobile URL bars resize often).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const stampTyped = () => {
    const c = canvasRef.current;
    const g = ctx();
    if (!c || !g || !typedName.trim()) return;
    reset();
    const rect = c.getBoundingClientRect();
    let size = 44;
    g.font = `italic ${size}px Georgia, "Times New Roman", serif`;
    while (g.measureText(typedName).width > rect.width - 40 && size > 18) {
      size -= 2;
      g.font = `italic ${size}px Georgia, "Times New Roman", serif`;
    }
    g.fillText(typedName.trim(), 20, rect.height * 0.62);
    onInk(true);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Signature box. Draw your signature with your finger or mouse."
        className="h-44 w-full touch-none border border-line bg-surface sm:h-52"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          const g = ctx();
          if (!drawing.current || !g || !last.current) return;
          const p = point(e);
          g.beginPath();
          g.moveTo(last.current.x, last.current.y);
          g.lineTo(p.x, p.y);
          g.stroke();
          last.current = p;
          onInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <button type="button" onClick={reset} className="min-h-11 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-cobalt">
          Clear
        </button>
        <button type="button" onClick={stampTyped} disabled={!typedName.trim()} className="min-h-11 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-cobalt disabled:text-subtle">
          Use my typed name as my signature
        </button>
      </div>
    </div>
  );
}
