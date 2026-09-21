import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const headClass = 'text-xs uppercase tracking-wide text-muted-foreground';
const tileClass = 'rounded-lg border border-border bg-card p-3 text-center';

// Lighter shade of a token, for the "Buy"/"Sell" (non-strong) zones.
const soft = (token) => `color-mix(in oklab, var(${token}) 60%, transparent)`;

const SignalBadge = ({ signal }) => {
  const variants = {
    'Strong Buy': { variant: 'gain', className: 'bg-gain/25' },
    'Buy': { variant: 'gain' },
    'Neutral': { variant: 'warning' },
    'Sell': { variant: 'loss' },
    'Strong Sell': { variant: 'loss', className: 'bg-loss/25' },
    'Bullish': { variant: 'gain' },
    'Bearish': { variant: 'loss' },
  };
  const { variant, className } = variants[signal] || { variant: 'secondary' };
  return (
    <Badge variant={variant} className={cn('rounded-sm font-semibold', className)}>
      {signal}
    </Badge>
  );
};

const GaugeChart = ({ percentage, signal }) => {
  const rotation = -90 + (percentage / 100) * 180;
  const colors = {
    'Strong Buy': 'var(--gain)',
    'Buy': soft('--gain'),
    'Neutral': 'var(--warning)',
    'Sell': soft('--loss'),
    'Strong Sell': 'var(--loss)',
  };
  const color = colors[signal] || 'var(--muted-foreground)';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-20 overflow-hidden">
        {/* Background arc */}
        <div className="absolute w-40 h-40 rounded-full border-12 border-muted"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)' }}
        ></div>
        {/* Colored segments */}
        <div className="absolute w-40 h-40 rounded-full border-12 border-transparent"
          style={{
            borderTopColor: 'var(--loss)', borderRightColor: soft('--loss'),
            clipPath: 'polygon(0 0, 30% 0, 50% 50%, 0 50%)',
          }}
        ></div>
        {/* Needle */}
        <div className="absolute bottom-0 left-1/2 w-1 h-16 origin-bottom rounded-full"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            background: 'var(--foreground)',
          }}
        ></div>
        <div className="absolute bottom-0 left-1/2 w-3 h-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground"></div>
      </div>
      <div className="text-2xl font-semibold mt-2" style={{ color }}>{signal}</div>
      <div className="text-sm tabular-nums text-muted-foreground">{percentage}% Buy signals</div>
    </div>
  );
};

const TechnicalTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/technical`);
  const { currency } = useMarket();

  if (loading) return <TabSkeleton rows={10} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No technical data available." />;

  return (
    <div className="space-y-6">
      {/* Overall Signal */}
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <GaugeChart percentage={data.buy_percentage} signal={data.overall_signal} />
      </div>

      {/* Trend Analysis */}
      <SectionCard title="Trend Analysis">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Short Term', value: data.trend?.short_term },
            { label: 'Medium Term', value: data.trend?.medium_term },
            { label: 'Long Term', value: data.trend?.long_term },
          ].map((t) => (
            <div key={t.label} className="rounded-lg bg-muted/40 p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">{t.label}</div>
              <SignalBadge signal={t.value} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Key Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={tileClass}>
          <div className="text-xs text-muted-foreground">RSI (14)</div>
          <div className={`text-lg font-semibold tabular-nums ${
            data.oscillators?.rsi < 30 ? 'text-gain' : data.oscillators?.rsi > 70 ? 'text-loss' : 'text-foreground'
          }`}>
            {data.oscillators?.rsi || 'N/A'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {data.oscillators?.rsi < 30 ? 'Oversold' : data.oscillators?.rsi > 70 ? 'Overbought' : 'Normal'}
          </div>
        </div>
        <div className={tileClass}>
          <div className="text-xs text-muted-foreground">MACD</div>
          <div className={`text-lg font-semibold tabular-nums ${
            data.oscillators?.macd?.histogram > 0 ? 'text-gain' : 'text-loss'
          }`}>
            {data.oscillators?.macd?.line || 'N/A'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Signal: {data.oscillators?.macd?.signal || 'N/A'}
          </div>
        </div>
        <div className={tileClass}>
          <div className="text-xs text-muted-foreground">Volatility</div>
          <div className="text-lg font-semibold tabular-nums text-foreground">{data.volatility}%</div>
          <div className="text-[10px] text-muted-foreground">Annualized</div>
        </div>
        <div className={tileClass}>
          <div className="text-xs text-muted-foreground">ATR</div>
          <div className="text-lg font-semibold tabular-nums text-foreground">{data.atr || 'N/A'}</div>
          <div className="text-[10px] text-muted-foreground">Avg True Range</div>
        </div>
      </div>

      {/* Additional Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className={tileClass}>
          <div className="text-xs text-muted-foreground">Stochastic %K / %D</div>
          <div className={`text-lg font-semibold tabular-nums ${
            data.stochastic?.k < 20 ? 'text-gain' : data.stochastic?.k > 80 ? 'text-loss' : 'text-foreground'
          }`}>
            {data.stochastic?.k != null ? data.stochastic.k : 'N/A'} / {data.stochastic?.d != null ? data.stochastic.d : 'N/A'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {data.stochastic?.k < 20 ? 'Oversold' : data.stochastic?.k > 80 ? 'Overbought' : 'Normal'}
          </div>
        </div>
        <div className={tileClass}>
          <div className="text-xs text-muted-foreground">ADX (14)</div>
          <div className={`text-lg font-semibold tabular-nums ${
            data.adx >= 25 ? 'text-foreground font-semibold' : 'text-foreground'
          }`}>
            {data.adx != null ? data.adx : 'N/A'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {data.adx >= 50 ? 'Very Strong Trend' : data.adx >= 25 ? 'Strong Trend' : data.adx != null ? 'Weak Trend' : ''}
          </div>
        </div>
        <div className={tileClass}>
          <div className="text-xs text-muted-foreground">Williams %R (14)</div>
          <div className={`text-lg font-semibold tabular-nums ${
            data.williams_r < -80 ? 'text-gain' : data.williams_r > -20 ? 'text-loss' : 'text-foreground'
          }`}>
            {data.williams_r != null ? data.williams_r : 'N/A'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {data.williams_r < -80 ? 'Oversold' : data.williams_r > -20 ? 'Overbought' : data.williams_r != null ? 'Normal' : ''}
          </div>
        </div>
      </div>

      {/* Moving Averages */}
      <SectionCard title="Moving Averages" action={<SignalBadge signal={data.moving_averages?.summary} />} contentClassName="p-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Indicator</TableHead>
                <TableHead className={`text-right ${headClass}`}>Value</TableHead>
                <TableHead className={`text-right ${headClass}`}>Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.moving_averages?.signals?.map((ma) => (
                <TableRow key={ma.name}>
                  <TableCell className="text-foreground/85">{ma.name}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{currency}{ma.value?.toLocaleString(currency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right"><SignalBadge signal={ma.signal} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </SectionCard>

      {/* Oscillators */}
      <SectionCard title="Oscillators" action={<SignalBadge signal={data.oscillators?.summary} />} contentClassName="p-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Indicator</TableHead>
                <TableHead className={`text-right ${headClass}`}>Value</TableHead>
                <TableHead className={`text-right ${headClass}`}>Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.oscillators?.signals?.map((osc) => (
                <TableRow key={osc.name}>
                  <TableCell className="text-foreground/85">{osc.name}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{typeof osc.value === 'number' ? osc.value.toFixed(2) : osc.value}</TableCell>
                  <TableCell className="text-right"><SignalBadge signal={osc.signal} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </SectionCard>

      {/* Bollinger Bands */}
      {data.oscillators?.bollinger?.upper && (
        <SectionCard title="Bollinger Bands">
          <div className="grid grid-cols-3 gap-3">
            <div className={tileClass}>
              <div className="text-xs text-muted-foreground">Upper Band</div>
              <div className="text-sm font-semibold tabular-nums text-loss">{currency}{data.oscillators.bollinger.upper}</div>
            </div>
            <div className={tileClass}>
              <div className="text-xs text-muted-foreground">Middle (SMA 20)</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">{currency}{data.oscillators.bollinger.middle}</div>
            </div>
            <div className={tileClass}>
              <div className="text-xs text-muted-foreground">Lower Band</div>
              <div className="text-sm font-semibold tabular-nums text-gain">{currency}{data.oscillators.bollinger.lower}</div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Support & Resistance */}
      {(data.support_levels?.length > 0 || data.resistance_levels?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.support_levels?.length > 0 && (
            <SectionCard title={<span className="flex items-center"><span className="w-2 h-2 bg-gain rounded-full mr-2"></span>Support Levels</span>}>
              <div className="space-y-2">
                {data.support_levels.map((level, idx) => (
                  <div key={idx} className="flex justify-between rounded-lg bg-gain/5 p-3">
                    <span className="text-sm text-muted-foreground">S{idx + 1}</span>
                    <span className="text-sm font-semibold tabular-nums text-gain">{currency}{level.toLocaleString(currency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
          {data.resistance_levels?.length > 0 && (
            <SectionCard title={<span className="flex items-center"><span className="w-2 h-2 bg-loss rounded-full mr-2"></span>Resistance Levels</span>}>
              <div className="space-y-2">
                {data.resistance_levels.map((level, idx) => (
                  <div key={idx} className="flex justify-between rounded-lg bg-loss/5 p-3">
                    <span className="text-sm text-muted-foreground">R{idx + 1}</span>
                    <span className="text-sm font-semibold tabular-nums text-loss">{currency}{level.toLocaleString(currency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Candlestick Patterns */}
      {data.candlestick_patterns?.length > 0 && (
        <SectionCard title="Candlestick Patterns">
          <div className="flex flex-wrap gap-2">
            {data.candlestick_patterns.map((pattern, idx) => (
              <div key={idx} className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                pattern.signal === 'Bullish' ? 'border-gain/30 bg-gain/5' : 'border-loss/30 bg-loss/5'
              )}>
                <span className={cn('font-medium', pattern.signal === 'Bullish' ? 'text-gain' : 'text-loss')}>{pattern.name}</span>
                <Badge variant={pattern.signal === 'Bullish' ? 'gain' : 'loss'} className="rounded-sm font-semibold">{pattern.signal}</Badge>
                <span className="text-xs text-muted-foreground">{pattern.strength}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
        <div className="flex gap-2">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Disclaimer:</span> Technical indicators are mathematical calculations based on historical price and volume data. They are not predictions of future performance and should not be used as the sole basis for investment decisions. Always combine with fundamental analysis and consult a qualified financial advisor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TechnicalTab;
