import { React, ReactDOM } from './shared/react-lite.js';

const { createElement: h, Fragment, useMemo, useState, useEffect } = React;

const translations = {
  fr: {
    heroTitle: 'Bienvenue au Beaver\u00a0Kiosk',
    heroSubtitle:
      'Prenez en main vos communications et vos services num\u00e9riques en un seul endroit. Choisissez une option ci-dessous pour commencer.',
    beaverphoneTitle: 'BeaverPhone (local)',
    beaverphoneBody:
      'Passez des appels internes ou externes en toute simplicit\u00e9 gr\u00e2ce \u00e0 notre t\u00e9l\u00e9phone virtuel.',
    beavernetTitle: 'BeaverNet.ca (cloud)',
    beavernetBody: 'Acc\u00e9dez \u00e0 la suite de services infonuagiques BeaverNet pour g\u00e9rer vos activit\u00e9s en ligne.',
    tipLabel: 'Astuce :',
    tipBody: 'Touchez l\'\u00e9cran ou utilisez la souris pour s\u00e9lectionner un service.',
    langFrench: 'Fran\u00e7ais',
    langEnglish: 'English',
  },
  en: {
    heroTitle: 'Welcome to the Beaver Kiosk',
    heroSubtitle:
      'Access your communications and digital services from one place. Choose an option below to get started.',
    beaverphoneTitle: 'BeaverPhone (local)',
    beaverphoneBody: 'Place internal or external calls with ease using our virtual phone.',
    beavernetTitle: 'BeaverNet.ca (cloud)',
    beavernetBody: 'Reach the BeaverNet cloud suite to manage your online services.',
    tipLabel: 'Tip:',
    tipBody: 'Tap the screen or use the mouse to select a service.',
    langFrench: 'French',
    langEnglish: 'English',
  },
};

const cards = [
  {
    icon: '📞',
    titleKey: 'beaverphoneTitle',
    bodyKey: 'beaverphoneBody',
    onClick: () => {
      window.location.href = 'beaverphone.html';
    },
  },
  {
    icon: '🌐',
    titleKey: 'beavernetTitle',
    bodyKey: 'beavernetBody',
    onClick: () => {
      window.location.href = 'https://rgbeavernet.ca';
    },
  },
];

function usePreferredLanguage(defaultLang = 'fr') {
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('preferredLang');
    if (stored && translations[stored]) {
      return stored;
    }
    return defaultLang;
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('preferredLang', lang);
  }, [lang]);

  return [lang, setLang];
}

function LangToggle({ current, onChange }) {
  return h(
    'div',
    { className: 'lang-toggle', role: 'group', 'aria-label': 'Language selector' },
    h(
      'button',
      {
        type: 'button',
        className: `lang-btn ${current === 'fr' ? 'active' : ''}`,
        'data-lang': 'fr',
        'aria-pressed': String(current === 'fr'),
        onClick: () => onChange('fr'),
      },
      translations[current].langFrench,
    ),
    h(
      'button',
      {
        type: 'button',
        className: `lang-btn ${current === 'en' ? 'active' : ''}`,
        'data-lang': 'en',
        'aria-pressed': String(current === 'en'),
        onClick: () => onChange('en'),
      },
      translations[current].langEnglish,
    ),
  );
}

function Card({ icon, title, body, onClick }) {
  return h(
    'article',
    { className: 'card', onClick },
    h('div', { className: 'icon', 'aria-hidden': 'true' }, icon),
    h('h2', null, title),
    h('p', null, body),
  );
}

function App() {
  const [lang, setLang] = usePreferredLanguage('fr');
  const t = useMemo(() => translations[lang], [lang]);

  return h(
    'main',
    { className: 'wrapper' },
    h(LangToggle, { current: lang, onChange: setLang }),
    h(
      'header',
      null,
      h('h1', { 'data-i18n': 'heroTitle', dangerouslySetInnerHTML: { __html: t.heroTitle } }),
      h('p', { 'data-i18n': 'heroSubtitle' }, t.heroSubtitle),
    ),
    h(
      'section',
      { className: 'menu' },
      cards.map((card) =>
        h(Card, {
          key: card.titleKey,
          icon: card.icon,
          title: t[card.titleKey],
          body: t[card.bodyKey],
          onClick: card.onClick,
        }),
      ),
    ),
    h(
      'footer',
      null,
      h('span', { className: 'highlight', 'data-i18n': 'tipLabel' }, t.tipLabel),
      h('span', { 'data-i18n': 'tipBody' }, t.tipBody),
    ),
  );
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(h(App));
