/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4f8',
          100: '#d9e4f0',
          200: '#b3c9e0',
          300: '#7fa4c9',
          400: '#4f7faf',
          500: '#2e6496',
          600: '#1e4f7a',
          700: '#173d61',
          800: '#122f4b',
          900: '#0d2238',
          950: '#071525',
        },
        gold: {
          50:  '#fdf8ec',
          100: '#faeece',
          200: '#f4d98a',
          300: '#eec24a',
          400: '#e8ab1e',
          500: '#d4900f',
          600: '#b5720a',
          700: '#91540b',
          800: '#77420f',
          900: '#633712',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Lato"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
