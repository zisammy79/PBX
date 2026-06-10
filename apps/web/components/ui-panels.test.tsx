import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog, OneTimeSecretPanel } from '@/components/ui-panels';

describe('OneTimeSecretPanel', () => {
  it('shows one-time warning and credential fields', () => {
    render(
      <OneTimeSecretPanel
        title="SIP credentials"
        fields={[
          { label: 'Username', value: 'ext_1001' },
          { label: 'Secret', value: 'secret-once' },
        ]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/shown once/i);
    expect(screen.getByLabelText('Secret')).toHaveValue('secret-once');
  });
});

describe('ConfirmDialog', () => {
  it('renders confirmation dialog when open', () => {
    render(
      <ConfirmDialog
        open
        title="Disable agent"
        message="This agent will stop accepting calls."
        confirmLabel="Disable"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Disable agent')).toBeInTheDocument();
  });

  it('calls onConfirm when confirmed', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Void invoice"
        message="Cannot be undone."
        confirmLabel="Void"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
