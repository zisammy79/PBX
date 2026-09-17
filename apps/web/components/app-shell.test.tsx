import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBanner } from '@/components/app-shell';

describe('StatusBanner', () => {
  it('shows demo AI deterministic mode', () => {
    render(<StatusBanner demoAi />);
    expect(screen.getByText('Demo AI mode')).toBeInTheDocument();
  });

  it('shows external AI verification not tested', () => {
    render(<StatusBanner externalAi />);
    expect(screen.getByText('External AI not verified')).toBeInTheDocument();
  });

  it('shows stripe disabled', () => {
    render(<StatusBanner stripe />);
    expect(screen.getByText('Payments disabled')).toBeInTheDocument();
  });

  it('shows provider cost unavailable', () => {
    render(<StatusBanner providerCost />);
    expect(screen.getByText(/Provider cost unavailable/i)).toBeInTheDocument();
  });

  it('shows PSTN verification not performed', () => {
    render(<StatusBanner pstn />);
    expect(screen.getByText('PSTN not verified')).toBeInTheDocument();
  });
});
