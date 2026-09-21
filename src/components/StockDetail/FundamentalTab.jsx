import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';
import { AlertTriangle } from 'lucide-react';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ScoreBadge = ({ verdict }) => {
  const STRONG_GAIN = { variant: 'gain', className: 'bg-gain/25' };
  const GAIN = { variant: 'gain' };
  const WARN = { variant: 'warning' };
  const LOSS = { variant: 'loss' };
  const STRONG_LOSS = { variant: 'loss', className: 'bg-loss/25' };
  const NONE = { variant: 'secondary' };
  const variants = {
    'Excellent': STRONG_GAIN,
    'Strong': STRONG_GAIN,
    'Attractive': GAIN,
    'Good': GAIN,
    'Sustainable': GAIN,
    'Moderate': WARN,
    'Fair': WARN,
    'Average': WARN,
    'Conservative': { variant: 'outline' },
    'Adequate': WARN,
    'Weak': LOSS,
    'Slow': LOSS,
    'Low': WARN,
    'High': LOSS,
    'Very High': STRONG_LOSS,
    'Low Debt': GAIN,
    'Expensive': LOSS,
    'Very Low': WARN,
    'Negative': STRONG_LOSS,
    'Declining': STRONG_LOSS,
    'High Yield': GAIN,
    'Unsustainable': STRONG_LOSS,
    'None': NONE,
    'Poor': STRONG_LOSS,
  };
  const { variant, className } = variants[verdict] || NONE;
  return (
    <Badge variant={variant} className={cn('rounded-sm font-semibold', className)}>
      {verdict}
    </Badge>
  );
};

const ScoreRing = ({ score, maxScore, label }) => {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const color = pct >= 70 ? 'var(--gain)' : pct >= 50 ? 'var(--warning)' : 'var(--loss)';
  const circumference = 2 * Math.PI * 30;
  const strokeDash = (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[76px] h-[76px]">
        <svg width="76" height="76" className="-rotate-90 absolute inset-0">
          <circle cx="38" cy="38" r="30" fill="none" style={{ stroke: 'var(--muted)' }} strokeWidth="6" />
          <circle cx="38" cy="38" r="30" fill="none" style={{ stroke: color }} strokeWidth="6"
            strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold tabular-nums" style={{ color }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground font-medium mt-2">{label}</div>
      <div className="text-[10px] tabular-nums text-muted-foreground">{score}/{maxScore}</div>
    </div>
  );
};

const OverallScore = ({ percentage, verdict }) => {
  const color = percentage >= 70 ? 'var(--gain)' : percentage >= 50 ? 'var(--warning)' : 'var(--loss)';
  const circumference = 2 * Math.PI * 45;
  const strokeDash = (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative w-[120px] h-[120px]">
        <svg width="120" height="120" className="-rotate-90 absolute inset-0">
          <circle cx="60" cy="60" r="45" fill="none" style={{ stroke: 'var(--muted)' }} strokeWidth="8" />
          <circle cx="60" cy="60" r="45" fill="none" style={{ stroke: color }} strokeWidth="8"
            strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums" style={{ color }}>{percentage}%</span>
        </div>
      </div>
      <div className="text-lg font-semibold mt-2" style={{ color }}>{verdict}</div>
      <div className="text-xs text-muted-foreground mt-1">Fundamental Score</div>
    </div>
  );
};

const MetricRow = ({ item }) => (
  <div className="border-b border-border/60 last:border-0 py-2.5 text-sm">
    <div className="flex justify-between items-start gap-4 mb-1">
      <span className="text-muted-foreground">{item.name}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium tabular-nums text-foreground">
          {item.value}{item.unit || ''}
        </span>
        <ScoreBadge verdict={item.verdict} />
      </div>
    </div>
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{item.description}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{item.score}/{item.max_score}</span>
    </div>
    {/* Score bar */}
    <div className="mt-1.5 h-1.5 bg-muted rounded-full">
      <div
        className="h-1.5 rounded-full transition-all"
        style={{
          width: `${(item.score / item.max_score) * 100}%`,
          backgroundColor: item.score >= 8 ? 'var(--gain)' : item.score >= 5 ? 'var(--warning)' : 'var(--loss)',
        }}
      ></div>
    </div>
  </div>
);

const Section = ({ title, section }) => {
  if (!section || !section.items || section.items.length === 0) return null;
  return (
    <SectionCard
      title={title}
      action={<span className="text-xs tabular-nums text-muted-foreground font-medium">{section.score}/{section.max} points</span>}
      contentClassName="py-1"
    >
      {section.items.map((item) => (
        <MetricRow key={item.name} item={item} />
      ))}
    </SectionCard>
  );
};

const FundamentalTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/fundamental`);

  if (loading) return <TabSkeleton rows={10} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No fundamental data available." />;

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <div className="rounded-xl border border-border bg-card p-6">
        <OverallScore percentage={data.overall_percentage} verdict={data.overall_verdict} />

        {/* Category scores */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 mt-4">
          <ScoreRing score={data.valuation?.score || 0} maxScore={data.valuation?.max || 1} label="Valuation" />
          <ScoreRing score={data.profitability?.score || 0} maxScore={data.profitability?.max || 1} label="Profitability" />
          <ScoreRing score={data.growth?.score || 0} maxScore={data.growth?.max || 1} label="Growth" />
          <ScoreRing score={data.financial_health?.score || 0} maxScore={data.financial_health?.max || 1} label="Health" />
          <ScoreRing score={data.dividend?.score || 0} maxScore={data.dividend?.max || 1} label="Dividend" />
        </div>
      </div>

      {/* Sections */}
      <Section title="Valuation" section={data.valuation} />
      <Section title="Profitability" section={data.profitability} />
      <Section title="Growth" section={data.growth} />
      <Section title="Financial Health" section={data.financial_health} />
      <Section title="Dividend" section={data.dividend} />

      {/* Disclaimer */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
        <div className="flex gap-2">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Disclaimer:</span> Fundamental scores are calculated using standard financial metrics and general industry thresholds. They provide a simplified view and may not capture industry-specific nuances. Different sectors have different benchmarks (e.g., high P/B is normal for IT companies). This is not financial advice. Always conduct thorough research and consult a qualified financial advisor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FundamentalTab;
