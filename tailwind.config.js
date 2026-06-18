/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: '#080e1a',
          base: '#0f1829',
          card: '#162035',
          elevated: '#1e2d47',
          border: '#2a3f5f',
        },
        accent: {
          DEFAULT: '#f97316',
          light: '#fb923c',
          dim: '#9a4a14',
        },
        drive: '#22c55e',
        pause: '#f59e0b',
        rest: '#3b82f6',
        danger: '#ef4444',
        muted: '#64748b',
        sub: '#94a3b8',
        text: '#e2e8f0',
        bright: '#f8fafc',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
