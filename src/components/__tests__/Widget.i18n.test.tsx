import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance, type i18n } from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import BatchTxBuilder from '@/components/BatchTxBuilder';
import { SearchResults } from '@/components/search/SearchResults';
import { GlobalSearchPanel } from '@/components/search/GlobalSearchPanel';
import { resources } from '@/i18n/config';
import { useWallet } from '@/context/WalletContext';

jest.mock('@/context/WalletContext', () => ({ useWallet: jest.fn() }));
const mockWallet = useWallet as jest.Mock;

const samples = [
  { lang: 'en', noQuery: 'No search query', searching: 'Searching...', heading: 'Batch Transaction Builder', clear: 'Clear all', empty: 'No operations queued yet. Add one above to start your batch.', placeholder: 'Search contracts, functions, or on-chain data...', reset: 'Reset Layout' },
  { lang: 'es', noQuery: 'No hay término de búsqueda', searching: 'Buscando...', heading: 'Constructor de transacciones por lotes', clear: 'Borrar todo', empty: 'Todavía no hay operaciones en cola. Añade una arriba para empezar.', placeholder: 'Buscar contratos, funciones o datos en cadena...', reset: 'Restablecer diseño' },
  { lang: 'fr', noQuery: 'Aucune recherche saisie', searching: 'Recherche en cours...', heading: 'Constructeur de transactions groupées', clear: 'Tout effacer', empty: 'Aucune opération en attente. Ajoutez-en une ci-dessus pour commencer.', placeholder: 'Rechercher des contrats, fonctions ou données sur la chaîne...', reset: 'Réinitialiser la disposition' },
] as const;

async function provider(lang: string): Promise<i18n> {
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    resources, lng: lang, fallbackLng: false, initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}
afterEach(() => { cleanup(); jest.clearAllMocks(); localStorage.clear(); });

describe('remaining widgets i18n', () => {
  test.each(samples)('shows the translated search empty and loading states in $lang', async ({lang, noQuery, searching}) => {
    const i18n = await provider(lang);
    const {rerender} = render(<I18nextProvider i18n={i18n}><SearchResults results={[]} isEmpty /></I18nextProvider>);
    expect(screen.getByText(noQuery)).toBeInTheDocument();
    rerender(<I18nextProvider i18n={i18n}><SearchResults results={[]} isLoading /></I18nextProvider>);
    expect(screen.getByText(searching)).toBeInTheDocument();
  });

  test.each(samples)('translates search placeholder in $lang', async ({lang, placeholder}) => {
    const i18n = await provider(lang);
    render(<I18nextProvider i18n={i18n}><GlobalSearchPanel contracts={[]} /></I18nextProvider>);
    expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
  });

  test.each(samples)('translates batch controls without changing operation values in $lang', async ({lang, heading, empty, clear}) => {
    const i18n = await provider(lang);
    mockWallet.mockReturnValue({ publicKey: null, isConnected: false });
    render(<I18nextProvider i18n={i18n}><BatchTxBuilder /></I18nextProvider>);
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByText(empty)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('vote-pr'), {target:{value:'42'}});
    fireEvent.click(screen.getByTestId('add-operation'));
    expect(screen.getByText(clear)).toBeInTheDocument();
    expect(screen.getByTestId('operation-type')).toHaveValue('vote');
    expect(screen.getByTestId('broadcast-batch')).toBeDisabled();
  });

  test('switching language updates existing search and preserves no-query state', async () => {
    const instance = await provider('en');
    render(<I18nextProvider i18n={instance}><SearchResults results={[]} isEmpty /></I18nextProvider>);
    expect(screen.getByText('No search query')).toBeInTheDocument();
    await act(async () => { await instance.changeLanguage('es'); });
    expect(screen.getByText('No hay término de búsqueda')).toBeInTheDocument();
    await act(async () => { await instance.changeLanguage('fr'); });
    expect(screen.getByText('Aucune recherche saisie')).toBeInTheDocument();
  });
});
