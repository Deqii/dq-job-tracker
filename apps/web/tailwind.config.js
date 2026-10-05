/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dde7ff',
          200: '#c2d4ff',
          300: '#9db6ff',
          400: '#7690fa',
          500: '#5568f1',
          600: '#3f46e5',
          700: '#3538ca',
          800: '#2d30a3',
          900: '#2b2f81',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};