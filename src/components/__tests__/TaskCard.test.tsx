import { act, fireEvent, render, screen } from '@testing-library/react';

import TaskCard, { matchesFilter, type TaskCardTask } from '@/components/TaskCard';
import { resetChainStateForTests } from '@/hooks/useChainState';
import { ToastProvider } from '@/components/Toast';

let _searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => _searchParams,
  useRouter: () => ({
    replace: (url: string) => {
      const qs = url.includes('?') ? url.split('?')[1] : '';
      _searchParams = new URLSearchParams(qs);
    },
  }),
  usePathname: () => '/',
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

function createTask(overrides: Partial<TaskCardTask> = {}): TaskCardTask {
  return {
    id: 'task-1',
    title: 'Review validator evidence',
    status: 'pending',
    is_done: false,
    reward: '25 VERO',
    priority: 'high',
    votes: 0,
    ...overrides,
  };
}

describe('matchesFilter', () => {
  it('returns true when both filters are "all"', () => {
    const task = createTask();
    expect(matchesFilter(task, 'all', 'all')).toBe(true);
  });

  it('filters by status', () => {
    const task = createTask({ status: 'completed', is_done: true });
    expect(matchesFilter(task, 'completed', 'all')).toBe(true);
    expect(matchesFilter(task, 'pending', 'all')).toBe(false);
  });

  it('filters by priority', () => {
    const task = createTask({ priority: 'high' });
    expect(matchesFilter(task, 'all', 'high')).toBe(true);
    expect(matchesFilter(task, 'all', 'low')).toBe(false);
  });

  it('combines status and priority filters', () => {
    const task = createTask({ status: 'pending', is_done: false, priority: 'high' });
    expect(matchesFilter(task, 'pending', 'high')).toBe(true);
    expect(matchesFilter(task, 'pending', 'low')).toBe(false);
    expect(matchesFilter(task, 'completed', 'high')).toBe(false);
  });

  it('resolves is_done as completed', () => {
    const task = createTask({ status: 'pending', is_done: true });
    expect(matchesFilter(task, 'completed', 'all')).toBe(true);
    expect(matchesFilter(task, 'pending', 'all')).toBe(false);
  });
});

describe('TaskCard', () => {
  afterEach(() => {
    act(() => resetChainStateForTests());
  });

  beforeEach(() => {
    _searchParams = new URLSearchParams();
  });

  it('renders a pending task title and action button from payload data', () => {
    render(<TaskCard tasks={[createTask()]} />, { wrapper: Wrapper });

    expect(screen.getByText('Review validator evidence')).toBeInTheDocument();
    expect(screen.getByText('25 VERO')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /verify quality for review validator evidence/i }),
    ).toBeInTheDocument();
  });

  it('shows the vote count', () => {
    render(<TaskCard tasks={[createTask({ votes: 5 })]} />, { wrapper: Wrapper });

    expect(screen.getByText('5 votes')).toBeInTheDocument();
  });

  it('hides the action button when the task is done', () => {
    render(
      <TaskCard
        tasks={[
          createTask({
            status: 'pending',
            is_done: true,
            title: 'Completed validator review',
          }),
        ]}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Completed validator review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument();
  });

  it('applies optimistic status and increments vote count on click, then resolves', async () => {
    const fastSubmit = () => Promise.resolve({ status: 'success', txHash: '0xabc123' });

    render(<TaskCard tasks={[createTask({ votes: 2 })]} submitVote={fastSubmit} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('2 votes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /verify quality/i }));

    expect(screen.getByText('Verifying…')).toBeInTheDocument();
    expect(screen.getByText('3 votes')).toBeInTheDocument();

    await act(async () => {});
    expect(screen.getByText('3 votes')).toBeInTheDocument();
    expect(screen.queryByText('Verifying…')).not.toBeInTheDocument();
  });

  it('promotes pending to in-progress optimistically', async () => {
    const fastSubmit = () => Promise.resolve({ status: 'success', txHash: '0xabc' });

    render(
      <TaskCard
        tasks={[createTask({ status: 'pending', votes: 0 })]}
        submitVote={fastSubmit}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText(/status:/i)).toHaveTextContent(/pending/i);

    fireEvent.click(screen.getByRole('button', { name: /verify quality/i }));

    expect(screen.getByText(/status:/i)).toHaveTextContent(/in progress/i);

    await act(async () => {});
    expect(screen.getByText(/status:/i)).toHaveTextContent(/in progress/i);
  });

  it('reverts optimistic changes and shows error toast on failure', async () => {
    const failSubmit = () => Promise.reject(new Error('consensus timeout'));

    render(
      <TaskCard
        tasks={[createTask({ status: 'pending', votes: 2 })]}
        submitVote={failSubmit}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('2 votes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /verify quality/i }));

    expect(screen.getByText('3 votes')).toBeInTheDocument();

    await act(async () => {});

    expect(screen.getByText('2 votes')).toBeInTheDocument();
    expect(screen.getByText(/status:/i)).toHaveTextContent(/pending/i);
    expect(screen.getByRole('button', { name: /verify quality/i })).toBeInTheDocument();
    expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
  });

  it('sorts completed tasks to the bottom', () => {
    const tasks: TaskCardTask[] = [
      createTask({
        id: 'a',
        title: 'Alpha pending',
        status: 'pending',
        is_done: false,
      }),
      createTask({
        id: 'b',
        title: 'Bravo completed',
        status: 'completed',
        is_done: true,
      }),
      createTask({
        id: 'c',
        title: 'Charlie in-progress',
        status: 'in-progress',
        is_done: false,
      }),
    ];

    render(<TaskCard tasks={tasks} />, { wrapper: Wrapper });

    const cards = screen.getAllByText(/Alpha|Bravo|Charlie/);
    expect(cards[0]).toHaveTextContent('Charlie');
    expect(cards[1]).toHaveTextContent('Alpha');
    expect(cards[2]).toHaveTextContent('Bravo');
  });

  it('renders filter controls', () => {
    render(<TaskCard tasks={[]} />, { wrapper: Wrapper });

    expect(screen.getByRole('group', { name: /filter tasks by status/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /filter tasks by priority/i })).toBeInTheDocument();
  });

  it('applies URL search param filters on render', () => {
    _searchParams = new URLSearchParams('status=completed');

    const tasks = [
      createTask({ id: '1', title: 'Pending task', status: 'pending', is_done: false }),
      createTask({ id: '2', title: 'Completed task', status: 'completed', is_done: true }),
    ];
    const { rerender } = render(<TaskCard tasks={tasks} />, { wrapper: Wrapper });

    expect(screen.queryByText('Pending task')).not.toBeInTheDocument();
    expect(screen.getByText('Completed task')).toBeInTheDocument();

    _searchParams = new URLSearchParams();
    rerender(<TaskCard tasks={tasks} />);
    expect(screen.getByText('Pending task')).toBeInTheDocument();
  });

  it('shows no results message when filters match nothing', () => {
    _searchParams = new URLSearchParams('status=completed');

    render(
      <TaskCard
        tasks={[createTask({ id: '1', title: 'Only pending task', status: 'pending', is_done: false })]}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText(/no tasks match/i)).toBeInTheDocument();
  });

  it('shows clear filters link when filter is active', () => {
    _searchParams = new URLSearchParams('status=completed');

    render(<TaskCard tasks={[createTask()]} />, { wrapper: Wrapper });

    expect(screen.getByText(/clear filters/i)).toBeInTheDocument();
  });

  it('clears filters via router replace when clear is clicked', () => {
    _searchParams = new URLSearchParams('status=completed');

    render(<TaskCard tasks={[createTask({ id: '1', title: 'A task' })]} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText(/clear filters/i));
    expect(_searchParams.toString()).toBe('');
  });
});
