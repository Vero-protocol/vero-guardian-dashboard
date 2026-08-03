import { fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from '../ThemeToggle';
import { ThemeProvider } from '@/context/ThemeContext';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>{ui}</ThemeProvider>
    </I18nextProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    // Ensure matchMedia is available in jsdom
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  test('renders a button', () => {
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('persists theme to localStorage when clicked', () => {
    renderWithProviders(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    const saved = localStorage.getItem('vero.guardian.theme');
    expect(['light', 'dark', 'system']).toContain(saved);
  });

  test('cycles through light → dark → system on successive clicks', () => {
    renderWithProviders(<ThemeToggle />);
    const button = screen.getByRole('button');

    // Default state is 'system', so first click → 'light'
    fireEvent.click(button);
    expect(localStorage.getItem('vero.guardian.theme')).toBe('light');

    fireEvent.click(button);
    expect(localStorage.getItem('vero.guardian.theme')).toBe('dark');

    fireEvent.click(button);
    expect(localStorage.getItem('vero.guardian.theme')).toBe('system');
  });

  test('restores theme from localStorage on mount', () => {
    localStorage.setItem('vero.guardian.theme', 'dark');
    renderWithProviders(<ThemeToggle />);
    // After mount the dark class should be applied to <html>
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
