import type Shepherd from 'shepherd.js';

export const TOUR_SEEN_KEY = 'vero_onboarding_seen';

export interface TourStep {
  id: string;
  attachTo?: { element: string; on: string };
  title: string;
  text: string;
}

export function buildTourSteps(t: (key: string) => string): TourStep[] {
  return [
    {
      id: 'welcome',
      title: t('tour.welcome.title'),
      text: t('tour.welcome.text'),
    },
    {
      id: 'connect-wallet',
      attachTo: { element: '[data-tour="connect-wallet"]', on: 'bottom' },
      title: t('tour.connectWallet.title'),
      text: t('tour.connectWallet.text'),
    },
    {
      id: 'pr-feed',
      attachTo: { element: '[data-tour="pr-feed"]', on: 'right' },
      title: t('tour.prFeed.title'),
      text: t('tour.prFeed.text'),
    },
    {
      id: 'transaction-feed',
      attachTo: { element: '[data-tour="transaction-feed"]', on: 'left' },
      title: t('tour.transactionFeed.title'),
      text: t('tour.transactionFeed.text'),
    },
    {
      id: 'gas-heatmap',
      attachTo: { element: '[data-tour="gas-heatmap"]', on: 'top' },
      title: t('tour.gasHeatmap.title'),
      text: t('tour.gasHeatmap.text'),
    },
  ];
}

export function hasTourBeenSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
  } catch {
    // ignore
  }
}

export function buildShepherdButtons(
  tour: Shepherd.Tour,
  isLast: boolean,
  t: (key: string) => string,
): Shepherd.Step.StepOptionsButton[] {
  const buttons: Shepherd.Step.StepOptionsButton[] = [];
  if (tour.getCurrentStep()?.id !== 'welcome') {
    buttons.push({ text: t('tour.back'), action: () => tour.back(), secondary: true });
  }
  buttons.push({
    text: isLast ? t('tour.finish') : t('tour.next'),
    action: isLast ? () => { markTourSeen(); tour.complete(); } : () => tour.next(),
  });
  return buttons;
}
