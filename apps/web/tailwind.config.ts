import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#0C0E13',
          elevated: '#13161E',
          inset:    '#0A0C10',
          overlay:  '#1A1E28',
        },
        border: {
          subtle:  '#1E2330',
          default: '#252C3D',
          strong:  '#3A4560',
        },
        text: {
          primary:   '#EEF0F6',
          secondary: '#8B92A8',
          tertiary:  '#525A72',
        },
        accent: {
          primary:   '#3B6FE8',
          secondary: '#5B4FE8',
        },
        success:  '#22C55E',
        warning:  '#F59E0B',
        danger:   '#EF4444',
        info:     '#38BDF8',
        cred: {
          identity:   '#3B82F6',
          education:  '#8B5CF6',
          employment: '#0EA5E9',
          enrollment: '#10B981',
        },
      },
      fontFamily: {
        display: ['DM Sans', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'xs':   ['0.64rem',  { lineHeight: '1rem' }],
        'sm':   ['0.8rem',   { lineHeight: '1.25rem' }],
        'base': ['1rem',     { lineHeight: '1.5rem' }],
        'lg':   ['1.25rem',  { lineHeight: '1.75rem' }],
        'xl':   ['1.563rem', { lineHeight: '2rem' }],
        '2xl':  ['1.953rem', { lineHeight: '2.25rem' }],
        '3xl':  ['2.441rem', { lineHeight: '2.75rem' }],
        '4xl':  ['3.052rem', { lineHeight: '3.5rem' }],
      },
      borderRadius: {
        sm:   '4px',
        md:   '8px',
        lg:   '12px',
        xl:   '16px',
      },
      boxShadow: {
        'sm':     '0 1px 3px rgba(0,0,0,0.4)',
        'md':     '0 4px 16px rgba(0,0,0,0.5)',
        'lg':     '0 8px 32px rgba(0,0,0,0.6)',
        'accent': '0 0 0 1px rgba(59,111,232,0.4), 0 0 24px rgba(59,111,232,0.1)',
        'cred':   'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'fade-in':      'fadeIn 0.2s ease-out',
        'slide-up':     'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':      'shimmer 1.5s infinite',
        'reveal':       'reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        reveal:  { from: { transform: 'translateY(4px)', opacity: '0', filter: 'blur(4px)' }, to: { transform: 'translateY(0)', opacity: '1', filter: 'blur(0)' } },
      },
    },
  },
  plugins: [],
};

export default config;
