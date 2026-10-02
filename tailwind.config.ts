import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0a0d',
        bg2: '#121016',
        panel: '#191621',
        panel2: '#221d2c',
        line: '#2e2839',
        ink: '#f4efe6',
        muted: '#9c9288',
        amber: {
          DEFAULT: '#e9b055',
          soft: '#f3cf8f',
          deep: '#a97a2c',
        },
        correct: '#7fd1a8',
        wrong: '#e2665c',
        water: '#6fc2c4',
      },
      fontFamily: {
        display: [
          '"Iowan Old Style"',
          '"Palatino Linotype"',
          'Palatino',
          '"Book Antiqua"',
          'Georgia',
          'serif',
        ],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"JetBrains Mono"',
          '"Cascadia Mono"',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      keyframes: {
        'flash-ok': {
          '0%': { boxShadow: '0 0 0 0 rgba(127, 209, 168, 0.9)' },
          '100%': { boxShadow: '0 0 0 20px rgba(127, 209, 168, 0)' },
        },
        'flash-bad': {
          '0%': { boxShadow: '0 0 0 0 rgba(226, 102, 92, 0.9)' },
          '100%': { boxShadow: '0 0 0 20px rgba(226, 102, 92, 0)' },
        },
        'soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-6px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'flash-ok': 'flash-ok 520ms ease-out',
        'flash-bad': 'flash-bad 520ms ease-out',
        'soft-pulse': 'soft-pulse 1.4s ease-in-out infinite',
        rise: 'rise 240ms ease-out both',
        'slide-in': 'slide-in 200ms ease-out both',
      },
      boxShadow: {
        key: 'inset 0 -6px 0 0 rgba(0, 0, 0, 0.16), inset 0 1px 0 0 rgba(255, 255, 255, 0.85)',
        'key-black': 'inset 0 -5px 0 0 rgba(0, 0, 0, 0.55), inset 0 1px 0 0 rgba(255, 255, 255, 0.14)',
      },
    },
  },
  plugins: [],
};

export default config;