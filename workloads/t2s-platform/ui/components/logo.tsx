/**
 * T2S brand mark.
 *
 * The user's logo: a circular black disc with a red outline ring, framing a
 * "T2S" lettermark with a yellow→orange gradient on the T and a
 * red→purple gradient on the S. Rendered as inline SVG so the background is
 * naturally transparent and the mark scales perfectly at any size.
 *
 * If you want pixel-perfect fidelity with a designer-exported PNG, drop it
 * at `public/logo.png` and set `useImage` on this component — the inline
 * SVG remains the default so the app ships with the brand even if the file
 * is missing.
 */

import Image from "next/image";

export function Logo({
  size = 28,
  withWordmark = true,
  useImage = false,
}: {
  size?: number;
  withWordmark?: boolean;
  /** If true, render `/logo.png` from the public/ directory instead of the inline SVG. */
  useImage?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {useImage ? (
        <Image
          src="/logo.png"
          alt="T2S"
          width={size}
          height={size}
          className="shrink-0"
          priority
        />
      ) : (
        <T2SMark size={size} />
      )}
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span className="text-[0.95rem] font-semibold tracking-[-0.01em] text-ink-primary">
            T2S
          </span>
          <span className="mt-0.5 text-[0.625rem] uppercase tracking-[0.18em] text-ink-muted">
            Trust to Scale
          </span>
        </div>
      )}
    </div>
  );
}

function T2SMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        {/* T — yellow at top, deepening to amber/orange at bottom */}
        <linearGradient id="t2s-grad-t" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#FFD93A" />
          <stop offset="55%" stopColor="#FFA01C" />
          <stop offset="100%" stopColor="#FF6B1A" />
        </linearGradient>
        {/* S — coral on the left curving into purple on the right */}
        <linearGradient id="t2s-grad-s" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%"  stopColor="#FF4D6D" />
          <stop offset="55%" stopColor="#C026D3" />
          <stop offset="100%" stopColor="#6B21A8" />
        </linearGradient>
        {/* subtle inner shadow on the disc, gives it a touch of depth */}
        <radialGradient id="t2s-disc" cx="50%" cy="40%" r="65%">
          <stop offset="0%"  stopColor="#171C2E" />
          <stop offset="100%" stopColor="#05070D" />
        </radialGradient>
      </defs>

      {/* disc — fills the circle. Sits on a transparent SVG background. */}
      <circle cx="32" cy="32" r="29" fill="url(#t2s-disc)" />

      {/* red/orange outline ring */}
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke="#E04A1C"
        strokeWidth="2.4"
      />

      {/* "T" — bold italic */}
      <text
        x="20"
        y="42"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="28"
        fill="url(#t2s-grad-t)"
        letterSpacing="-1.2"
      >
        T
      </text>

      {/* subscript "2" */}
      <text
        x="29.5"
        y="48"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        fontStyle="italic"
        fontSize="13"
        fill="#FF7E1B"
      >
        2
      </text>

      {/* "S" */}
      <text
        x="44"
        y="42"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="28"
        fill="url(#t2s-grad-s)"
        letterSpacing="-1.2"
      >
        S
      </text>
    </svg>
  );
}
