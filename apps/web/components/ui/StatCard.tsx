interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  accent?: string;
}

export function StatCard({ title, value, change, trend, icon, accent }: StatCardProps) {
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-text-tertiary tracking-wider uppercase">{title}</span>
        {icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: accent ? `${accent}15` : 'var(--color-bg-overlay)' }}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <span className="text-3xl font-display font-semibold text-text-primary tracking-tight">
          {value}
        </span>

        {change && (
          <span className={`text-sm font-medium ${
            trend === 'up' ? 'text-success' :
            trend === 'down' ? 'text-danger' :
            'text-text-tertiary'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {change}
          </span>
        )}
      </div>
    </div>
  );
}
