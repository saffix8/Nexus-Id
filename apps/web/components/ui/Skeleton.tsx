import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-bg-overlay rounded-md',
        'bg-gradient-to-r from-bg-overlay via-bg-inset to-bg-overlay',
        'bg-[length:200%_100%] animate-shimmer',
        className
      )}
    />
  );
}

export function CredentialCardSkeleton() {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
      <Skeleton className="h-24 rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="pt-2 border-t border-border-subtle">
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}
