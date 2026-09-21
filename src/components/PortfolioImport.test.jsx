import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import PortfolioImport from './PortfolioImport';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));

const renderImport = (props = {}) => {
  const onClose = vi.fn();
  render(
    <PortfolioImport open onClose={onClose} market="in" holdings={[]} onImport={vi.fn()} {...props} />,
  );
  return { onClose };
};

test('renders a dialog named by its title', () => {
  renderImport();
  expect(screen.getByRole('dialog', { name: 'Import Portfolio CSV' })).toBeInTheDocument();
  expect(screen.getByText(/Indian/)).toBeInTheDocument();
});

test('Escape calls onClose', () => {
  const { onClose } = renderImport();
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

test('renders nothing when closed', () => {
  renderImport({ open: false });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('moves focus inside the dialog when opened', () => {
  renderImport();
  expect(screen.getByRole('dialog')).toContainElement(document.activeElement);
});
