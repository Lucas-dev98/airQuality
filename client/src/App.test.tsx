import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('renders main title', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /condições climáticas atuais/i })).toBeInTheDocument();
  });

  it('renders primary action button', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /obter clima/i })).toBeInTheDocument();
  });

  it('switches ui language', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText(/idioma/i), 'en');

    expect(screen.getByRole('button', { name: /get weather/i })).toBeInTheDocument();
  });
});
