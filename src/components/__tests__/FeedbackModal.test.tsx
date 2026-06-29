import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FeedbackModal from '../StateStateStateStateStateStateStateStateStateStateFeedbackModal';

describe('FeedbackModal', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true }),
    }) as jest.Mock;
  });

  test('submits sanitized feedback to the feedback API', async () => {
    render(<FeedbackModal />);

    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: '<b>Ada</b>' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/what should be improved/i), {
      target: { value: '<script>alert(1)</script>Navigation was unclear.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/feedback', expect.any(Object)));

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual(
      expect.objectContaining({
        name: 'Ada',
        email: 'ada@example.com',
        message: 'alert(1)Navigation was unclear.',
        rating: 'Good',
      }),
    );
    expect(await screen.findByText(/feedback submitted/i)).toBeInTheDocument();
  });
});
