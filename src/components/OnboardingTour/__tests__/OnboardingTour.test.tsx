import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OnboardingTour } from '../StateStateStateStateStateStateStateStateStateStateOnboardingTour';
import {
  buildTourSteps,
  hasTourBeenSeen,
  markTourSeen,
  TOUR_SEEN_KEY,
} from '../StateStateStateStateStateStateStateStateStateStateonboardingTour';

// ---------------------------------------------------------------------------
// Pure logic — buildTourSteps
// ---------------------------------------------------------------------------

describe('buildTourSteps', () => {
  const t = (key: string) => key;

  it('returns 5 steps', () => {
    expect(buildTourSteps(t)).toHaveLength(5);
  });

  it('first step has no attachTo (welcome modal)', () => {
    expect(buildTourSteps(t)[0].attachTo).toBeUndefined();
  });

  it('each subsequent step has an attachTo with element and on', () => {
    buildTourSteps(t).slice(1).forEach((step) => {
      expect(step.attachTo).toBeDefined();
      expect(step.attachTo!.element).toBeTruthy();
      expect(step.attachTo!.on).toBeTruthy();
    });
  });

  it('all steps have id, title, and text', () => {
    buildTourSteps(t).forEach((step) => {
      expect(step.id).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.text).toBeTruthy();
    });
  });

  it('step ids are unique', () => {
    const ids = buildTourSteps(t).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the provided t function for labels', () => {
    const steps = buildTourSteps((key) => `TRANSLATED:${key}`);
    steps.forEach((step) => {
      expect(step.title).toMatch(/^TRANSLATED:/);
    });
  });
});

// ---------------------------------------------------------------------------
// Pure logic — hasTourBeenSeen / markTourSeen
// ---------------------------------------------------------------------------

describe('hasTourBeenSeen / markTourSeen', () => {
  beforeEach(() => localStorage.clear());

  it('returns false when localStorage is empty', () => {
    expect(hasTourBeenSeen()).toBe(false);
  });

  it('returns true after markTourSeen', () => {
    markTourSeen();
    expect(hasTourBeenSeen()).toBe(true);
  });

  it('writes to the correct key', () => {
    markTourSeen();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Component — OnboardingTour
// ---------------------------------------------------------------------------

describe('OnboardingTour', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing (null)', () => {
    const { container } = render(<OnboardingTour autoStart />);
    expect(container.firstChild).toBeNull();
  });

  it('calls createTour with steps when autoStart is true', () => {
    const createTour = jest.fn();
    render(<OnboardingTour autoStart createTour={createTour} />);
    expect(createTour).toHaveBeenCalledTimes(1);
    const [steps] = (createTour as jest.Mock).mock.calls[0] as [unknown[], ...unknown[]];
    expect(Array.isArray(steps)).toBe(true);
    expect((steps as unknown[]).length).toBe(5);
  });

  it('does not call createTour when tour already seen and autoStart is false', () => {
    markTourSeen();
    const createTour = jest.fn();
    render(<OnboardingTour createTour={createTour} />);
    expect(createTour).not.toHaveBeenCalled();
  });

  it('calls createTour even when tour was seen if autoStart is true', () => {
    markTourSeen();
    const createTour = jest.fn();
    render(<OnboardingTour autoStart createTour={createTour} />);
    expect(createTour).toHaveBeenCalledTimes(1);
  });

  it('passes back/next/finish labels to createTour', () => {
    const createTour = jest.fn();
    render(<OnboardingTour autoStart createTour={createTour} />);
    const [, back, next, finish] = (createTour as jest.Mock).mock.calls[0] as string[];
    expect(back).toBe('Back');
    expect(next).toBe('Next');
    expect(finish).toBe('Finish');
  });
});
