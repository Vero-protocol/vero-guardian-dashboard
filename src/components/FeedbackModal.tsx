'use client';

import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';

// Keep API values stable; only the visible labels are translated.
const ratings = ['Excellent', 'Good', 'Needs work'] as const;
const ratingKeys = { Excellent: 'excellent', Good: 'good', 'Needs work': 'needsWork' } as const;
const feedbackErrorKeys = new Map([
  ['Feedback message is required.', 'required'],
  ['Enter a valid email address.', 'email'],
  ['Feedback submission failed.', 'submission'],
  ['Invalid feedback payload.', 'payload'],
]);

function sanitizeInput(value: string): string {
  // Re-apply until the string stops changing so nested/overlapping tags
  // (e.g. "<<script>script>") can't survive a single pass.
  let previous: string;
  let sanitized = value;
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  } while (sanitized !== previous);
  return sanitized.trim();
}

export default function FeedbackModal(): ReactElement {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState<string>(ratings[1]);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<SubmissionState>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setError('');

    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sanitizeInput(name),
        email: sanitizeInput(email),
        rating,
        message: sanitizeInput(message),
        page: window.location.pathname,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      // Store a key, not translated text, so an existing error changes language too.
      setError(feedbackErrorKeys.get(payload?.error) ?? 'send');
      setStatus('error');
      return;
    }

    setStatus('success');
    setName('');
    setEmail('');
    setRating(ratings[1]);
    setMessage('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setStatus('idle');
          setError('');
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        aria-label={t('feedback.open')}
        title={t('feedback.open')}
      >
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="feedback-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t('feedback.heading')}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {t('feedback.description')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label={t('feedback.close')}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {status === 'success' ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                {t('feedback.success')}
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t('feedback.name')}
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={80}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      placeholder={t('feedback.optional')}
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t('feedback.email')}
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      maxLength={120}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      placeholder={t('feedback.optional')}
                    />
                  </label>
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t('feedback.experience')}
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {ratings.map((option) => (
                      <label
                        key={option}
                        className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-slate-300 px-2 text-center text-sm text-slate-700 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-700 dark:border-slate-700 dark:text-slate-200 dark:has-[:checked]:bg-indigo-950"
                      >
                        <input
                          type="radio"
                          name="feedback-rating"
                          value={option}
                          checked={rating === option}
                          onChange={(event) => setRating(event.target.value)}
                          className="sr-only"
                        />
                        {t(`feedback.ratings.${ratingKeys[option]}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t('feedback.message')}
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    required
                    maxLength={1200}
                    rows={5}
                    className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    placeholder={t('feedback.placeholder')}
                  />
                </label>

                {status === 'error' ? (
                  <p className="text-sm text-red-700 dark:text-red-300" role="alert">
                    {t(`feedback.errors.${error}`)}
                  </p>
                ) : null}

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    {t('feedback.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-900"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {status === 'submitting' ? t('feedback.sending') : t('feedback.submit')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
