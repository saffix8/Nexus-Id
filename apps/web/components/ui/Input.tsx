import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export interface InputProps
   extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
    label?: string;
    error?: string;
    hint?: string;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
  }

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, prefix, suffix, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-secondary tracking-wide">
            {label}
          </label>
        )}

        <div className={cn(
          'flex items-center gap-2',
          'bg-bg-inset border rounded-md',
          'transition-all duration-150',
          error
            ? 'border-danger focus-within:border-danger focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
            : 'border-border-default focus-within:border-accent-primary focus-within:shadow-accent',
        )}>
          {prefix && <span className="pl-3 text-text-tertiary">{prefix}</span>}

          <input
            id={inputId}
            ref={ref}
            className={cn(
              'flex-1 bg-transparent px-3 py-2.5',
              'text-base text-text-primary placeholder:text-text-tertiary',
              'outline-none',
              !prefix && 'pl-3',
              !suffix && 'pr-3',
              className
            )}
            {...props}
          />

          {suffix && <span className="pr-3 text-text-tertiary">{suffix}</span>}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-text-tertiary">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
