test('surfaces a disconnected status and message on stream error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { subscribe, handlersRef, auditAppender } =
      createControllableSubscriber();
    renderWithProviders(
      <TransactionFeed subscribe={subscribe} auditAppender={auditAppender} />,
    );

    act(() => {
      handlersRef.current?.onError(new Error('stream dropped'));
    });

    // Status badge only — avoids matching "Live feed disconnected..." body text
    const statusBadge = screen.getByRole('status');
    expect(statusBadge.textContent).toMatch(
      /Disconnected|transactionFeed\.statusError/i,
    );

    expect(
      screen.getByText(
        /Live feed disconnected\. A page refresh may be required to reconnect\.|transactionFeed\.error/i,
      ),
    ).toBeTruthy();

    expect(errorSpy).toHaveBeenCalledWith(
      'Transaction feed stream error',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
