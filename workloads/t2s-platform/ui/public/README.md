# `public/` — static brand assets

The Next.js `public/` directory. Files placed here are served at `/`.

## Optional: pixel-perfect logo override

The [`Logo`](../components/logo.tsx) component ships with a hand-built inline-SVG approximation of the T2S brand mark — naturally transparent, scales to any size, no file dependencies. That's the default and renders everywhere out of the box.

If you have a designer-exported PNG of the logo and want bit-perfect fidelity:

1. Drop the file at **`public/logo.png`** — recommended size 256×256 or larger, **transparent background** (no white square around the circle).
2. Pass `useImage` where the logo is rendered:

   ```tsx
   <Logo size={32} useImage />
   ```

   The component will switch to `<Image src="/logo.png" />` and the inline SVG won't render.

You can also drop a `favicon.ico` and `apple-touch-icon.png` here — Next.js wires both automatically through the route conventions in `app/layout.tsx`. Suggested sizes:

| File | Size | Used for |
| --- | --- | --- |
| `favicon.ico` | 32×32 (multi-resolution ICO) | Browser tab |
| `apple-touch-icon.png` | 180×180 PNG, transparent | iOS home-screen |
| `logo.png` | 256×256+ PNG, transparent | In-app `<Logo useImage />` |

## Why this layout

The platform UI is dependency-light by design — no icon font, no external image CDN, no asset pipeline. Inline SVGs are the default for the same reason every component in here is hand-rolled: fewer moving parts an auditor or security scanner has to evaluate, and a faster cold start for the standalone Next.js server.
