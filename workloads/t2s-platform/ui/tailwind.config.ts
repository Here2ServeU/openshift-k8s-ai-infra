import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0A0F1F",
        surface: "#131A2E",
        elevated: "#1B2440",
        overlay: "#212C4F",
        border: {
          subtle: "#232E47",
          DEFAULT: "#2B375A",
          strong: "#3A4A78",
        },
        ink: {
          primary: "#E8ECF7",
          secondary: "#94A3C2",
          muted: "#5F6E94",
        },
        accent: {
          DEFAULT: "#5EEAD4",
          strong: "#2DD4BF",
          soft: "rgba(94, 234, 212, 0.12)",
          glow: "rgba(94, 234, 212, 0.35)",
        },
        signal: {
          success: "#4ADE80",
          warning: "#FBBF24",
          danger: "#F87171",
          info: "#60A5FA",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        caption: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
      },
      borderRadius: {
        xs: "3px",
        sm: "4px",
        DEFAULT: "6px",
        lg: "10px",
        xl: "14px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(94, 234, 212, 0.25), 0 8px 32px -8px rgba(94, 234, 212, 0.25)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.03)",
      },
      keyframes: {
        pulseRing: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 2.4s ease-in-out infinite",
        sweep: "sweep 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
