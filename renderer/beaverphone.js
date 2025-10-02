import { React, ReactDOM } from './shared/react-lite.js';

const { createElement: h, Fragment, useEffect, useMemo, useRef, useState } = React;

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
  return h(
    'header',
    null,
    h(
      'div',
      { className: 'header-title' },
      h(
        'a',
        { className: 'menu-return', href: 'menu.html', 'aria-label': 'Return to menu' },
        h('span', { className: 'btn-icon', 'aria-hidden': 'true' }, '←'),
      ),
      h('span', { className: 'eyebrow' }, 'BeaverPhone'),
    ),
  );
}

function DialpadKey({ label, subtext, onPress }) {
  return h(
    'button',
    {
      type: 'button',
      className: 'dialpad-key',
      onClick: () => onPress(label),
      'aria-label': subtext ? `${label} ${subtext}` : label,
    },
    label,
    subtext ? h('span', null, subtext) : null,
  );
}

function IconButton({ label, icon, onClick, isActive, disabled = false }) {
  const buttonProps = {
    type: 'button',
    className: 'pill-btn',
    onClick,
    disabled,
  };

  if (typeof isActive === 'boolean') {
    buttonProps['data-active'] = String(isActive);
    buttonProps['aria-pressed'] = String(isActive);
  }

  return h(
    'button',
    buttonProps,
    h('span', { className: 'btn-icon', 'aria-hidden': 'true' }, icon),
    h('span', { className: 'btn-label' }, label),
  );
}

function ExtensionCard({ contact, onSelect }) {
  const fallback = contact.name.slice(0, 1).toUpperCase();
  return h(
    'article',
    {
      className: 'extension-card',
      onClick: () => onSelect(contact),
      tabIndex: 0,
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(contact);
        }
      },
    },
    h(
      'div',
      { className: `avatar ${contact.image ? '' : 'avatar--fallback'}`, 'aria-hidden': 'true' },
      contact.image
        ? h('img', {
            src: contact.image,
            alt: `${contact.name} avatar`,
            onError: (event) => {
              const target = event.target;
              const parent = target.parentElement;
              target.remove();
              if (parent) {
                parent.classList.add('avatar--fallback');
                parent.textContent = fallback;
              }
            },
          })
        : fallback,
    ),
    h(
      'div',
      null,
      h('h3', null, contact.name),
      h('div', { className: 'subtitle' }, contact.subtitle),
      h('div', { className: 'details' }, contact.details),
    ),
    h('div', { className: 'extension' }, `Ext. ${contact.extension}`),
  );
}

function BeaverPhoneApp() {
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
    } else if (event.key === 'Backspace' && event.metaKey) {
      event.preventDefault();
      resetDialer();
    }
  };

  const handleContactSelect = (contact) => {
    setHelperOverride(null);
    setState({
      dialedNumber: contact.extension,
      isOnCall: true,
      isOnHold: false,
      isSpeakerEnabled: state.isSpeakerEnabled,
    });
    dispatchDialpadEvent(contact.extension);
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
  }, [state.isOnCall, state.dialedNumber, state.isOnHold, state.isSpeakerEnabled]);

  useEffect(() => {
    focusComposer();
  }, []);

  return h(
    Fragment,
    null,
    h(Header),
    h(
      'div',
      { className: 'app' },
      h(
        'section',
        { className: 'panel', 'aria-labelledby': 'dialpad-heading' },
        h(
          'div',
          { className: 'dialpad-header' },
          h('h2', { id: 'dialpad-heading' }, 'Dialpad'),
          h('span', { className: 'status-pill', id: 'status-pill', 'data-active': String(state.isOnCall) }, statusLabel),
        ),
        h(
          'div',
          { className: 'composer' },
          h('label', { htmlFor: 'composer-input' }, 'Number'),
          h('input', {
            id: 'composer-input',
            ref: inputRef,
            placeholder: 'Enter number',
            value: state.dialedNumber,
            onInput: handleComposerChange,
            onKeyDown: handleComposerKeyDown,
          }),
        ),
        h(
          'div',
          { className: 'dialpad-grid', id: 'dialpad' },
          dialpad.map((item) => h(DialpadKey, { key: item.label, ...item, onPress: appendDigit })),
        ),
        h(
          'div',
          { className: 'dialpad-actions' },
        h(
          IconButton,
          {
            label: 'Erase',
            icon: '⌫',
            onClick: eraseDigit,
          },
        ),
          h(
            'button',
            {
              type: 'button',
              className: 'pill-btn call-btn',
              id: 'call-btn',
              onClick: toggleCall,
              'data-active': String(state.isOnCall),
              'aria-pressed': String(state.isOnCall),
            },
            h('span', { className: 'btn-icon', 'aria-hidden': 'true' }, state.isOnCall ? '⛔' : '📞'),
            h('span', { className: 'btn-label' }, callButtonLabel),
          ),
          h(
            IconButton,
            {
              label: speakerButtonLabel,
              icon: '🔈',
              onClick: toggleSpeaker,
              isActive: state.isSpeakerEnabled,
            },
          ),
        ),
        h(
          'div',
          { className: 'dialpad-secondary' },
          h(
            IconButton,
            {
              label: holdButtonLabel,
              icon: '⏸',
              onClick: toggleHold,
              isActive: state.isOnHold,
              disabled: !state.isOnCall,
            },
          ),
        h(
          IconButton,
          {
            label: 'Clear',
            icon: '✖',
            onClick: resetDialer,
          },
        ),
          h('div'),
        ),
        h('p', { className: 'subtext', id: 'helper-text' }, helperText),
      ),
      h(
        'section',
        { className: 'extensions' },
        h(
          'header',
          null,
          h('h2', null, 'Saved extensions'),
          h('p', null, 'Quick access to your most important contacts.'),
        ),
        h(
          'div',
          { className: 'extension-list', id: 'extension-list' },
          contacts.length === 0
            ? h('p', { className: 'empty-hint' }, 'No saved extensions yet.')
            : contacts.map((contact) => h(ExtensionCard, { key: contact.extension, contact, onSelect: handleContactSelect })),
        ),
      ),
    ),
  );
}

function BeaverPhoneRoot() {
  return h('div', { className: 'beaverphone' }, h(BeaverPhoneApp));
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(h(BeaverPhoneRoot));
