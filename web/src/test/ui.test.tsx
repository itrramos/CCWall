import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Pagination } from '../components/ui';
import { formatBytes } from '../api';

describe('Pagination', () => {
  it('hides itself for a single page', () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={5} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('navigates between pages and disables edge buttons', () => {
    const onPage = vi.fn();
    render(<Pagination page={1} pageSize={10} total={35} onPage={onPage} />);
    expect(screen.getByText('Page 1 of 4 (35 items)')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeDisabled();
    fireEvent.click(screen.getByText('Next'));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe('ConfirmDialog', () => {
  it('requires explicit confirmation and supports cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Delete slide"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('formatBytes', () => {
  it('formats sizes at sensible precision', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
  });
});
