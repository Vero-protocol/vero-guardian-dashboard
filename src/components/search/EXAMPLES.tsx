/**
 * Global On-Chain State Search - Example Usage
 * Demonstrates integration with the dashboard
 */

import { GlobalSearchPanel } from './StateStateStateStateStateGlobalSearchPanel';
import type { ContractMetadata, RankedSearchResult } from './StateStateStateStateStatetypes';

/**
 * Example 1: Basic search panel with predefined contracts
 */
export function BasicSearchExample() {
  const exampleContracts: ContractMetadata[] = [
    {
      id: 'task-registry',
      address: 'CBXYZ123456789',
      name: 'Task Registry',
      description: 'Manages GitHub PR tasks and wave contributions',
      type: 'task',
      tags: ['registry', 'github', 'tasks', 'wave'],
      functions: [
        {
          id: 'register',
          name: 'registerTask',
          description: 'Register a new task from merged GitHub PR',
          params: ['prId', 'title', 'description'],
          returns: 'taskId',
          tags: ['write', 'transaction'],
        },
        {
          id: 'get-task',
          name: 'getTask',
          description: 'Retrieve task details by ID',
          params: ['taskId'],
          returns: 'TaskData',
          tags: ['read', 'query'],
        },
        {
          id: 'list-tasks',
          name: 'listTasks',
          description: 'List all active tasks',
          params: ['limit', 'offset'],
          returns: 'TaskData[]',
          tags: ['read', 'query', 'paginated'],
        },
      ],
    },
    {
      id: 'vote-ledger',
      address: 'CBVOTE123456789',
      name: 'Vote Ledger',
      description: 'Stores guardian approval signals and vote records',
      type: 'vote',
      tags: ['vote', 'governance', 'approval', 'freighter'],
      functions: [
        {
          id: 'cast-vote',
          name: 'castVote',
          description: 'Submit guardian approval vote on task',
          params: ['taskId', 'decision', 'comment'],
          returns: 'voteId',
          tags: ['write', 'transaction', 'freighter'],
        },
        {
          id: 'get-votes',
          name: 'getVotes',
          description: 'Get all votes for a specific task',
          params: ['taskId'],
          returns: 'Vote[]',
          tags: ['read', 'query'],
        },
        {
          id: 'consensus',
          name: 'getConsensus',
          description: 'Calculate consensus on task approval',
          params: ['taskId'],
          returns: 'ConsensusResult',
          tags: ['read', 'query', 'analytics'],
        },
      ],
    },
    {
      id: 'reputation',
      address: 'CBREP123456789',
      name: 'Guardian Reputation',
      description: 'On-chain trust scores for all guardians',
      type: 'reputation',
      tags: ['reputation', 'score', 'trust', 'horizon'],
      deployedAt: 1656691200000,
      network: 'Stellar Testnet',
      functions: [
        {
          id: 'get-reputation',
          name: 'getReputation',
          description: 'Get reputation score for a guardian',
          params: ['walletAddress'],
          returns: 'ReputationScore',
          tags: ['read', 'query', 'account-data'],
        },
        {
          id: 'update-reputation',
          name: 'updateReputation',
          description: 'Update guardian reputation based on votes',
          params: ['walletAddress', 'delta'],
          returns: 'boolean',
          tags: ['write', 'internal', 'governance'],
        },
      ],
    },
    {
      id: 'role-authority',
      address: 'CBROLE123456789',
      name: 'Role Authority',
      description: 'Access control and permission management',
      type: 'governance',
      tags: ['role', 'access-control', 'governance', 'admin'],
      functions: [
        {
          id: 'check-role',
          name: 'checkRole',
          description: 'Check if wallet has specific role',
          params: ['walletAddress', 'role'],
          returns: 'boolean',
          tags: ['read', 'query'],
        },
        {
          id: 'assign-role',
          name: 'assignRole',
          description: 'Assign role to guardian wallet',
          params: ['walletAddress', 'role'],
          returns: 'boolean',
          tags: ['write', 'admin'],
        },
        {
          id: 'revoke-role',
          name: 'revokeRole',
          description: 'Revoke role from guardian wallet',
          params: ['walletAddress', 'role'],
          returns: 'boolean',
          tags: ['write', 'admin'],
        },
      ],
    },
  ];

  const handleResultClick = (result: RankedSearchResult) => {
    console.log('Selected result:', result);
    if (result.function) {
      console.log(`Viewing function: ${result.function.name} in ${result.contract.name}`);
    } else {
      console.log(`Viewing contract: ${result.contract.name}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">On-Chain State Search</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Search across deployed contracts and their functions
        </p>
      </div>

      <GlobalSearchPanel
        contracts={exampleContracts}
        onResultClick={handleResultClick}
        showFilters={true}
        showStats={true}
        maxResults={10}
        minScore={20}
        debounceMs={300}
        placeholder="Search contracts, functions, or keywords..."
      />
    </div>
  );
}

/**
 * Example 2: Advanced usage with custom search handling
 */
export function AdvancedSearchExample() {
  const [selectedResult, setSelectedResult] = React.useState<RankedSearchResult | null>(null);

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <GlobalSearchPanel
          onResultClick={setSelectedResult}
          maxResults={15}
          minScore={15}
          showFilters={true}
          showStats={true}
        />
      </div>

      {/* Details Panel */}
      {selectedResult && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {selectedResult.highlightedText}
          </h3>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Contract</p>
              <p className="text-slate-900 dark:text-white">{selectedResult.contract.name}</p>
            </div>

            {selectedResult.function && (
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Function</p>
                <code className="block rounded bg-slate-100 px-3 py-2 font-mono text-sm dark:bg-slate-800">
                  {selectedResult.function.name}
                </code>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Description</p>
              <p className="text-slate-700 dark:text-slate-300">
                {selectedResult.function?.description || selectedResult.contract.description}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Match Score</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-2 bg-gradient-to-r from-emerald-500 to-blue-500"
                    style={{ width: `${selectedResult.score}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {Math.round(selectedResult.score)}%
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Match Type</p>
              <p className="text-slate-900 dark:text-white capitalize">{selectedResult.matchType}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Example 3: Search with dynamic contract loading
 */
export function DynamicSearchExample() {
  const [contracts, setContracts] = React.useState<ContractMetadata[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadContracts = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate fetching contracts from on-chain
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const contractsData: ContractMetadata[] = [
        // ... contracts array
      ];

      setContracts(contractsData);
    } catch (error) {
      console.error('Failed to load contracts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  return (
    <div className="space-y-4">
      <button
        onClick={loadContracts}
        disabled={isLoading}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {isLoading ? 'Loading...' : 'Refresh Contracts'}
      </button>

      <GlobalSearchPanel contracts={contracts} showStats={true} />
    </div>
  );
}

/**
 * Example 4: Integration with useSearchIndex hook
 */
export function HookIntegrationExample() {
  const { search, addContracts, contracts, error } = useSearchIndex({
    initialContracts: [],
    storageKey: 'vero-contracts-index',
    debounceMs: 300,
  });

  const [query, setQuery] = React.useState('');
  const results = React.useMemo(() => search(query, { maxResults: 5 }), [query, search]);

  return (
    <div className="space-y-4">
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contracts..."
          className="w-full rounded-lg border border-slate-300 px-4 py-2"
        />
      </div>

      <div className="text-sm text-slate-600">
        Indexed: {contracts.length} contracts | Results: {results.length}
      </div>

      {error && <div className="text-sm text-red-600">Error: {error.message}</div>}

      <ul className="space-y-2">
        {results.map((result) => (
          <li key={`${result.contract.id}-${result.rank}`} className="rounded-lg border p-3">
            <p className="font-medium">{result.highlightedText}</p>
            <p className="text-sm text-slate-600">{result.contract.name}</p>
            <p className="text-xs text-slate-500">Score: {Math.round(result.score)}%</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Export all examples
export const examples = {
  BasicSearchExample,
  AdvancedSearchExample,
  DynamicSearchExample,
  HookIntegrationExample,
};
