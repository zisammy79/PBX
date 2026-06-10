import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBanner } from '@/components/app-shell';

describe('StatusBanner', () => {
  it('shows demo AI deterministic mode', () => {
    render(<StatusBanner demoAi />);
    expect(screen.getByText('Demo AI mode — deterministic local provider')).toBeInTheDocument();
  });

  it('shows external AI verification not tested', () => {
    render(<StatusBanner externalAi />);
    expect(screen.getByText('External AI verification — Not tested')).toBeInTheDocument();
  });

  it('shows stripe disabled', () => {
    render(<StatusBanner stripe />);
    expect(screen.getByText('Payment integration — Disabled')).toBeInTheDocument();
  });

  it('shows provider cost unavailable', () => {
    render(<StatusBanner providerCost />);
    expect(screen.getByText(/Provider cost — Unavailable/i)).toBeInTheDocument();
  });

  it('shows PSTN verification not performed', () => {
    render(<StatusBanner pstn />);
    expect(screen.getByText('PSTN verification — Not performed')).toBeInTheDocument();
  });
});
