import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/menu.css';

const translations = {
  fr: {
    heroTitle: 'Bienvenue au Beaver\u00a0Kiosk',
    heroSubtitle:
      'Prenez en main vos communications et vos services num\u00e9riques en un seul endroit. Choisissez une option ci-dessous pour commencer.',
    beaverphoneTitle: 'BeaverPhone (local)',
    beaverphoneBody:
      'Passez des appels internes ou externes en toute simplicit\u00e9 gr\u00e2ce \u00e0 notre t\u00e9l\u00e9phone virtuel.',
    beavernetTitle: 'BeaverNet.ca (cloud)',
    beavernetBody: "Acc\u00e9dez \u00e0 la suite de services infonuagiques BeaverNet pour g\u00e9rer vos activit\u00e9s en ligne.",
    tipLabel: 'Astuce :',
    tipBody: "Touchez l'\u00e9cran ou utilisez la souris pour s\u00e9lectionner un service.",
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

const CARD_CONFIG = [
  {
    icon: '📞',
    titleKey: 'beaverphoneTitle',
    bodyKey: 'beaverphoneBody',
    type: 'route',
    target: '/beaverphone',
  },
  {
    icon: '🌐',
    titleKey: 'beavernetTitle',
    bodyKey: 'beavernetBody',
    type: 'link',
    target: 'https://rgbeavernet.ca',
  },
];

function usePreferredLanguage(defaultLang = 'fr') {
  const [language, setLanguage] = useState(() => {
    const stored = window.localStorage.getItem('preferredLang');
    if (stored && translations[stored]) {
      return stored;
    }
    return defaultLang;
  });

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem('preferredLang', language);
  }, [language]);

  return [language, setLanguage];
}

function MenuCard({ icon, title, body, onSelect }) {
  return (
    <article className="menu-card" role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect();
      }
    }}>
      <div className="icon" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}

function MenuPage() {
  const navigate = useNavigate();
  const [lang, setLang] = usePreferredLanguage('fr');
  const t = useMemo(() => translations[lang], [lang]);

  useEffect(() => {
    document.title = 'Beaver Kiosk';
  }, []);

  return (
    <div className="menu-page">
      <main className="menu-wrapper">
        <div className="lang-toggle" role="group" aria-label="Language selector">
          <button
            type="button"
            className={`lang-btn ${lang === 'fr' ? 'active' : ''}`}
            aria-pressed={lang === 'fr'}
            onClick={() => setLang('fr')}
          >
            {t.langFrench}
          </button>
          <button
            type="button"
            className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
            aria-pressed={lang === 'en'}
            onClick={() => setLang('en')}
          >
            {t.langEnglish}
          </button>
        </div>

        <header>
          <h1 dangerouslySetInnerHTML={{ __html: t.heroTitle }} />
          <p>{t.heroSubtitle}</p>
        </header>

        <section className="menu-grid">
          {CARD_CONFIG.map((card) => (
            <MenuCard
              key={card.titleKey}
              icon={card.icon}
              title={t[card.titleKey]}
              body={t[card.bodyKey]}
              onSelect={() => {
                if (card.type === 'route') {
                  navigate(card.target);
                } else if (card.type === 'link') {
                  window.open(card.target, '_blank', 'noopener');
                }
              }}
            />
          ))}
        </section>

        <footer className="menu-footer">
          <span className="highlight">{t.tipLabel}</span>
          <span>{t.tipBody}</span>
        </footer>
      </main>
    </div>
  );
}

export default MenuPage;
