// src/components/layout/CommandPalette.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart } from 'lucide-react';
import api from '@/api';
import { useMarket } from '@/context/MarketContext';
import { NAV_ITEMS } from '@/nav';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { market } = useMarket();
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setStocks([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(q)}&market=${market}`);
        if (!cancelled) setStocks((res.data?.results || []).slice(0, 8));
      } catch {
        if (!cancelled) setStocks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); setLoading(false); };
  }, [query, market]);

  const go = (path) => {
    onOpenChange(false);
    setQuery('');
    navigate(path);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => { if (!o) setQuery(''); onOpenChange(o); }}
      title="Search" description="Search stocks or pages">
      <CommandInput placeholder="Search stocks or pages…" value={query} onValueChange={setQuery} />
      <CommandList>
        {!loading && <CommandEmpty>No results.</CommandEmpty>}
        {stocks.length > 0 && (
          <CommandGroup heading="Stocks">
            {stocks.map(s => (
              <CommandItem key={s.symbol} value={`${s.symbol} ${s.name}`}
                keywords={[query.trim()]}
                onSelect={() => go(`/stock/${s.symbol}`)}>
                <LineChart className="size-4 text-muted-foreground" />
                <span className="font-medium">{s.symbol}</span>
                <span className="truncate text-muted-foreground">{s.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Pages">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <CommandItem key={to} value={`page ${label}`} onSelect={() => go(to)}>
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
