import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-body font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-40 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        primary: [
          'bg-accent-primary text-white',
          'hover:bg-[#4A7EF7] active:bg-[#2D5FD9]',
          'shadow-sm',
        ],
        gradient: [
          'bg-gradient-to-r from-accent-primary to-accent-secondary text-white',
          'hover:opacity-90 active:opacity-80',
          'shadow-accent',
        ],
        secondary: [
          'bg-transparent border border-border-default text-text-primary',
          'hover:bg-bg-overlay hover:border-border-strong',
          'active:bg-bg-elevated',
        ],
        ghost: [
          'bg-transparent text-text-secondary',
          'hover:bg-bg-overlay hover:text-text-primary',
          'active:bg-bg-elevated',
        ],
        danger: [
          'bg-transparent border border-danger/40 text-danger',
          'hover:bg-danger/10 hover:border-danger',
          'active:bg-danger/20',
        ],
        success: [
          'bg-success/10 border border-success/30 text-success',
          'hover:bg-success/20',
        ],
      },
      size: {
        sm:   'h-8  px-3 text-sm  rounded-md',
        md:   'h-10 px-4 text-base rounded-md',
        lg:   'h-12 px-6 text-lg  rounded-lg',
        icon: 'h-9  w-9         rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={loading || props.disabled} {...props}>
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
