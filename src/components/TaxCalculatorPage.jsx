import React, { useState, useEffect, useMemo, useCallback, useId } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calculator } from 'lucide-react';
import api from '../api';
import { useHoldings } from '../context/UserDataContext';
import { useMarket } from '../context/MarketContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import PageContainer from './common/PageContainer';
import PageHeader from './common/PageHeader';
import SectionCard from './common/SectionCard';
import StatCard from './common/StatCard';
import EmptyState from './common/EmptyState';

const formatCurrency = (num, currency) => {
  if (num == null || isNaN(num)) return '-';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (currency === '₹') {
    if (abs >= 1e7) return `${sign}${currency}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}${currency}${(abs / 1e5).toFixed(2)} L`;
    return `${sign}${currency}${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${sign}${currency}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DEFAULT_TAX_RATES = {
  in: { stcg: 20, ltcg: 12.5, ltcgExemption: 125000, cess: 4 },
  us: { stcg: 24, ltcg: 15, ltcgExemption: 0, cess: 0 },
};

const LINK_CLASS = 'text-sm font-medium text-foreground underline-offset-4 hover:underline dark:text-primary';
const HEAD_CLASS = 'text-xs font-medium uppercase text-muted-foreground';

const TypeBadge = ({ h, children }) => (
  <Badge variant={h.isLTCG ? 'secondary' : 'warning'} className="rounded-sm text-[10px] font-semibold">
    {children}
  </Badge>
);

const RateInput = ({ label, hint, ...props }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <Input id={id} type="number" className="tabular-nums" {...props} />
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
};

const TaxCalculatorPage = () => {
  const { market, currency } = useMarket();
  const [holdings] = useHoldings(market);
  const [liveData, setLiveData] = useState({});
  const [loading, setLoading] = useState(false);

  // Editable tax rates
  const [taxRates, setTaxRates] = useState(DEFAULT_TAX_RATES[market] || DEFAULT_TAX_RATES.in);

  // Reset tax rates when market changes
  useEffect(() => {
    setTaxRates(DEFAULT_TAX_RATES[market] || DEFAULT_TAX_RATES.in);
  }, [market]);

  const fetchPrices = useCallback(async () => {
    if (!holdings || holdings.length === 0) return;
    setLoading(true);
    try {
      const symbols = [...new Set(holdings.map(h => h.symbol))];
      const symbolsParam = symbols.join(',');
      const res = await api.get(`/api/stocks/batch?symbols=${encodeURIComponent(symbolsParam)}`);
      const quotes = res.data?.quotes || {};
      const map = {};
      symbols.forEach(sym => {
        const q = quotes[sym];
        if (q) {
          map[sym] = { price: q.price || 0, name: q.name || sym };
        }
      });
      setLiveData(map);
    } catch (err) {
      console.error('Error fetching prices for tax calc:', err);
    } finally {
      setLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Calculate holding data with tax info
  const holdingDetails = useMemo(() => {
    const today = new Date();
    return holdings.map(h => {
      const currentPrice = liveData[h.symbol]?.price || h.buyPrice;
      const buyDate = h.buyDate ? new Date(h.buyDate) : today;
      const holdingDays = Math.floor((today - buyDate) / (1000 * 60 * 60 * 24));
      const isLTCG = holdingDays >= 365;
      const gain = (currentPrice - h.buyPrice) * h.quantity;
      const gainPercent = h.buyPrice > 0 ? ((currentPrice - h.buyPrice) / h.buyPrice) * 100 : 0;

      return {
        ...h,
        currentPrice,
        holdingDays,
        isLTCG,
        gain,
        gainPercent,
        type: isLTCG ? 'LTCG' : 'STCG',
      };
    });
  }, [holdings, liveData]);

  // Tax summary
  const taxSummary = useMemo(() => {
    const stcgGains = holdingDetails
      .filter(h => !h.isLTCG && h.gain > 0)
      .reduce((s, h) => s + h.gain, 0);
    const stcgLosses = holdingDetails
      .filter(h => !h.isLTCG && h.gain < 0)
      .reduce((s, h) => s + h.gain, 0);
    const ltcgGains = holdingDetails
      .filter(h => h.isLTCG && h.gain > 0)
      .reduce((s, h) => s + h.gain, 0);
    const ltcgLosses = holdingDetails
      .filter(h => h.isLTCG && h.gain < 0)
      .reduce((s, h) => s + h.gain, 0);

    const totalGains = stcgGains + ltcgGains;
    const totalLosses = stcgLosses + ltcgLosses;
    const netGain = totalGains + totalLosses;

    // Intra-category offset first
    let netSTCG = stcgGains + stcgLosses;
    let netLTCG = ltcgGains + ltcgLosses;

    // Cross-category loss offset: STCG loss can offset LTCG gain and vice versa
    if (netSTCG < 0 && netLTCG > 0) {
      netLTCG = netLTCG + netSTCG; // netSTCG is negative
      netSTCG = Math.min(0, netLTCG); // if LTCG also went negative, carry the remainder
      if (netLTCG < 0) { netSTCG = netLTCG; netLTCG = 0; }
      else { netSTCG = 0; }
    } else if (netLTCG < 0 && netSTCG > 0) {
      netSTCG = netSTCG + netLTCG; // netLTCG is negative
      if (netSTCG < 0) { netLTCG = netSTCG; netSTCG = 0; }
      else { netLTCG = 0; }
    }

    const taxableSTCG = Math.max(0, netSTCG);
    const taxableLTCGBeforeExemption = Math.max(0, netLTCG);

    // Tax calculations
    const stcgTax = taxableSTCG * (taxRates.stcg / 100);
    const taxableLTCG = Math.max(0, taxableLTCGBeforeExemption - (taxRates.ltcgExemption || 0));
    const ltcgTax = taxableLTCG * (taxRates.ltcg / 100);
    const baseTax = stcgTax + ltcgTax;
    const cessAmount = baseTax * ((taxRates.cess || 0) / 100);
    const totalTax = baseTax + cessAmount;

    return {
      stcgGains, stcgLosses, ltcgGains, ltcgLosses,
      totalGains, totalLosses, netGain,
      netSTCG: taxableSTCG, netLTCG: taxableLTCGBeforeExemption,
      stcgTax, ltcgTax, taxableLTCG, totalTax, cessAmount,
    };
  }, [holdingDetails, taxRates]);

  // Tax-loss harvesting candidates
  const harvestCandidates = useMemo(() => {
    return holdingDetails
      .filter(h => h.gain < 0)
      .sort((a, b) => a.gain - b.gain);
  }, [holdingDetails]);

  const plColor = val => val >= 0 ? 'text-gain' : 'text-loss';
  const marketLabel = market === 'in' ? 'India' : 'US';

  return (
    <PageContainer>
      <PageHeader
        title="Capital Gains Tax Calculator"
        description={`Estimate your tax liability on portfolio holdings (${marketLabel} tax rules)`}
      />

      {holdings.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No holdings to calculate tax on."
          description={<>Add holdings in your <Link to="/portfolio" className={LINK_CLASS}>Portfolio</Link> first.</>}
        />
      ) : (
        <>
          {/* Tax Rate Settings */}
          <SectionCard title={`Tax Rate Settings (${marketLabel})`}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <RateInput
                label="STCG Rate (%)"
                value={taxRates.stcg}
                onChange={e => setTaxRates(prev => ({ ...prev, stcg: parseFloat(e.target.value) || 0 }))}
                min="0" max="100" step="0.5"
                hint={market === 'in' ? 'Default: 20% (Budget 2024)' : 'Default: 24% (ordinary income)'}
              />
              <RateInput
                label="LTCG Rate (%)"
                value={taxRates.ltcg}
                onChange={e => setTaxRates(prev => ({ ...prev, ltcg: parseFloat(e.target.value) || 0 }))}
                min="0" max="100" step="0.5"
                hint={market === 'in' ? 'Default: 12.5% above exemption' : 'Default: 15%'}
              />
              <RateInput
                label={`LTCG Exemption (${currency})`}
                value={taxRates.ltcgExemption}
                onChange={e => setTaxRates(prev => ({ ...prev, ltcgExemption: parseFloat(e.target.value) || 0 }))}
                min="0" step="1000"
                hint={market === 'in' ? 'Default: ₹1,25,000 per year' : 'Default: $0'}
              />
              <RateInput
                label="Cess (%)"
                value={taxRates.cess}
                onChange={e => setTaxRates(prev => ({ ...prev, cess: parseFloat(e.target.value) || 0 }))}
                min="0" max="100" step="0.5"
                hint={market === 'in' ? 'Default: 4% H&E cess' : 'Default: 0%'}
              />
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setTaxRates(DEFAULT_TAX_RATES[market] || DEFAULT_TAX_RATES.in)}
              className="mt-3 h-auto px-0 text-xs"
            >
              Reset to defaults
            </Button>
          </SectionCard>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label="Total Unrealized Gains"
              value={<span className={plColor(taxSummary.netGain)}>{loading ? '...' : formatCurrency(taxSummary.netGain, currency)}</span>}
            />
            <StatCard
              label={`STCG (<1yr)`}
              value={<span className={plColor(taxSummary.netSTCG)}>{loading ? '...' : formatCurrency(taxSummary.netSTCG, currency)}</span>}
              sub={`Tax: ${formatCurrency(taxSummary.stcgTax, currency)}`}
            />
            <StatCard
              label={`LTCG (>=1yr)`}
              value={<span className={plColor(taxSummary.netLTCG)}>{loading ? '...' : formatCurrency(taxSummary.netLTCG, currency)}</span>}
              sub={`Taxable: ${formatCurrency(taxSummary.taxableLTCG, currency)}`}
            />
            <StatCard
              label="Estimated Tax"
              value={<span className="text-loss">{loading ? '...' : formatCurrency(taxSummary.totalTax, currency)}</span>}
              sub={<>
                STCG: {formatCurrency(taxSummary.stcgTax, currency)} + LTCG: {formatCurrency(taxSummary.ltcgTax, currency)}
                {taxSummary.cessAmount > 0 && ` + Cess: ${formatCurrency(taxSummary.cessAmount, currency)}`}
              </>}
            />
          </div>

          {/* Per-Holding Breakdown Table */}
          <SectionCard title="Per-Holding Breakdown" contentClassName="p-0">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className={`${HEAD_CLASS} px-4`}>Stock</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Buy Date</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Holding</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Buy Price</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>CMP</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Qty</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Gain/Loss</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-center`}>Type</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Est. Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdingDetails.map((h, idx) => {
                    const taxRate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                    const estTax = h.gain > 0 ? h.gain * (taxRate / 100) : 0;

                    return (
                      <TableRow key={h.id || idx}>
                        <TableCell className="px-4 py-3">
                          <Link to={`/stock/${h.symbol}`} className={LINK_CLASS}>
                            {h.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{h.symbol}</div>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                          {h.buyDate || 'N/A'}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                          {h.holdingDays} days
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-foreground/85 tabular-nums">
                          {currency}{h.buyPrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right font-medium tabular-nums">
                          {loading ? '...' : `${currency}${h.currentPrice.toFixed(2)}`}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-foreground/85 tabular-nums">{h.quantity}</TableCell>
                        <TableCell className="px-3 py-3 text-right tabular-nums">
                          <div className={`font-medium ${plColor(h.gain)}`}>
                            {loading ? '...' : formatCurrency(h.gain, currency)}
                          </div>
                          <div className={`text-xs ${plColor(h.gainPercent)}`}>
                            {loading ? '' : `${h.gainPercent >= 0 ? '+' : ''}${h.gainPercent.toFixed(2)}%`}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center">
                          <TypeBadge h={h}>{h.type}</TypeBadge>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right font-medium text-foreground/85 tabular-nums">
                          {loading ? '...' : h.gain > 0 ? formatCurrency(estTax, currency) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 p-4 md:hidden">
              {holdingDetails.map((h, idx) => {
                const taxRate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                const estTax = h.gain > 0 ? h.gain * (taxRate / 100) : 0;

                return (
                  <div key={h.id || idx} className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <Link to={`/stock/${h.symbol}`} className={LINK_CLASS}>
                          {h.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{h.symbol}</div>
                      </div>
                      <TypeBadge h={h}>{h.type} ({h.holdingDays}d)</TypeBadge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                      <div>
                        <span className="text-muted-foreground">Buy</span>
                        <div className="font-medium">{currency}{h.buyPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">CMP</span>
                        <div className="font-medium">{loading ? '...' : `${currency}${h.currentPrice.toFixed(2)}`}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Gain/Loss</span>
                        <div className={`font-medium ${plColor(h.gain)}`}>
                          {loading ? '...' : formatCurrency(h.gain, currency)}
                        </div>
                      </div>
                    </div>
                    {h.gain > 0 && (
                      <div className="mt-2 border-t border-border pt-2 text-xs">
                        <span className="text-muted-foreground">Est. Tax:</span>
                        <span className="ml-1 font-medium text-loss tabular-nums">{formatCurrency(estTax, currency)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Tax-Loss Harvesting */}
          {harvestCandidates.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Tax-Loss Harvesting Opportunities</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These holdings have unrealized losses that could be booked to offset gains and reduce tax liability.
                </p>
              </header>
              <Table>
                <TableHeader>
                  <TableRow className="bg-loss/5 hover:bg-loss/5">
                    <TableHead className={`${HEAD_CLASS} px-4`}>Stock</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Unrealized Loss</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Loss %</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-center`}>Type</TableHead>
                    <TableHead className={`${HEAD_CLASS} px-3 text-right`}>Potential Tax Saving</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {harvestCandidates.map((h, idx) => {
                    const taxRate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                    const potentialSaving = Math.abs(h.gain) * (taxRate / 100);

                    return (
                      <TableRow key={h.id || idx} className="hover:bg-loss/5">
                        <TableCell className="px-4 py-3">
                          <Link to={`/stock/${h.symbol}`} className={LINK_CLASS}>
                            {h.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{h.symbol}</div>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right font-medium text-loss tabular-nums">
                          {formatCurrency(h.gain, currency)}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-xs text-loss tabular-nums">
                          {h.gainPercent.toFixed(2)}%
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center">
                          <TypeBadge h={h}>{h.type}</TypeBadge>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right font-medium text-gain tabular-nums">
                          {formatCurrency(potentialSaving, currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="border-t border-border bg-muted/40 px-4 py-2">
                <p className="text-xs text-muted-foreground">
                  Total potential tax saving: <span className="font-semibold text-gain tabular-nums">
                    {formatCurrency(
                      harvestCandidates.reduce((s, h) => {
                        const rate = h.isLTCG ? taxRates.ltcg : taxRates.stcg;
                        return s + Math.abs(h.gain) * (rate / 100);
                      }, 0),
                      currency
                    )}
                  </span>
                </p>
              </div>
            </section>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="font-medium">Disclaimer</p>
              <p className="mt-1 text-xs text-foreground/85">
                This is an estimate based on simplified tax rules. Actual tax liability may differ based on your specific
                financial situation, exemptions, surcharges, cess, and other factors. Please consult a qualified tax
                professional before making any tax-related decisions.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {market === 'in'
                  ? 'India (Budget 2024): STCG at 20% (Section 111A), LTCG at 12.5% above ₹1.25L exemption (Section 112A) for listed equity + 4% H&E cess. Losses offset across STCG/LTCG categories.'
                  : 'US: Simplified rates shown. Actual rates depend on income bracket and filing status. STCG taxed as ordinary income (10-37%).'}
              </p>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
};

export default TaxCalculatorPage;
