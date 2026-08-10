/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/main.tsx', './src/ui/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        panel: 'var(--color-panel)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        'text-subtle': 'var(--color-text-subtle)',
        accent: 'var(--color-accent)',
        'accent-strong': 'var(--color-accent-strong)',
        'accent-text': 'var(--color-accent-text)',
        danger: 'var(--color-danger)',
        'danger-surface': 'var(--color-danger-surface)',
        'danger-text': 'var(--color-danger-text)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
      },
    },
  },
  plugins: [],
};
