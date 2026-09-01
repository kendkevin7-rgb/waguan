/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        panel: '#075E54',
        panelDark: '#054C44',
        accent: '#25D366',
        accentDark: '#128C7E',
        bubbleOut: '#D9FDD3',
        bubbleOutDark: '#005C4B',
        bubbleIn: '#FFFFFF',
        bubbleInDark: '#202C33',
        chatBg: '#EFEAE2',
        chatBgDark: '#0B141A',
        sidebarDark: '#111B21',
        sidebarHoverDark: '#202C33',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
