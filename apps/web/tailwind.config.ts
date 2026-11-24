import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Design System v2 — docs/DESIGN.md §3 (tokens) and §4.2 (shadcn mapping).
// Dark only: shadcn CSS variables live on :root in app/globals.css.

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          primary: "#3B6FE8",
          hover: "#4A7EF7",
          text: "#7BA0FF",
          secondary: "#5B4FE8",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "#1E2330",
          default: "#252C3D",
          strong: "#3A4560",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        surface: "#13161E",
        overlay: "#1A1E28",
        inset: "#0A0C10",
        text: {
          DEFAULT: "#EEF0F6",
          muted: "#8B92A8",
          faint: "#525A72",
          primary: "#EEF0F6",
          secondary: "#8B92A8",
          tertiary: "#525A72",
        },
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#38BDF8",
        cat: {
          identity: "#3B82F6",
          education: "#8B5CF6",
          employment: "#0EA5E9",
          enrollment: "#10B981",
        },
        bg: {
          base: "#0C0E13",
          elevated: "#13161E",
          inset: "#0A0C10",
          overlay: "#1A1E28",
        },
        cred: {
          identity: "#3B82F6",
          education: "#8B5CF6",
          employment: "#0EA5E9",
          enrollment: "#10B981",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--font-dm-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0,0,0,0.4)",
        md: "0 4px 16px rgba(0,0,0,0.5)",
        lg: "0 8px 32px rgba(0,0,0,0.6)",
        dialog: "0 16px 48px rgba(0,0,0,0.5)",
        accent: "0 0 0 1px rgba(59,111,232,0.4), 0 0 24px rgba(59,111,232,0.1)",
        cred: "inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 1.5s infinite",
        reveal: "reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        fadeIn: {
          from: {
            opacity: "0",
          },
          to: {
            opacity: "1",
          },
        },
        slideUp: {
          from: {
            transform: "translateY(8px)",
            opacity: "0",
          },
          to: {
            transform: "translateY(0)",
            opacity: "1",
          },
        },
        shimmer: {
          "0%": {
            backgroundPosition: "-200% 0",
          },
          "100%": {
            backgroundPosition: "200% 0",
          },
        },
        reveal: {
          from: {
            transform: "translateY(4px)",
            opacity: "0",
            filter: "blur(4px)",
          },
          to: {
            transform: "translateY(0)",
            opacity: "1",
            filter: "blur(0)",
          },
        },
      },
    },
  },
  plugins: [animate],
};

export default config;
