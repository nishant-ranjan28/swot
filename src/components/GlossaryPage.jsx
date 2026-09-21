import React, { useState, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { GLOSSARY, CATEGORIES } from '../data/glossary';
import { cn } from '@/lib/utils';
import { segmentClass } from '@/lib/segment';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import PageContainer from './common/PageContainer';
import PageHeader from './common/PageHeader';
import EmptyState from './common/EmptyState';

const GlossaryPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [expandedIndex, setExpandedIndex] = useState(null);

  const filtered = useMemo(() => {
    return GLOSSARY.filter(item => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const matchesSearch = !searchTerm ||
        item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.short.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.detail.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, activeCategory]);

  const toggleExpand = (idx) => {
    setExpandedIndex(expandedIndex === idx ? null : idx);
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Stock Glossary" description="Learn key finance and investing terms" />

      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden />
          <Input
            type="text"
            placeholder="Search terms..."
            aria-label="Search terms"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-10 bg-card pl-10 pr-4"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5 sm:w-fit" role="group" aria-label="Category">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              aria-pressed={activeCategory === cat}
              onClick={() => { setActiveCategory(cat); setExpandedIndex(null); }}
              className={segmentClass(activeCategory === cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">{filtered.length} term{filtered.length !== 1 ? 's' : ''} found</p>

        {/* Terms */}
        {filtered.length === 0 ? (
          <EmptyState icon={Search} title="No terms match your search" description="Try a different keyword or category" />
        ) : (
          <div className="space-y-2">
            {filtered.map((item, idx) => {
              const isExpanded = expandedIndex === idx;
              return (
                <div
                  key={item.term}
                  className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/20"
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpand(idx)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.term}</span>
                        <Badge variant="secondary">{item.category}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{item.short}</p>
                    </div>
                    <ChevronDown
                      className={cn('ml-2 size-4 shrink-0 text-muted-foreground/70 transition-transform', isExpanded && 'rotate-180')}
                      aria-hidden
                    />
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="border-t border-border pt-3">
                        <p className="text-sm leading-relaxed text-foreground/85">{item.detail}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default GlossaryPage;
