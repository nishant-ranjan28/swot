import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import PriceChange from './PriceChange';
import StatCard from './StatCard';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';
import RangeBar from './RangeBar';
import SortableTableHead from './SortableTableHead';
import { Table, TableHeader, TableRow } from '@/components/ui/table';

test('PriceChange positive shows + and gain color', () => {
  render(<PriceChange value={12.5} percent={1.63} />);
  const el = screen.getByText(/\+12\.50/);
  expect(el.closest('[data-trend]')).toHaveAttribute('data-trend', 'up');
  expect(el.closest('[data-trend]')).toHaveClass('text-gain');
  expect(screen.getByText(/\(\+1\.63%\)/)).toBeInTheDocument();
});

test('PriceChange negative percent-only', () => {
  render(<PriceChange percent={-0.5} />);
  const el = screen.getByText('-0.50%');
  expect(el.closest('[data-trend]')).toHaveClass('text-loss');
});

test('PriceChange never shows -0.00', () => {
  render(<PriceChange percent={-0.001} />);
  expect(screen.getByText('0.00%')).toBeInTheDocument();
});

test('PriceChange handles null', () => {
  render(<PriceChange percent={null} />);
  expect(screen.getByText('—')).toBeInTheDocument();
});

test('StatCard renders label, value and change', () => {
  render(<StatCard label="NIFTY 50" value="24,300.10" change={{ value: -50.2, percent: -0.21 }} />);
  expect(screen.getByText('NIFTY 50')).toBeInTheDocument();
  expect(screen.getByText('24,300.10')).toBeInTheDocument();
  expect(screen.getByText(/-0\.21%/)).toBeInTheDocument();
});

test('PageHeader renders h1 and actions', () => {
  render(<PageHeader title="Screener" description="Find stocks" actions={<button>Export</button>} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Screener' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
});

test('EmptyState shows title', () => {
  render(<EmptyState title="No stocks yet" description="Add some" />);
  expect(screen.getByText('No stocks yet')).toBeInTheDocument();
});

test('RangeBar positions marker and clamps', () => {
  const { rerender } = render(<RangeBar low={100} high={200} value={150} />);
  expect(screen.getByTestId('range-marker').style.left).toBe('calc(50% - 5px)');
  rerender(<RangeBar low={100} high={200} value={250} />);
  expect(screen.getByTestId('range-marker').style.left).toBe('calc(100% - 5px)');
});

test('RangeBar renders nothing for a zero span', () => {
  const { container } = render(<RangeBar low={100} high={100} value={100} />);
  expect(container).toBeEmptyDOMElement();
});

test.each([
  ['low', { low: 0, high: 200, value: 150 }],
  ['high null', { low: 100, high: null, value: 150 }],
  ['value undefined', { low: 100, high: 200, value: undefined }],
  ['value 0', { low: 100, high: 200, value: 0 }],
])('RangeBar renders nothing for falsy %s', (_, props) => {
  const { container } = render(<RangeBar {...props} />);
  expect(container).toBeEmptyDOMElement();
});

test('RangeBar renders centered label above the track', () => {
  render(<RangeBar low={100} high={200} value={150} lowLabel="100" highLabel="200" label="52W Range" />);
  const label = screen.getByText('52W Range');
  const track = screen.getByTestId('range-track');
  // label row precedes the track in document order
  expect(label.compareDocumentPosition(track) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const row = label.parentElement;
  expect([...row.children].map(c => c.textContent)).toEqual(['100', '52W Range', '200']);
});

test('RangeBar tone changes track and marker styling', () => {
  const { rerender } = render(<RangeBar low={100} high={200} value={150} />);
  expect(screen.getByTestId('range-track')).toHaveClass('bg-muted');
  expect(screen.getByTestId('range-marker')).toHaveClass('bg-foreground');
  rerender(<RangeBar low={100} high={200} value={150} tone="gain" />);
  expect(screen.getByTestId('range-track')).toHaveClass('from-warning', 'to-gain');
  expect(screen.getByTestId('range-marker')).toHaveClass('border-gain');
  rerender(<RangeBar low={100} high={200} value={150} tone="loss" />);
  expect(screen.getByTestId('range-track')).toHaveClass('from-loss', 'to-warning');
  expect(screen.getByTestId('range-marker')).toHaveClass('border-loss');
});

test('SortableTableHead exposes aria-sort and calls onSort', () => {
  const onSort = vi.fn();
  render(
    <Table><TableHeader><TableRow>
      <SortableTableHead active dir="asc" onSort={onSort}>Price</SortableTableHead>
      <SortableTableHead active={false} dir="asc" onSort={onSort}>P/E</SortableTableHead>
    </TableRow></TableHeader></Table>,
  );
  expect(screen.getByRole('columnheader', { name: /price/i })).toHaveAttribute('aria-sort', 'ascending');
  expect(screen.getByRole('columnheader', { name: /p\/e/i })).toHaveAttribute('aria-sort', 'none');
  fireEvent.click(screen.getByRole('button', { name: /p\/e/i }));
  expect(onSort).toHaveBeenCalledTimes(1);
});
