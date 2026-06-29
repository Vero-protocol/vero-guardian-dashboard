'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { buildTourSteps, hasTourBeenSeen, markTourSeen } from './StateStateStateStateStateonboardingTour';

interface OnboardingTourProps {
  /** Force the tour to start regardless of localStorage flag (for testing/demo). */
  autoStart?: boolean;
  /** Inject a tour factory — used in tests to avoid loading Shepherd in jsdom. */
  createTour?: (steps: ReturnType<typeof buildTourSteps>, back: string, next: string, finish: string) => void;
}

export function OnboardingTour({ autoStart = false, createTour }: OnboardingTourProps) {
  const { t } = useTranslation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!autoStart && hasTourBeenSeen()) return;
    started.current = true;

    const steps = buildTourSteps(t);

    if (createTour) {
      createTour(steps, t('tour.back'), t('tour.next'), t('tour.finish'));
      return;
    }

    // Lazy-load Shepherd only in browser
    if (typeof window === 'undefined') return;

    import('shepherd.js').then(({ default: Shepherd }) => {
      const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
          scrollTo: { behavior: 'smooth', block: 'center' },
          cancelIcon: { enabled: true },
          classes: 'shepherd-theme-arrows',
        },
      });

      steps.forEach((step, index) => {
        const isLast = index === steps.length - 1;
        const buttons: Shepherd.Step.StepOptionsButton[] = [];

        if (index > 0) {
          buttons.push({ text: t('tour.back'), action: () => tour.back(), secondary: true });
        }
        buttons.push({
          text: isLast ? t('tour.finish') : t('tour.next'),
          action: () => {
            if (isLast) { markTourSeen(); tour.complete(); }
            else { tour.next(); }
          },
        });

        tour.addStep({
          id: step.id,
          title: step.title,
          text: step.text,
          ...(step.attachTo ? { attachTo: step.attachTo } : {}),
          buttons,
        });
      });

      tour.on('complete', markTourSeen);
      tour.on('cancel', markTourSeen);
      tour.start();
    }).catch(() => {/* ignore in unsupported envs */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return null;
}

export default OnboardingTour;
