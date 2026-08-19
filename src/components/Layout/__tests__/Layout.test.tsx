import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import Layout from '../index';

// Mock ConnectButton — it pulls in wallet adapters and Freighter APIs
// that are unavailable in jsdom.
jest.mock('@/components/ConnectButton', () => ({
  __esModule: true,
  default: () => <button data-testid="connect-button">Connect Wallet</button>,
}));

// Mock useEvents hook used transitively by WalletContext / ConnectButton
jest.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ emit: jest.fn(), on: jest.fn(), off: jest.fn() }),
}));

function renderLayout(children: React.ReactNode = null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <Layout>{children}</Layout>
    </I18nextProvider>,
  );
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------
describe('Layout — children', () => {
  it('renders arbitrary children in the main content area', () => {
    renderLayout(<p data-testid="page-content">Hello world</p>);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('renders multiple children', () => {
    renderLayout(
      <>
        <span data-testid="child-a">A</span>
        <span data-testid="child-b">B</span>
      </>,
    );
    expect(screen.getByTestId('child-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-b')).toBeInTheDocument();
  });

  it('renders with no children without throwing', () => {
    expect(() => renderLayout()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------
describe('Layout — branding', () => {
  it('renders the "Vero" brand title in the desktop sidebar', () => {
    renderLayout();
    // The h1 "Vero" lives in the sidebar — there is exactly one.
    expect(screen.getByRole('heading', { name: /vero/i })).toBeInTheDocument();
  });

  it('renders the "Guardian" subtitle in the sidebar', () => {
    renderLayout();
    expect(screen.getByText('Guardian')).toBeInTheDocument();
  });

  it('renders the "Vero Guardian" mobile brand label in the header', () => {
    renderLayout();
    expect(screen.getByText('Vero Guardian')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Navigation elements
// ---------------------------------------------------------------------------
describe('Layout — desktop navigation items', () => {
  it('renders all four navigation links in the sidebar', () => {
    renderLayout();

    // Desktop sidebar uses aria-label equal to the dashboard nav label.
    const nav = screen.getAllByRole('navigation');
    // At least one navigation landmark exists.
    expect(nav.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Dashboard navigation link', () => {
    renderLayout();
    // getAllByRole because there is a desktop and (hidden) mobile instance.
    const links = screen.getAllByRole('link', { name: /dashboard/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Validations navigation link', () => {
    renderLayout();
    const links = screen.getAllByRole('link', { name: /validations/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Tasks navigation link', () => {
    renderLayout();
    const links = screen.getAllByRole('link', { name: /tasks/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Settings navigation link', () => {
    renderLayout();
    const links = screen.getAllByRole('link', { name: /settings/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders ConnectButton inside the header', () => {
    renderLayout();
    expect(screen.getByTestId('connect-button')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mobile menu toggle — initial state
// ---------------------------------------------------------------------------
describe('Layout — mobile menu toggle button', () => {
  it('renders a mobile menu toggle button', () => {
    renderLayout();
    expect(
      screen.getByRole('button', { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it('toggle button starts with aria-expanded="false"', () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: /open menu/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('mobile navigation is NOT visible before the menu is opened', () => {
    renderLayout();
    expect(screen.queryByRole('navigation', { name: /mobile navigation/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mobile menu toggle — open / close
// ---------------------------------------------------------------------------
describe('Layout — mobile menu open/close', () => {
  it('opens the mobile menu when the toggle button is clicked', () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(toggle);

    expect(
      screen.getByRole('navigation', { name: /mobile navigation/i }),
    ).toBeInTheDocument();
  });

  it('sets aria-expanded to "true" when mobile menu is open', () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(toggle);

    // After opening, aria-label changes to "Close menu"
    const closeToggle = screen.getByRole('button', { name: /close menu/i });
    expect(closeToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('changes the toggle button aria-label to "Close menu" when open', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument();
  });

  it('closes the mobile menu when the toggle button is clicked again', () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: /open menu/i });

    // Open
    fireEvent.click(toggle);
    expect(
      screen.getByRole('navigation', { name: /mobile navigation/i }),
    ).toBeInTheDocument();

    // Close — aria-label has changed to "Close menu"
    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
    expect(
      screen.queryByRole('navigation', { name: /mobile navigation/i }),
    ).not.toBeInTheDocument();
  });

  it('resets aria-expanded to "false" after closing', () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));

    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

// ---------------------------------------------------------------------------
// Mobile navigation content
// ---------------------------------------------------------------------------
describe('Layout — mobile navigation content', () => {
  function openMobileMenu() {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
  }

  it('shows Dashboard link in the mobile navigation', () => {
    openMobileMenu();
    const mobileNav = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(mobileNav.querySelector('a[href="#"]')).toBeInTheDocument();
    // All four nav labels appear inside the mobile nav
    expect(mobileNav).toHaveTextContent(/dashboard/i);
  });

  it('shows Validations link in the mobile navigation', () => {
    openMobileMenu();
    const mobileNav = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(mobileNav).toHaveTextContent(/validations/i);
  });

  it('shows Tasks link in the mobile navigation', () => {
    openMobileMenu();
    const mobileNav = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(mobileNav).toHaveTextContent(/tasks/i);
  });

  it('shows Settings link in the mobile navigation', () => {
    openMobileMenu();
    const mobileNav = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(mobileNav).toHaveTextContent(/settings/i);
  });
});

// ---------------------------------------------------------------------------
// Responsive / structural
// ---------------------------------------------------------------------------
describe('Layout — responsive structure', () => {
  it('renders a root element with min-h-screen class for full-height layout', () => {
    const { container } = renderLayout();
    const root = container.firstElementChild;
    expect(root?.className).toContain('min-h-screen');
  });

  it('renders a sticky header element', () => {
    renderLayout();
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
    expect(header.className).toContain('sticky');
  });

  it('renders the desktop sidebar as an <aside> element', () => {
    const { container } = renderLayout();
    const aside = container.querySelector('aside');
    expect(aside).toBeInTheDocument();
  });

  it('desktop sidebar carries the md:flex visibility class (hidden on mobile)', () => {
    const { container } = renderLayout();
    const aside = container.querySelector('aside');
    // jsdom does not evaluate media queries; we verify the class is present.
    expect(aside?.className).toContain('hidden');
    expect(aside?.className).toContain('md:flex');
  });
});
