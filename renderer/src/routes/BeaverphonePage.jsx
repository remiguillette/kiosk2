import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../styles/beaverphone.css';

const BEAVERPHONE_DIALPAD_EVENT_KEY = 'beaverphone:dialpad';

const dialpad = [
  { label: '1' },
  { label: '2', subtext: 'ABC' },
  { label: '3', subtext: 'DEF' },
  { label: '4', subtext: 'GHI' },
  { label: '5', subtext: 'JKL' },
  { label: '6', subtext: 'MNO' },
  { label: '7', subtext: 'PQRS' },
  { label: '8', subtext: 'TUV' },
  { label: '9', subtext: 'WXYZ' },
  { label: '*' },
  { label: '0', subtext: '+' },
  { label: '#' },
];

const contacts = [
  {
    name: 'Ontario Provincial Police',
    subtitle: 'Internal line',
    details: 'Office 101',
    extension: '1201',
    image: 'contact/Police.png',
  },
  {
    name: 'SPCA Niagara',
    subtitle: 'Paws Law',
    details: 'Office 3434',
    extension: '3434',
    image: 'contact/SPCA.png',
  },
  {
    name: 'Mom',
    subtitle: 'Mom',
    details: 'Complaints Office',
    extension: '22',
    image: null,
  },
  {
    name: 'Services Ontario',
    subtitle: 'Government of Ontario',
    details: 'Desktop *1345',
    extension: '1345',
    image: 'contact/ontario.svg',
  },
];

const initialState = {
  dialedNumber: '',
  isOnCall: false,
  isOnHold: false,
  isSpeakerEnabled: false,
};

function dispatchDialpadEvent(number) {
  const event = new CustomEvent(BEAVERPHONE_DIALPAD_EVENT_KEY, {
    detail: { number },
  });
  window.dispatchEvent(event);
}

function Header() {
  return (
    <header>
      <div className="header-title">
        <Link className="menu-return" to="/" aria-label="Return to menu">
          <span className="btn-icon" aria-hidden="true">
            ←
          </span>
        </Link>
        <span className="eyebrow">BeaverPhone</span>
      </div>
    </header>
  );
}

function DialpadKey({ label, subtext, onPress }) {
  return (
    <button
      type="button"
      className="dialpad-key"
      onClick={() => onPress(label)}
      aria-label={subtext ? `${label} ${subtext}` : label}
    >
      {label}
      {subtext ? <span>{subtext}</span> : null}
    </button>
  );
}

function IconButton({ label, icon, onClick, isActive, disabled = false }) {
  return (
    <button
      type="button"
      className="pill-btn"
      onClick={onClick}
      data-active={typeof isActive === 'boolean' ? String(isActive) : undefined}
      aria-pressed={typeof isActive === 'boolean' ? String(isActive) : undefined}
      disabled={disabled}
    >
      <span className="btn-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="btn-label">{label}</span>
    </button>
  );
}

function ExtensionCard({ contact, onSelect }) {
  const fallback = contact.name.slice(0, 1).toUpperCase();

  const handleImageError = (event) => {
    const target = event.currentTarget;
    const parent = target.parentElement;
    if (!parent) return;
    target.remove();
    parent.classList.add('avatar--fallback');
    parent.textContent = fallback;
  };

  return (
    <article
      className="extension-card"
      onClick={() => onSelect(contact)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(contact);
        }
      }}
    >
      <div className={`avatar ${contact.image ? '' : 'avatar--fallback'}`} aria-hidden="true">
        {contact.image ? (
          <img src={contact.image} alt={`${contact.name} avatar`} onError={handleImageError} />
        ) : (
          fallback
        )}
      </div>
      <div>
        <h3>{contact.name}</h3>
        <div className="subtitle">{contact.subtitle}</div>
        <div className="details">{contact.details}</div>
      </div>
      <div className="extension">Ext. {contact.extension}</div>
    </article>
  );
}

function BeaverphonePage() {
  const [state, setState] = useState(initialState);
  const [helperOverride, setHelperOverride] = useState(null);
  const inputRef = useRef(null);

  const statusLabel = useMemo(() => {
    if (state.isOnCall) {
      return state.isOnHold ? 'On Hold' : 'On Call';
    }
    return 'Ready';
  }, [state.isOnCall, state.isOnHold]);

  const helperText = useMemo(() => {
    if (helperOverride) {
      return helperOverride;
    }
    if (state.isOnCall) {
      return state.isOnHold
        ? 'Call is on hold. Tap Hold to resume.'
        : 'You are connected. Use Hold or Speaker as needed.';
    }
    if (state.dialedNumber.length > 0) {
      return 'Press Call to connect or erase to edit the number.';
    }
    return 'Tap digits or choose a contact to start dialing.';
  }, [helperOverride, state.isOnCall, state.isOnHold, state.dialedNumber]);

  const callButtonLabel = state.isOnCall ? 'End' : 'Call';
  const holdButtonLabel = state.isOnHold ? 'Resume' : 'Hold';
  const speakerButtonLabel = state.isSpeakerEnabled ? 'Mute' : 'Speaker';

  const focusComposer = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const appendDigit = (digit) => {
    setHelperOverride(null);
    setState((prev) => {
      const nextNumber = `${prev.dialedNumber}${digit}`;
      dispatchDialpadEvent(digit);
      return { ...prev, dialedNumber: nextNumber };
    });
    focusComposer();
  };

  const eraseDigit = () => {
    if (state.dialedNumber.length === 0) {
      setHelperOverride('Nothing to erase.');
      return;
    }
    setHelperOverride(null);
    setState((prev) => ({
      ...prev,
      dialedNumber: prev.dialedNumber.slice(0, -1),
    }));
  };

  const resetDialer = () => {
    setHelperOverride(null);
    setState({ ...initialState });
    focusComposer();
  };

  const toggleCall = () => {
    if (!state.isOnCall && state.dialedNumber.length === 0) {
      setHelperOverride('Enter a number or choose a contact first.');
      return;
    }
    setHelperOverride(null);
    setState((prev) => {
      const next = { ...prev, isOnCall: !prev.isOnCall };
      if (!next.isOnCall) {
        next.isOnHold = false;
      }
      return next;
    });
  };

  const toggleHold = () => {
    if (!state.isOnCall) return;
    setHelperOverride(null);
    setState((prev) => ({ ...prev, isOnHold: !prev.isOnHold }));
  };

  const toggleSpeaker = () => {
    setHelperOverride(null);
    setState((prev) => ({ ...prev, isSpeakerEnabled: !prev.isSpeakerEnabled }));
  };

  const handleComposerChange = (event) => {
    const rawValue = event.target.value;
    const sanitized = rawValue.replace(/[^0-9*#]/g, '');
    setHelperOverride(null);
    setState((prev) => ({ ...prev, dialedNumber: sanitized }));
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      toggleCall();
    } else if (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      resetDialer();
    }
  };

  const handleContactSelect = (contact) => {
    setHelperOverride(null);
    setState((prev) => ({
      ...prev,
      dialedNumber: contact.extension,
      isOnCall: true,
      isOnHold: false,
    }));
    dispatchDialpadEvent(contact.extension);
    focusComposer();
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.repeat) return;

      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      if (activeElement && activeElement.getAttribute('contenteditable')) {
        return;
      }

      const key = event.key;
      if (/^[0-9]$/.test(key) || key === '*' || key === '#') {
        event.preventDefault();
        appendDigit(key);
        return;
      }

      switch (key) {
        case 'Enter':
          event.preventDefault();
          toggleCall();
          break;
        case 'Backspace':
          event.preventDefault();
          if (event.metaKey || event.ctrlKey) {
            resetDialer();
          } else {
            eraseDigit();
          }
          break;
        case 'Escape':
          event.preventDefault();
          resetDialer();
          break;
        case 'h':
        case 'H':
          if (state.isOnCall) {
            event.preventDefault();
            toggleHold();
          }
          break;
        case 's':
        case 'S':
          event.preventDefault();
          toggleSpeaker();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state.isOnCall, state.isOnHold, state.isSpeakerEnabled, state.dialedNumber]);

  useEffect(() => {
    focusComposer();
    document.title = 'BeaverPhone';
  }, []);

  return (
    <div className="beaverphone-page">
      <div className="beaverphone">
        <Header />
        <div className="app">
          <section className="panel" aria-labelledby="dialpad-heading">
            <div className="dialpad-header">
              <h2 id="dialpad-heading">Dialpad</h2>
              <span className="status-pill" data-active={String(state.isOnCall)}>
                {statusLabel}
              </span>
            </div>

            <div className="composer">
              <label htmlFor="composer-input">Number</label>
              <input
                id="composer-input"
                ref={inputRef}
                placeholder="Enter number"
                value={state.dialedNumber}
                onChange={handleComposerChange}
                onKeyDown={handleComposerKeyDown}
              />
            </div>

            <div className="dialpad-grid" id="dialpad">
              {dialpad.map((item) => (
                <DialpadKey key={item.label} {...item} onPress={appendDigit} />
              ))}
            </div>

            <div className="dialpad-actions">
              <IconButton label="Erase" icon="⌫" onClick={eraseDigit} />
              <button
                type="button"
                className="pill-btn call-btn"
                id="call-btn"
                onClick={toggleCall}
                data-active={String(state.isOnCall)}
                aria-pressed={String(state.isOnCall)}
              >
                <span className="btn-icon" aria-hidden="true">
                  {state.isOnCall ? <PhoneOff size={16} /> : <Phone size={16} />}
                </span>
                <span className="btn-label">{callButtonLabel}</span>
              </button>
              <IconButton
                label={speakerButtonLabel}
                icon="🔈"
                onClick={toggleSpeaker}
                isActive={state.isSpeakerEnabled}
              />
            </div>

            <div className="dialpad-secondary">
              <IconButton
                label={holdButtonLabel}
                icon="⏸"
                onClick={toggleHold}
                isActive={state.isOnHold}
                disabled={!state.isOnCall}
              />
              <IconButton label="Clear" icon="✖" onClick={resetDialer} />
              <div />
            </div>

            <p className="subtext" id="helper-text">
              {helperText}
            </p>
          </section>

          <section className="extensions">
            <header>
              <h2>Saved extensions</h2>
              <p>Quick access to your most important contacts.</p>
            </header>
            <div className="extension-list" id="extension-list">
              {contacts.length === 0 ? (
                <p className="empty-hint">No saved extensions yet.</p>
              ) : (
                contacts.map((contact) => (
                  <ExtensionCard key={contact.extension} contact={contact} onSelect={handleContactSelect} />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default BeaverphonePage;
