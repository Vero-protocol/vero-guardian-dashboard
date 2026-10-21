import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { resources, type SupportedLanguage } from '@/i18n/config';
import SessionTimer from '../SessionTimer';

const copy = [
  {
    language: 'en' as const,
    heading: 'Audit focus timer',
    description: 'One task. One focused session.',
    start: 'Start audit', resume: 'Resume audit', pause: 'Pause audit',
    restart: 'Start another audit', reset: 'Reset audit timer',
    idle: 'Ready for a focused audit', running: 'Focus session in progress',
    paused: 'Session paused', completed: 'Session complete \u2014 time recorded',
    progress: 'Audit session progress',
    remainingMany: '3 seconds remaining', remainingOne: '1 second remaining',
    recordedOne: '1 session recorded', recordedMany: '2 sessions recorded',
    totalOne: 'Total audit time: 00:03', totalMany: 'Total audit time: 00:06',
  },
  {
    language: 'es' as const,
    heading: 'Temporizador de concentraci\u00f3n para auditor\u00edas',
    description: 'Una tarea. Una sesi\u00f3n de concentraci\u00f3n.',
    start: 'Iniciar auditor\u00eda', resume: 'Reanudar auditor\u00eda', pause: 'Pausar auditor\u00eda',
    restart: 'Iniciar otra auditor\u00eda', reset: 'Reiniciar temporizador de auditor\u00eda',
    idle: 'Listo para una auditor\u00eda concentrada', running: 'Sesi\u00f3n de concentraci\u00f3n en curso',
    paused: 'Sesi\u00f3n en pausa', completed: 'Sesi\u00f3n completada: tiempo registrado',
    progress: 'Progreso de la sesi\u00f3n de auditor\u00eda',
    remainingMany: 'Quedan 3 segundos', remainingOne: 'Queda 1 segundo',
    recordedOne: '1 sesi\u00f3n registrada', recordedMany: '2 sesiones registradas',
    totalOne: 'Tiempo total de auditor\u00eda: 00:03', totalMany: 'Tiempo total de auditor\u00eda: 00:06',
  },
  {
    language: 'fr' as const,
    heading: 'Minuteur de concentration pour les audits',
    description: 'Une t\u00e2che. Une session de concentration.',
    start: 'D\u00e9marrer l\u2019audit', resume: 'Reprendre l\u2019audit', pause: 'Mettre l\u2019audit en pause',
    restart: 'D\u00e9marrer un autre audit', reset: 'R\u00e9initialiser le minuteur d\u2019audit',
    idle: 'Pr\u00eat pour un audit concentr\u00e9', running: 'Session de concentration en cours',
    paused: 'Session en pause', completed: 'Session termin\u00e9e : temps enregistr\u00e9',
    progress: 'Progression de la session d\u2019audit',
    remainingMany: '3 secondes restantes', remainingOne: '1 seconde restante',
    recordedOne: '1 session enregistr\u00e9e', recordedMany: '2 sessions enregistr\u00e9es',
    totalOne: 'Temps d\u2019audit total : 00:03', totalMany: 'Temps d\u2019audit total : 00:06',
  },
];

async function renderTimer(language: SupportedLanguage, onSessionComplete = jest.fn()) {
  // Use the actual dictionaries and translation hook, isolated from the global
  // app instance. A mocked t(key) could hide missing translations entirely.
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    resources, lng: language, fallbackLng: false, initAsync: false,
    interpolation: { escapeValue: false }, react: { useSuspense: false },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <SessionTimer durationSeconds={3} onSessionComplete={onSessionComplete} />
    </I18nextProvider>,
  );
  return i18n;
}

describe('SessionTimer translations (#159)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test.each(copy)('translates every state and accessible label in $language', async (labels) => {
    const complete = jest.fn();
    await renderTimer(labels.language, complete);
    expect(screen.getByRole('heading', { name: labels.heading })).toBeTruthy();
    expect(screen.getByText(labels.description)).toBeTruthy();
    expect(screen.getByText(labels.idle)).toBeTruthy();
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(labels.remainingMany);
    expect(screen.getByRole('progressbar', { name: labels.progress })).toBeTruthy();
    expect(screen.getByRole('button', { name: labels.reset }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: labels.start }));
    expect(screen.getByText(labels.running)).toBeTruthy();
    act(() => jest.advanceTimersByTime(2_000));
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(labels.remainingOne);
    fireEvent.click(screen.getByRole('button', { name: labels.pause }));
    expect(screen.getByText(labels.paused)).toBeTruthy();
    act(() => jest.advanceTimersByTime(2_000));
    expect(screen.getByRole('timer').textContent).toBe('00:01');
    fireEvent.click(screen.getByRole('button', { name: labels.resume }));
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByText(labels.completed)).toBeTruthy();
    expect(screen.getByText(labels.recordedOne)).toBeTruthy();
    expect(screen.getByText(labels.totalOne)).toBeTruthy();
    expect(complete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: labels.restart }));
    act(() => jest.advanceTimersByTime(3_000));
    expect(screen.getByText(labels.recordedMany)).toBeTruthy();
    expect(screen.getByText(labels.totalMany)).toBeTruthy();
    expect(complete).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: labels.reset }));
    expect(screen.getByText(labels.idle)).toBeTruthy();
    expect(screen.getByText(labels.recordedMany)).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('00:03');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  test('changes language live without restarting a running or paused session', async () => {
    const [en, es, fr] = copy;
    const complete = jest.fn();
    const i18n = await renderTimer('en', complete);
    fireEvent.click(screen.getByRole('button', { name: en.start }));
    act(() => jest.advanceTimersByTime(2_000));
    await act(async () => { await i18n.changeLanguage('es'); });
    expect(screen.getByRole('timer').textContent).toBe('00:01');
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(es.remainingOne);
    expect(screen.getByText(es.running)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: es.pause }));
    await act(async () => { await i18n.changeLanguage('fr'); });
    act(() => jest.advanceTimersByTime(5_000));
    expect(screen.getByText(fr.paused)).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('00:01');
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: fr.resume }));
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByText(fr.recordedOne)).toBeTruthy();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText(en.completed)).toBeTruthy();
    expect(screen.getByText(en.recordedOne)).toBeTruthy();
    expect(screen.getByText(en.totalOne)).toBeTruthy();
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
