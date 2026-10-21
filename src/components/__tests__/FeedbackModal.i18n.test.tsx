import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { resources, type SupportedLanguage } from '@/i18n/config';
import FeedbackModal from '../FeedbackModal';

const copy = [
  {
    "language": "en",
    "open": "Send feedback",
    "heading": "Share feedback",
    "description": "Help improve the guardian workflow with quick UX notes.",
    "close": "Close feedback form",
    "success": "Feedback submitted. Thank you for helping refine the dashboard.",
    "name": "Name",
    "email": "Email",
    "optional": "Optional",
    "experience": "Experience",
    "message": "Feedback",
    "placeholder": "What should be improved?",
    "cancel": "Cancel",
    "sending": "Sending",
    "submit": "Submit",
    "ratings": {
      "excellent": "Excellent",
      "good": "Good",
      "needsWork": "Needs work"
    },
    "errors": {
      "send": "Feedback could not be sent.",
      "required": "Feedback message is required.",
      "email": "Enter a valid email address.",
      "submission": "Feedback submission failed.",
      "payload": "Invalid feedback payload."
    }
  },
  {
    "language": "es",
    "open": "Enviar comentarios",
    "heading": "Comparte tus comentarios",
    "description": "Ayuda a mejorar el flujo de trabajo de los guardianes con comentarios sobre la experiencia de uso.",
    "close": "Cerrar formulario de comentarios",
    "success": "Comentarios enviados. Gracias por ayudarnos a mejorar el panel.",
    "name": "Nombre",
    "email": "Correo electr\u00f3nico",
    "optional": "Opcional",
    "experience": "Experiencia",
    "message": "Comentarios",
    "placeholder": "\u00bfQu\u00e9 deber\u00eda mejorarse?",
    "cancel": "Cancelar",
    "sending": "Enviando",
    "submit": "Enviar",
    "ratings": {
      "excellent": "Excelente",
      "good": "Buena",
      "needsWork": "Necesita mejorar"
    },
    "errors": {
      "send": "No se pudieron enviar los comentarios.",
      "required": "Es necesario escribir un comentario.",
      "email": "Introduce una direcci\u00f3n de correo electr\u00f3nico v\u00e1lida.",
      "submission": "No se pudieron enviar los comentarios.",
      "payload": "Los datos del formulario no son v\u00e1lidos."
    }
  },
  {
    "language": "fr",
    "open": "Envoyer un avis",
    "heading": "Partagez votre avis",
    "description": "Aidez \u00e0 am\u00e9liorer le parcours des gardiens en partageant vos remarques sur l\u2019exp\u00e9rience utilisateur.",
    "close": "Fermer le formulaire d\u2019avis",
    "success": "Avis envoy\u00e9. Merci de nous aider \u00e0 am\u00e9liorer le tableau de bord.",
    "name": "Nom",
    "email": "Adresse e-mail",
    "optional": "Facultatif",
    "experience": "Exp\u00e9rience",
    "message": "Avis",
    "placeholder": "Que faudrait-il am\u00e9liorer ?",
    "cancel": "Annuler",
    "sending": "Envoi en cours",
    "submit": "Envoyer",
    "ratings": {
      "excellent": "Excellente",
      "good": "Bonne",
      "needsWork": "\u00c0 am\u00e9liorer"
    },
    "errors": {
      "send": "Impossible d\u2019envoyer l\u2019avis.",
      "required": "Veuillez saisir un avis.",
      "email": "Saisissez une adresse e-mail valide.",
      "submission": "L\u2019envoi de l\u2019avis a \u00e9chou\u00e9.",
      "payload": "Les donn\u00e9es du formulaire sont invalides."
    }
  }
] as const;
const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  global.fetch = fetchMock;
});
afterEach(() => { cleanup(); global.fetch = originalFetch; });

async function openForm(language: SupportedLanguage) {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    resources, lng: language, fallbackLng: false, initAsync: false,
    interpolation: { escapeValue: false }, react: { useSuspense: false },
  });
  render(<I18nextProvider i18n={i18n}><FeedbackModal /></I18nextProvider>);
  const labels = copy.find((item) => item.language === language);
  if (!labels) throw new Error('Unsupported fixture language');
  fireEvent.click(screen.getByRole('button', { name: labels.open }));
  return i18n;
}

function fill(language: SupportedLanguage) {
  const labels = copy.find((item) => item.language === language);
  if (!labels) throw new Error('Unsupported fixture language');
  fireEvent.change(screen.getByLabelText(labels.name), { target: { value: 'Pat' } });
  fireEvent.change(screen.getByLabelText(labels.email), { target: { value: 'pat@example.com' } });
  fireEvent.change(screen.getByLabelText(labels.message), { target: { value: 'Make the navigation clearer.' } });
}

describe('FeedbackModal translations', () => {
  test.each(copy)('translates controls and accessible labels in $language', async (labels) => {
    await openForm(labels.language);
    expect(screen.getByRole('dialog', { name: labels.heading })).toBeInTheDocument();
    expect(screen.getByText(labels.description)).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(labels.optional)).toHaveLength(2);
    expect(screen.getByRole('group', { name: labels.experience })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: labels.ratings.good })).toBeChecked();
    expect(screen.getByRole('radio', { name: labels.ratings.excellent })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: labels.ratings.needsWork })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.placeholder)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.close })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: labels.cancel }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test.each(copy)('keeps canonical API rating values while showing $language labels', async (labels) => {
    await openForm(labels.language); fill(labels.language);
    fireEvent.click(screen.getByRole('radio', { name: labels.ratings.excellent }));
    fireEvent.click(screen.getByRole('button', { name: labels.submit }));
    expect(await screen.findByText(labels.success)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/feedback');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      name: 'Pat', email: 'pat@example.com', rating: 'Excellent', message: 'Make the navigation clearer.',
    }));
    fireEvent.click(screen.getByRole('button', { name: labels.close }));
    fireEvent.click(screen.getByRole('button', { name: labels.open }));
    expect(screen.getByLabelText(labels.name)).toHaveValue('');
    expect(screen.getByRole('radio', { name: labels.ratings.good })).toBeChecked();
  });

  test('switches languages without losing form content or rating', async () => {
    const [en, es, fr] = copy;
    const i18n = await openForm('en'); fill('en');
    fireEvent.click(screen.getByRole('radio', { name: en.ratings.needsWork }));
    await act(async () => { await i18n.changeLanguage('es'); });
    expect(screen.getByLabelText(es.name)).toHaveValue('Pat');
    expect(screen.getByLabelText(es.message)).toHaveValue('Make the navigation clearer.');
    expect(screen.getByRole('radio', { name: es.ratings.needsWork })).toBeChecked();
    await act(async () => { await i18n.changeLanguage('fr'); });
    fireEvent.click(screen.getByRole('button', { name: fr.submit }));
    expect(await screen.findByText(fr.success)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).rating).toBe('Needs work');
  });

  test.each([
    ['Feedback message is required.', 'required'],
    ['Enter a valid email address.', 'email'],
    ['Feedback submission failed.', 'submission'],
    ['Invalid feedback payload.', 'payload'],
    ['Unrecognized server message', 'send'],
  ] as const)('localizes server error %s and updates it on language change', async (serverError, key) => {
    const [, es, fr] = copy;
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: serverError }) });
    const i18n = await openForm('es'); fill('es');
    fireEvent.click(screen.getByRole('button', { name: es.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(es.errors[key]);
    await act(async () => { await i18n.changeLanguage('fr'); });
    expect(screen.getByRole('alert')).toHaveTextContent(fr.errors[key]);
    expect(screen.getByLabelText(fr.name)).toHaveValue('Pat');
  });

  test('translates the disabled submitting state and eventual success', async () => {
    const [en, es] = copy;
    let finish: (value: { ok: boolean }) => void = () => { throw new Error('Not pending'); };
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const i18n = await openForm('en'); fill('en');
    fireEvent.click(screen.getByRole('button', { name: en.submit }));
    expect(screen.getByRole('button', { name: en.sending })).toBeDisabled();
    await act(async () => { await i18n.changeLanguage('es'); });
    expect(screen.getByRole('button', { name: es.sending })).toBeDisabled();
    await act(async () => { finish({ ok: true }); });
    await waitFor(() => expect(screen.getByText(es.success)).toBeInTheDocument());
  });
});
