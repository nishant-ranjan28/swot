import React, { useState, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import Papa from 'papaparse';
import { UploadCloud } from 'lucide-react';
import api from '../api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const MAX_FILE_BYTES = 1 * 1024 * 1024;
const MAX_ROWS = 5000;
const BATCH_CHUNK_SIZE = 20;

const HEADER_ALIASES = {
  symbol: 'symbol',
  name: 'name',
  quantity: 'quantity',
  qty: 'quantity',
  'buy price': 'buyPrice',
  buyprice: 'buyPrice',
  'avg price': 'buyPrice',
  avgprice: 'buyPrice',
  'buy date': 'buyDate',
  buydate: 'buyDate',
  date: 'buyDate',
};

const REQUIRED = ['symbol', 'quantity', 'buyPrice', 'buyDate'];

const formatLocalISO = (dt) => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const todayISO = () => formatLocalISO(new Date());

const parseDate = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (isoMatch) {
    return s;
  }
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const ts = Date.parse(s);
  if (!Number.isNaN(ts)) {
    return formatLocalISO(new Date(ts));
  }
  return null;
};

const parseNumber = (raw) => {
  if (raw == null) return Number.NaN;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return Number.NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
};

const normalizeHeaders = (headerRow) => {
  const map = {};
  headerRow.forEach((raw, idx) => {
    const key = String(raw || '').trim().toLowerCase();
    const canonical = HEADER_ALIASES[key];
    if (canonical) map[canonical] = idx;
  });
  return map;
};

const dedupeKey = (symbol, quantity, buyPrice, buyDate) =>
  `${String(symbol).toUpperCase()}|${quantity}|${buyPrice}|${buyDate}`;

export const validateRow = (row, headerMap, seenKeys) => {
  const get = (key) => {
    const idx = headerMap[key];
    return idx == null ? '' : (row[idx] ?? '');
  };

  const symbol = String(get('symbol') || '').trim().toUpperCase();
  if (!symbol) return { status: 'rejected', reason: 'missing symbol' };

  const qty = parseNumber(get('quantity'));
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return { status: 'rejected', reason: 'quantity must be a positive integer' };
  }

  const buyPrice = parseNumber(get('buyPrice'));
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
    return { status: 'rejected', reason: 'buy price must be a positive number' };
  }

  const buyDate = parseDate(get('buyDate'));
  if (!buyDate) return { status: 'rejected', reason: 'invalid buy date' };
  if (buyDate > todayISO()) return { status: 'rejected', reason: 'buy date is in the future' };

  const name = String(get('name') || '').trim();
  const rowData = { symbol, name, quantity: qty, buyPrice, buyDate };

  if (seenKeys.has(dedupeKey(symbol, qty, buyPrice, buyDate))) {
    return { status: 'duplicate', reason: 'already in portfolio', row: rowData };
  }

  return { status: 'pending', row: rowData };
};

const REQUIRED_LABELS = {
  symbol: 'Symbol',
  quantity: 'Quantity',
  buyPrice: 'Buy Price',
  buyDate: 'Buy Date',
};

export const parseCsvText = (text, existingHoldings) => {
  const result = Papa.parse(text.replace(/﻿/g, ''), { skipEmptyLines: 'greedy' });
  if (result.errors?.length) {
    const fatal = result.errors.find((e) => e.code !== 'TooFewFields' && e.code !== 'TooManyFields');
    if (fatal) return { fatal: `CSV parse error: ${fatal.message}` };
  }

  const data = result.data || [];
  if (data.length === 0) return { fatal: 'File is empty.' };

  const headerRow = data[0];
  const headerMap = normalizeHeaders(headerRow);
  const missing = REQUIRED.filter((k) => headerMap[k] == null);
  if (missing.length) {
    const labels = missing.map((k) => REQUIRED_LABELS[k] || k).join(', ');
    return { fatal: `Missing required column(s): ${labels}` };
  }

  const rows = data.slice(1);
  if (rows.length === 0) return { fatal: 'File has a header but no data rows.' };
  if (rows.length > MAX_ROWS) return { fatal: `Too many rows (${rows.length}). Max ${MAX_ROWS}. Split into batches.` };

  const seenKeys = new Set(
    (existingHoldings || []).map((h) => dedupeKey(h.symbol, h.quantity, h.buyPrice, h.buyDate)),
  );

  const classified = rows.map((rawRow, idx) => {
    const v = validateRow(rawRow, headerMap, seenKeys);
    if (v.status === 'pending') {
      const { symbol, quantity, buyPrice, buyDate } = v.row;
      seenKeys.add(dedupeKey(symbol, quantity, buyPrice, buyDate));
    }
    return { lineNumber: idx + 2, ...v };
  });

  return { fatal: null, classified };
};

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const fetchBatchLookup = async (symbols) => {
  if (symbols.length === 0) return {};
  const chunks = chunk(symbols, BATCH_CHUNK_SIZE);
  const results = await Promise.all(
    chunks.map((c) =>
      api
        .get(`/api/stocks/batch?symbols=${encodeURIComponent(c.join(','))}`)
        .then((res) => res.data?.quotes || {}),
    ),
  );
  return Object.assign({}, ...results);
};

const StatusPill = ({ status }) => {
  if (status === 'valid') {
    return <Badge variant="gain">Valid</Badge>;
  }
  if (status === 'duplicate') {
    return <Badge variant="warning">Duplicate</Badge>;
  }
  return <Badge variant="loss">Rejected</Badge>;
};

const PortfolioImport = ({ open, onClose, market, holdings, onImport }) => {
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [classified, setClassified] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setErrorMsg('');
    setClassified([]);
    setLoading(false);
    setConfirmingReplace(false);
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const failUpload = (msg) => {
    setErrorMsg(msg);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file) => {
    setErrorMsg('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      failUpload('Please choose a .csv file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      failUpload(`File too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 1 MB.`);
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      const text = await file.text();
      const { fatal, classified: parsed } = parseCsvText(text, holdings);
      if (fatal) {
        failUpload(fatal);
        return;
      }

      const symbolsToLookup = [
        ...new Set(parsed.filter((c) => c.status === 'pending').map((c) => c.row.symbol)),
      ];

      let lookup;
      try {
        lookup = await fetchBatchLookup(symbolsToLookup);
      } catch (lookupErr) {
        failUpload(
          `Symbol lookup failed (${lookupErr.message || 'network error'}). Please retry.`,
        );
        return;
      }

      const final = parsed.map((c) => {
        if (c.status !== 'pending') return c;
        if (!(c.row.symbol in lookup)) {
          return { ...c, status: 'rejected', reason: 'symbol not found' };
        }
        const quote = lookup[c.row.symbol];
        return {
          ...c,
          status: 'valid',
          row: { ...c.row, name: c.row.name || quote.name || c.row.symbol },
        };
      });

      setClassified(final);
      setStep('preview');
    } catch (err) {
      failUpload(`Failed to read file: ${err.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const valid = classified.filter((c) => c.status === 'valid');
  const duplicates = classified.filter((c) => c.status === 'duplicate');
  const rejected = classified.filter((c) => c.status === 'rejected');

  const handleAppend = () => {
    const newRows = valid.map((c) => ({
      ...c.row,
      id: crypto.randomUUID(),
    }));
    onImport(newRows, 'append');
    close();
  };

  const handleReplace = () => {
    const newRows = valid.map((c) => ({
      ...c.row,
      id: crypto.randomUUID(),
    }));
    onImport(newRows, 'replace');
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-base">Import Portfolio CSV</DialogTitle>
          <DialogDescription className="text-xs">
            Importing into <span className="font-medium text-foreground">{market === 'us' ? 'US' : 'Indian'}</span> market — switch markets to import there.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-5 py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className={cn(
                  'rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors',
                  dragActive && 'border-primary bg-primary/5',
                )}
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
              >
                <UploadCloud className="mx-auto mb-2 size-10 text-muted-foreground/70" aria-hidden />
                <p className="mb-3 text-sm text-muted-foreground">Drop your CSV here, or</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? 'Processing…' : 'Choose file'}
                </Button>
                {fileName && !loading && (
                  <p className="mt-2 text-xs text-muted-foreground">Selected: {fileName}</p>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <a
                  href="/portfolio-template.csv"
                  download="portfolio-template.csv"
                  className="font-medium text-foreground underline underline-offset-4 dark:text-primary"
                >
                  Download CSV template
                </a>
                <span className="text-muted-foreground/70">Max 1 MB, 5,000 rows</span>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground/85">Required columns:</p>
                <code className="block rounded-sm border border-border bg-card px-2 py-1 font-mono">
                  Symbol, Quantity, Buy Price, Buy Date
                </code>
                <p className="mt-2"><span className="font-medium">Optional:</span> Name (auto-filled if blank). Extra columns are ignored.</p>
              </div>

              {errorMsg && (
                <div role="alert" className="rounded-md border border-loss/30 bg-loss/5 p-3 text-sm text-loss">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="gain" className="px-2 py-1 text-sm">{valid.length} valid</Badge>
                <Badge variant="warning" className="px-2 py-1 text-sm">{duplicates.length} duplicates</Badge>
                <Badge variant="loss" className="px-2 py-1 text-sm">{rejected.length} rejected</Badge>
              </div>

              {/* shadcn Table wraps <table> in its own overflow container, so the height cap
                  goes on that container; otherwise the sticky header has nothing to stick to. */}
              <div className="overflow-hidden rounded-lg border border-border [&_[data-slot=table-container]]:max-h-[50vh] [&_[data-slot=table-container]]:overflow-auto">
                <div>
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-8 text-xs uppercase text-muted-foreground">Line</TableHead>
                        <TableHead className="h-8 text-xs uppercase text-muted-foreground">Status</TableHead>
                        <TableHead className="h-8 text-xs uppercase text-muted-foreground">Symbol</TableHead>
                        <TableHead className="h-8 text-right text-xs uppercase text-muted-foreground">Qty</TableHead>
                        <TableHead className="h-8 text-right text-xs uppercase text-muted-foreground">Buy Price</TableHead>
                        <TableHead className="h-8 text-xs uppercase text-muted-foreground">Buy Date</TableHead>
                        <TableHead className="h-8 text-xs uppercase text-muted-foreground">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classified.map((c) => (
                        <TableRow key={c.lineNumber}>
                          <TableCell className="py-1.5 text-muted-foreground/70 tabular-nums">{c.lineNumber}</TableCell>
                          <TableCell className="py-1.5"><StatusPill status={c.status} /></TableCell>
                          <TableCell className="py-1.5 font-mono">{c.row?.symbol || '-'}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{c.row?.quantity ?? '-'}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{c.row?.buyPrice ?? '-'}</TableCell>
                          <TableCell className="py-1.5 tabular-nums">{c.row?.buyDate || '-'}</TableCell>
                          <TableCell className="py-1.5 text-muted-foreground">{c.reason || ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => { reset(); }}>
              Back
            </Button>
            <div className="flex items-center gap-2">
              {confirmingReplace ? (
                <Button variant="destructive" size="sm" onClick={handleReplace}>
                  Yes, replace {holdings.length} existing holding{holdings.length === 1 ? '' : 's'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingReplace(true)}
                  className="border-loss/30 text-loss hover:bg-loss/10 hover:text-loss"
                  disabled={valid.length === 0}
                  title="Replace all current holdings with these"
                >
                  Replace all
                </Button>
              )}
              <Button size="sm" onClick={handleAppend} disabled={valid.length === 0}>
                Append {valid.length} row{valid.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

StatusPill.propTypes = {
  status: PropTypes.oneOf(['valid', 'duplicate', 'rejected', 'pending']).isRequired,
};

PortfolioImport.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  market: PropTypes.string.isRequired,
  holdings: PropTypes.arrayOf(
    PropTypes.shape({
      symbol: PropTypes.string,
      quantity: PropTypes.number,
      buyPrice: PropTypes.number,
      buyDate: PropTypes.string,
    }),
  ).isRequired,
  onImport: PropTypes.func.isRequired,
};

export default PortfolioImport;
