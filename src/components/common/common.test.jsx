import { render, screen } from '@testing-library/react';
import PriceChange from './PriceChange';
import StatCard from './StatCard';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';

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
