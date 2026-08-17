import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      /* ── Fonts ───────────────────────────────────────────────────────── */
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },

      /* ── Colors ──────────────────────────────────────────────────────── */
      colors: {
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT:    "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT:    "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT:              "hsl(var(--sidebar-background))",
          foreground:           "hsl(var(--sidebar-foreground))",
          primary:              "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent:               "hsl(var(--sidebar-accent))",
          "accent-foreground":  "hsl(var(--sidebar-accent-foreground))",
          border:               "hsl(var(--sidebar-border))",
          ring:                 "hsl(var(--sidebar-ring))",
        },
        table: {
          header: "hsl(var(--table-header))",
          hover:  "hsl(var(--table-row-hover))",
        },
        status: {
          active:   "hsl(var(--status-active))",
          pending:  "hsl(var(--status-pending))",
          inactive: "hsl(var(--status-inactive))",
          frozen:   "hsl(var(--status-frozen))",
        },
        glass: {
          bg:     "hsl(220 20% 10% / 0.75)",
          border: "hsl(220 20% 28% / 0.25)",
        },
        neon: {
          primary: "hsl(var(--neon-primary))",
          accent:  "hsl(var(--neon-accent))",
          pink:    "hsl(var(--neon-pink))",
          purple:  "hsl(var(--neon-purple))",
          cyan:    "hsl(var(--cyan))",
        },
        cyan:   "hsl(var(--cyan))",
        purple: "hsl(var(--purple))",
        pink:   "hsl(var(--pink))",
        orange: "hsl(var(--orange))",
        green:  "hsl(var(--green))",
        gold:   "hsl(var(--gold))",
        focusOverlay: "hsl(var(--focus-overlay))",
      },

      /* ── Border radius scale ─────────────────────────────────────────── */
      borderRadius: {
        xs:   "4px",
        sm:   "8px",
        md:   "12px",
        lg:   "var(--radius)",          /* 12px  – default token  */
        xl:   "var(--radius-xl)",        /* 20px  */
        "2xl": "var(--radius-2xl)",      /* 24px  */
        "3xl": "var(--radius-3xl)",      /* 32px  */
        "4xl": "2.5rem",                 /* 40px  */
      },

      /* ── Elevation box-shadows ───────────────────────────────────────── */
      boxShadow: {
        "xs":          "0 1px 2px rgba(0,0,0,0.5)",
        "card":        "0 2px 12px rgba(0,0,0,0.45), 0 0 0 1px hsl(220 20% 16% / 0.6)",
        "card-hover":  "0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px hsl(187 94% 43% / 0.3)",
        "glow-cyan":   "0 0 16px hsl(187 94% 43% / 0.35), 0 0 32px hsl(187 94% 43% / 0.15)",
        "glow-pink":   "0 0 16px hsl(330 70% 65% / 0.35), 0 0 32px hsl(330 70% 65% / 0.15)",
        "glow-purple": "0 0 16px hsl(263 70% 65% / 0.35), 0 0 32px hsl(263 70% 65% / 0.15)",
        "inner-ring":  "inset 0 0 0 1px rgba(255,255,255,0.08)",
      },

      /* ── Backdrop blur — LOCKED v1.1 — single 20px glass value ───────── */
      backdropBlur: {
        glass: "20px",
      },

      /* ── Typography ──────────────────────────────────────────────────── */
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],     /* 10px */
        xs:    ["0.6875rem", { lineHeight: "1rem" }],    /* 11px */
        sm:    ["0.8125rem", { lineHeight: "1.25rem" }], /* 13px */
        base:  ["0.9375rem", { lineHeight: "1.5rem" }],  /* 15px */
        lg:    ["1.0625rem", { lineHeight: "1.625rem" }],/* 17px */
      },

      /* ── Keyframes ───────────────────────────────────────────────────── */
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "pulse-ring": {
          "0%":   { transform: "scale(1)",   opacity: "1" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        "scan-line": {
          "0%":   { top: "0%" },
          "50%":  { top: "100%" },
          "100%": { top: "0%" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-300% 0" },
          "100%": { backgroundPosition: "300% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-10px)" },
        },
        marquee: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-in-up": {
          "0%":   { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-down-in": {
          "0%":   { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "draw-check": {
          "0%":   { strokeDashoffset: "48" },
          "100%": { strokeDashoffset: "0" },
        },
        "shake-x": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":      { transform: "translateX(-6px)" },
          "40%":      { transform: "translateX(6px)" },
          "60%":      { transform: "translateX(-4px)" },
          "80%":      { transform: "translateX(4px)" },
        },
      },

      /* ── Animations ──────────────────────────────────────────────────── */
      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        "pulse-ring":      "pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan-line":       "scan-line 2s ease-in-out infinite",
        shimmer:           "shimmer 1.8s ease-in-out infinite",
        float:             "float 6s ease-in-out infinite",
        marquee:           "marquee 15s linear infinite",
        "fade-in":         "fade-in 240ms ease forwards",
        "fade-in-up":      "fade-in-up 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-up":        "slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in":        "scale-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "slide-down-in":   "slide-down-in 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "draw-check":      "draw-check 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "shake-x":         "shake-x 360ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both",
      },

      /* ── Transition timing ───────────────────────────────────────────── */
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        spring:  "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "ease-out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },

      /* ── Background images ───────────────────────────────────────────── */
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":  "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
