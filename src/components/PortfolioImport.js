import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import api from '../api';

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

const todayISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().split('T')[0];
};

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
    const dt = new Date(ts);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).toISOString().split('T')[0];
  }
  return null;
};

const parseNumber = (raw) => {
  if (raw == null) return NaN;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
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

export const validateRow = (row, headerMap, existingHoldings, importedSoFar) => {
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

  const isDup = (list) =>
    list.some(
      (h) =>
        String(h.symbol).toUpperCase() === symbol &&
        Number(h.quantity) === qty &&
        Number(h.buyPrice) === buyPrice &&
        h.buyDate === buyDate,
    );
  if (isDup(existingHoldings) || isDup(importedSoFar)) {
    return { status: 'duplicate', reason: 'already in portfolio', row: { symbol, name, quantity: qty, buyPrice, buyDate } };
  }

  return { status: 'pending', row: { symbol, name, quantity: qty, buyPrice, buyDate } };
};

export const parseCsvText = (text, existingHoldings) => {
  const result = Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: true });
  if (result.errors && result.errors.length) {
    const fatal = result.errors.find((e) => e.code !== 'TooFewFields' && e.code !== 'TooManyFields');
    if (fatal) return { fatal: `CSV parse error: ${fatal.message}` };
  }

  const data = result.data || [];
  if (data.length === 0) return { fatal: 'File is empty.' };

  const headerRow = data[0];
  const headerMap = normalizeHeaders(headerRow);
  const missing = REQUIRED.filter((k) => headerMap[k] == null);
  if (missing.length) {
    return {
      fatal: `Missing required column(s): ${missing
        .map((k) => (k === 'buyPrice' ? 'Buy Price' : k === 'buyDate' ? 'Buy Date' : k))
        .join(', ')}`,
    };
  }

  const rows = data.slice(1);
  if (rows.length === 0) return { fatal: 'File has a header but no data rows.' };
  if (rows.length > MAX_ROWS) return { fatal: `Too many rows (${rows.length}). Max ${MAX_ROWS}. Split into batches.` };

  const classified = [];
  rows.forEach((rawRow, idx) => {
    const importedSoFar = classified.filter((c) => c.status === 'pending').map((c) => c.row);
    const v = validateRow(rawRow, headerMap, existingHoldings, importedSoFar);
    classified.push({ lineNumber: idx + 2, ...v });
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
        .then((res) => res.data?.quotes || {})
        .catch(() => ({})),
    ),
  );
  return Object.assign({}, ...results);
};

const StatusPill = ({ status }) => {
  if (status === 'valid') {
    return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Valid</span>;
  }
  if (status === 'duplicate') {
    return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Duplicate</span>;
  }
  return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Rejected</span>;
};

const PortfolioImport = ({ open, onClose, market, holdings, onImport }) => {
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [classified, setClassified] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const fileInputRef = useRef(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setErrorMsg('');
    setClassified([]);
    setLoading(false);
    setConfirmingReplace(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file) => {
    setErrorMsg('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setErrorMsg('Please choose a .csv file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg(`File too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 1 MB.`);
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      const text = await file.text();
      const { fatal, classified: parsed } = parseCsvText(text, holdings);
      if (fatal) {
        setErrorMsg(fatal);
        setLoading(false);
        return;
      }

      const symbolsToLookup = [
        ...new Set(parsed.filter((c) => c.status === 'pending').map((c) => c.row.symbol)),
      ];
      const lookup = await fetchBatchLookup(symbolsToLookup);

      const final = parsed.map((c) => {
        if (c.status !== 'pending') return c;
        const quote = lookup[c.row.symbol];
        if (!quote || !quote.price) {
          return { ...c, status: 'rejected', reason: 'symbol not found' };
        }
        return {
          ...c,
          status: 'valid',
          row: { ...c.row, name: c.row.name || quote.name || c.row.symbol },
        };
      });

      setClassified(final);
      setStep('preview');
    } catch (err) {
      setErrorMsg(`Failed to read file: ${err.message || 'unknown error'}`);
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
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    onImport(newRows, 'append');
    close();
  };

  const handleReplace = () => {
    const newRows = valid.map((c) => ({
      ...c.row,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    onImport(newRows, 'replace');
    close();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Import Portfolio CSV</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Importing into <span className="font-medium">{market === 'us' ? 'US' : 'Indian'}</span> market — switch markets to import there.
            </p>
          </div>
          <button
            onClick={close}
            className="text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-600 mb-3">Drop your CSV here, or</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors focus:outline-none disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Processing…' : 'Choose file'}
                </button>
                {fileName && !loading && (
                  <p className="text-xs text-gray-500 mt-2">Selected: {fileName}</p>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-600">
                <a
                  href="/portfolio-template.csv"
                  download="portfolio-template.csv"
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                >
                  Download CSV template
                </a>
                <span className="text-gray-400">Max 1 MB, 5,000 rows</span>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Required columns:</p>
                <code className="block bg-white px-2 py-1 rounded border border-gray-200 font-mono">
                  Symbol, Quantity, Buy Price, Buy Date
                </code>
                <p className="mt-2"><span className="font-medium">Optional:</span> Name (auto-filled if blank). Extra columns are ignored.</p>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="px-2 py-1 rounded bg-green-100 text-green-700 font-medium">{valid.length} valid</span>
                <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 font-medium">{duplicates.length} duplicates</span>
                <span className="px-2 py-1 rounded bg-red-100 text-red-700 font-medium">{rejected.length} rejected</span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-[50vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-2 font-medium">Line</th>
                        <th className="text-left px-2 py-2 font-medium">Status</th>
                        <th className="text-left px-2 py-2 font-medium">Symbol</th>
                        <th className="text-right px-2 py-2 font-medium">Qty</th>
                        <th className="text-right px-2 py-2 font-medium">Buy Price</th>
                        <th className="text-left px-2 py-2 font-medium">Buy Date</th>
                        <th className="text-left px-2 py-2 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classified.map((c, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2 py-1.5 text-gray-400">{c.lineNumber}</td>
                          <td className="px-2 py-1.5"><StatusPill status={c.status} /></td>
                          <td className="px-2 py-1.5 font-mono">{c.row?.symbol || '-'}</td>
                          <td className="px-2 py-1.5 text-right">{c.row?.quantity ?? '-'}</td>
                          <td className="px-2 py-1.5 text-right">{c.row?.buyPrice ?? '-'}</td>
                          <td className="px-2 py-1.5">{c.row?.buyDate || '-'}</td>
                          <td className="px-2 py-1.5 text-gray-500">{c.reason || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
            <button
              onClick={() => { reset(); }}
              className="text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 font-medium focus:outline-none"
            >
              Back
            </button>
            <div className="flex items-center gap-2">
              {!confirmingReplace ? (
                <button
                  onClick={() => setConfirmingReplace(true)}
                  className="text-sm px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 font-medium focus:outline-none disabled:opacity-50"
                  disabled={valid.length === 0}
                  title="Replace all current holdings with these"
                >
                  Replace all
                </button>
              ) : (
                <button
                  onClick={handleReplace}
                  className="text-sm px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 font-medium focus:outline-none"
                >
                  Yes, replace {holdings.length} existing holding{holdings.length === 1 ? '' : 's'}
                </button>
              )}
              <button
                onClick={handleAppend}
                disabled={valid.length === 0}
                className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium focus:outline-none disabled:opacity-50"
              >
                Append {valid.length} row{valid.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioImport;
