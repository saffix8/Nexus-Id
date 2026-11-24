import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 font-mono font-medium tracking-wider uppercase',
  {
    variants: {
      variant: {
        active:     'bg-success/10 text-success border border-success/20',
        expired:    'bg-danger/10 text-danger border border-danger/20',
        expiring:   'bg-warning/10 text-warning border border-warning/20',
        pending:    'bg-info/10 text-info border border-info/20',
        revoked:    'bg-text-tertiary/10 text-text-tertiary border border-text-tertiary/20',
        trusted:    'bg-accent-primary/10 text-accent-primary border border-accent-primary/20',
        unknown:    'bg-warning/10 text-warning border border-warning/20',
        identity:   'bg-[#0D1B35] text-[#3B82F6] border border-[#3B82F6]/20',
        education:  'bg-[#1A0D35] text-[#8B5CF6] border border-[#8B5CF6]/20',
        employment: 'bg-[#071B26] text-[#0EA5E9] border border-[#0EA5E9]/20',
        enrollment: 'bg-[#071E15] text-[#10B981] border border-[#10B981]/20',
      },
      size: {
        sm: 'text-xs px-2 py-0.5 rounded-sm',
        md: 'text-xs px-2.5 py-1 rounded-md',
      },
    },
    defaultVariants: { variant: 'active', size: 'md' },
  }
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}

export function Badge({ variant, size, className, children, dot }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full bg-current')} />}
      {children}
    </span>
  );
}
