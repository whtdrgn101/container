import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '../utils.js';

/**
 * A descriptive hover/focus tooltip for an action spot — the shared chrome behind every game's
 * action-spot help (RR plates, Container controls, Stone Age places, Saint Petersburg cards).
 *
 * It wraps a single interactive child (usually a button) and shows `tip` on **pointer hover AND
 * keyboard focus** — focus is what makes it work on touch, since tapping an action button focuses it.
 * It dismisses on blur, pointer-leave, or Escape. Purely descriptive: `role="tooltip"` + an id, with
 * `aria-describedby` on the child; no focus trapping.
 *
 * It floats *above* the boards (some of which are diegetic hardcoded art), so it is chrome and uses
 * semantic tokens — an inverted `bg-foreground`/`text-background` surface that reads in light and dark.
 * Positioning is a tiny own implementation (measure with refs, flip to stay in the viewport, clamp the
 * horizontal shift) so it never spills past a 320px screen and needs no dependency.
 */
export interface ActionTipProps {
  /** The help text. Player-facing plain language: what it does + the cost. */
  readonly tip: ReactNode;
  /** The single element the tip describes — cloned to receive `aria-describedby`. */
  readonly children: ReactElement<{ 'aria-describedby'?: string }>;
  /** Preferred side; flips automatically when there isn't room. */
  readonly side?: 'top' | 'bottom';
  /** Wrapper class — pass `block`/`w-full` when the child is a full-width button. */
  readonly className?: string;
}

export function ActionTip({ tip, children, side = 'top', className }: ActionTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>(side);
  const [shiftX, setShiftX] = useState(0);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = (immediate: boolean) => {
    window.clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), 150);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Flip to stay in the viewport and clamp the horizontal centre so the tip never spills off-screen.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !tipRef.current) return;
    const w = wrapRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    const margin = 8;
    let next = side;
    if (side === 'top' && w.top - t.height - margin < 0) next = 'bottom';
    else if (side === 'bottom' && w.bottom + t.height + margin > window.innerHeight) next = 'top';
    setPlacement(next);
    const centre = w.left + w.width / 2;
    const half = t.width / 2;
    let shift = 0;
    if (centre - half < margin) shift = margin - (centre - half);
    else if (centre + half > window.innerWidth - margin) shift = window.innerWidth - margin - (centre + half);
    setShiftX(shift);
  }, [open, side, tip]);

  return (
    <span
      ref={wrapRef}
      className={cn('relative inline-flex', className)}
      onPointerEnter={() => show(false)}
      onPointerLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      {cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open ? (
        <div
          ref={tipRef}
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-[min(260px,calc(100vw-16px))] whitespace-normal',
            'break-words rounded-md border border-border bg-foreground px-2.5 py-1.5 text-left text-xs',
            'font-normal normal-case leading-snug text-background shadow-lg',
          )}
          style={{
            left: '50%',
            transform: `translateX(calc(-50% + ${shiftX}px))`,
            ...(placement === 'top' ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
          }}
        >
          {tip}
        </div>
      ) : null}
    </span>
  );
}
