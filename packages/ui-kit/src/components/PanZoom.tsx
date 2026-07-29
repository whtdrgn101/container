import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, Maximize } from 'lucide-react';
import { Button } from './ui/button.js';
import { cn } from '../utils.js';

/**
 * A dependency-free pan + zoom viewport. Wraps content that fills the frame at scale 1 and lets the user
 * **zoom** (mouse wheel, pinch, or the ± buttons) and **pan** (drag) — the escape hatch for a detailed
 * board on a small screen. Translation is clamped so the content can't be lost off-frame, and a reset
 * button recenters. Purely presentational: it never rebuilds children, so their own interactions (clicks,
 * focus) keep working at any zoom.
 */
export function PanZoom({
  children,
  className,
  minScale = 1,
  maxScale = 3,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly minScale?: number;
  readonly maxScale?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Active pointers (for drag + pinch) and the last single-pointer position.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);

  /** Keep the (scaled) content overlapping the frame; centre it when smaller than the frame. */
  const clamp = useCallback((s: number, x: number, y: number) => {
    const frame = frameRef.current;
    if (!frame) return { x, y };
    const { width: w, height: h } = frame.getBoundingClientRect();
    const sw = w * s;
    const sh = h * s;
    const cx = sw >= w ? Math.min(0, Math.max(w - sw, x)) : (w - sw) / 2;
    const cy = sh >= h ? Math.min(0, Math.max(h - sh, y)) : (h - sh) / 2;
    return { x: cx, y: cy };
  }, []);

  /** Zoom by `factor` about a frame-relative point (defaults to the centre). */
  const zoomAbout = useCallback(
    (factor: number, px?: number, py?: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const ox = px ?? rect.width / 2;
      const oy = py ?? rect.height / 2;
      setScale((prev) => {
        const next = Math.min(maxScale, Math.max(minScale, prev * factor));
        const ratio = next / prev;
        // Keep the point under the cursor fixed: new_t = origin - (origin - t) * ratio.
        setTx((x) => clamp(next, ox - (ox - x) * ratio, ty).x);
        setTy((y) => clamp(next, tx, oy - (oy - y) * ratio).y);
        return next;
      });
    },
    [clamp, maxScale, minScale, tx, ty],
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = frameRef.current?.getBoundingClientRect();
    zoomAbout(
      e.deltaY < 0 ? 1.12 : 1 / 1.12,
      rect ? e.clientX - rect.left : undefined,
      rect ? e.clientY - rect.top : undefined,
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pts = pointers.current;
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId)!;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2) {
      // Pinch: scale by the change in distance between the two pointers.
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist.current != null && pinchDist.current > 0) zoomAbout(dist / pinchDist.current);
      pinchDist.current = dist;
    } else if (pts.size === 1 && scale > 1) {
      // Drag to pan (only when zoomed in — at scale 1 the board already fits).
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setTx((x) => clamp(scale, x + dx, ty).x);
      setTy((y) => clamp(scale, tx, y + dy).y);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
  };

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={frameRef}
        className="relative h-full w-full touch-none overflow-hidden rounded-[inherit]"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: scale > 1 ? 'grab' : 'default' }}
      >
        <div
          className="h-full w-full origin-top-left"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          {children}
        </div>
      </div>
      {/* Zoom controls. */}
      <div className="absolute right-1.5 top-1.5 z-10 flex flex-col gap-1" data-testid="board-zoom">
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow"
          aria-label="Zoom in"
          onClick={() => zoomAbout(1.25)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow"
          aria-label="Zoom out"
          onClick={() => zoomAbout(1 / 1.25)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" className="h-7 w-7 shadow" aria-label="Reset view" onClick={reset}>
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
