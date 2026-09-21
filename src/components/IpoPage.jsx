import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { UPCOMING_IPOS, RECENT_LISTINGS } from '../data/ipoData';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import PriceChange from '@/components/common/PriceChange';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { segmentClass } from '@/lib/segment';

function IpoPage() {
  const [activeTab, setActiveTab] = useState('upcoming');

  const listingGainPct = (issue, listing) => (((listing - issue) / issue) * 100).toFixed(1);
  const currentGainPct = (issue, cmp) => (((cmp - issue) / issue) * 100).toFixed(1);

  return (
    <PageContainer>
      <PageHeader title="IPO Tracker" description="Track upcoming IPOs and recent listing performance" />

      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="View">
        <button
          type="button"
          aria-pressed={activeTab === 'upcoming'}
          onClick={() => setActiveTab('upcoming')}
          className={segmentClass(activeTab === 'upcoming')}
        >
          Upcoming IPOs ({UPCOMING_IPOS.length})
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'recent'}
          onClick={() => setActiveTab('recent')}
          className={segmentClass(activeTab === 'recent')}
        >
          Recent Listings ({RECENT_LISTINGS.length})
        </button>
      </div>

      {/* Upcoming IPOs */}
      {activeTab === 'upcoming' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {UPCOMING_IPOS.map((ipo, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20">
              <div className="flex justify-between items-start gap-2 mb-3">
                <h3 className="font-semibold text-sm">{ipo.name}</h3>
                <Badge variant="secondary">{ipo.sector}</Badge>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Expected Date</dt>
                  <dd>{ipo.dates}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Price Band</dt>
                  <dd className="tabular-nums">{ipo.priceRange}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Lot Size</dt>
                  <dd className="tabular-nums">{ipo.lotSize}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Exchange</dt>
                  <dd>{ipo.exchange}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {/* Recent Listings */}
      {activeTab === 'recent' && (
        <SectionCard contentClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4 text-muted-foreground">Company</TableHead>
                <TableHead className="px-3 text-muted-foreground">Sector</TableHead>
                <TableHead className="px-3 text-center text-muted-foreground">List Date</TableHead>
                <TableHead className="px-3 text-right text-muted-foreground">Issue Price</TableHead>
                <TableHead className="px-3 text-right text-muted-foreground">List Price</TableHead>
                <TableHead className="px-3 text-right text-muted-foreground">List Gain%</TableHead>
                <TableHead className="px-3 text-right text-muted-foreground">CMP</TableHead>
                <TableHead className="px-4 text-right text-muted-foreground">Current Gain%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RECENT_LISTINGS.map((ipo, i) => {
                const lg = listingGainPct(ipo.issuePrice, ipo.listingPrice);
                const cg = currentGainPct(ipo.issuePrice, ipo.cmp);
                return (
                  <TableRow key={i}>
                    <TableCell className="px-4 py-3 font-medium">{ipo.name}</TableCell>
                    <TableCell className="px-3 py-3 text-muted-foreground">{ipo.sector}</TableCell>
                    <TableCell className="px-3 py-3 text-center tabular-nums text-foreground/85">{ipo.listDate}</TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums">{'₹'}{ipo.issuePrice}</TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums">{'₹'}{ipo.listingPrice}</TableCell>
                    <TableCell className="px-3 py-3 text-right font-medium">
                      <PriceChange percent={Number(lg)} decimals={1} />
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums">{'₹'}{ipo.cmp}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium">
                      <PriceChange percent={Number(cg)} decimals={1} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-xs text-muted-foreground">
          Note: IPO data is manually curated and may not be real-time. Verify details from official sources (SEBI, stock exchanges) before making investment decisions.
        </p>
      </div>
    </PageContainer>
  );
}

export default IpoPage;
