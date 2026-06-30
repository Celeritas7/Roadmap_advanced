import type { Config } from 'tailwindcss'

/**
 * Roadmap — "Journey" redesign · Tailwind theme.
 * Colors resolve from CSS variables defined in src/index.css (see the
 * [data-theme] / [data-role] blocks). Swapping data-theme or data-role on
 * the app root re-points every token automatically.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // headings (trailhead + summit). fieldguide overrides to serif in CSS.
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        // editorial display (fieldguide)
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        // UI / body — all directions
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        // metadata, counts, tags, kbd
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: 'var(--canvas)',
        panel: {
          DEFAULT: 'var(--panel)',
          2: 'var(--panel-2)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          ink: 'var(--accent-ink)',
        },
        'on-accent': 'var(--on-accent)',
        // road surface (expanded route map)
        road: {
          DEFAULT: 'var(--road)',
          edge: 'var(--road-edge)',
          lane: 'var(--lane)',
        },
      },
      borderRadius: {
        card: '14px',
        chip: '8px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      transitionTimingFunction: {
        journey: 'cubic-bezier(.4,0,.1,1)',
      },
    },
  },
  plugins: [],
} satisfies Config
