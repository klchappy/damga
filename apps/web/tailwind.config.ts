import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Damga teması
        cream: '#FFF4E8',
        ink: '#1A1A1A',
        orange: {
          50: '#FFF4EE',
          100: '#FFE3D2',
          400: '#FF8C5A',
          500: '#FF6B35',
          600: '#E54E1A',
          700: '#BF3C0F',
        },
        muted: {
          DEFAULT: '#7A6F5E',
          fg: '#5C5345',
        },
        success: '#1F9E5A',
        warning: '#D9A407',
        danger: '#D33A2C',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        lg: '14px',
        md: '10px',
        sm: '6px',
      },
    },
  },
  plugins: [animate],
};

export default config;
