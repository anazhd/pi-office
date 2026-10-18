/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0C0A08',
          900: '#13100D',
          800: '#1B1713',
          700: '#262019',
          600: '#352C23',
        },
        cream: {
          DEFAULT: '#F4EDE0',
          dim: '#CBBFAC',
          faint: '#8F8474',
        },
        amber: {
          DEFAULT: '#E9A94C',
          soft: '#F3C57A',
          deep: '#B9772A',
        },
        clay: '#D97757',
        teal: '#63B9A8',
        sage: '#8DA37E',
        sky: '#8FC3D6',
      },
      fontFamily: {
        display: ['Fraunces_600SemiBold', 'Georgia', 'serif'],
        displayMedium: ['Fraunces_500Medium', 'Georgia', 'serif'],
        sans: ['DMSans_400Regular', 'system-ui', 'sans-serif'],
        bodyMedium: ['DMSans_500Medium', 'system-ui', 'sans-serif'],
        bodyBold: ['DMSans_700Bold', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '18px',
        pill: '999px',
      },
      boxShadow: {
        glass: '0 18px 50px rgba(0,0,0,0.45)',
        lift: '0 10px 26px rgba(0,0,0,0.38)',
      },
    },
  },
  plugins: [],
}
