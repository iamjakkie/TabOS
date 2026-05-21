/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/ui/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        accent: 'var(--color-accent)',
        muted: 'var(--color-muted)',
      },
    },
  },
  plugins: [],
};
