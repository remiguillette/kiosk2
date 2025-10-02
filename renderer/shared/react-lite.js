const TEXT_ELEMENT = Symbol('text');
const Fragment = Symbol('fragment');

const componentHooks = new Map();
let currentHooks = null;
let currentHookIndex = 0;
let rerenderRoot = null;
const effectQueue = [];

function createElement(type, props, ...children) {
  const normalizedChildren = [];
  children.forEach((child) => {
    if (Array.isArray(child)) {
      child.forEach((nested) => {
        if (nested === null || nested === undefined || typeof nested === 'boolean') {
          return;
        }
        normalizedChildren.push(nested);
      });
    } else if (child !== null && child !== undefined && typeof child !== 'boolean') {
      normalizedChildren.push(child);
    }
  });

  const resolvedProps = props ? { ...props } : {};
  resolvedProps.children = normalizedChildren;

  if (typeof type === 'string' || type === Fragment || typeof type === 'function') {
    return { type, props: resolvedProps };
  }

  return { type: TEXT_ELEMENT, props: { nodeValue: String(type), children: [] } };
}

function createTextElement(value) {
  return { type: TEXT_ELEMENT, props: { nodeValue: value, children: [] } };
}

function setProperty(node, key, value) {
  if (key === 'children' || value === undefined || value === null) {
    return;
  }
  if (key === 'className') {
    node.setAttribute('class', value);
    return;
  }
  if (key === 'style' && typeof value === 'object') {
    Object.assign(node.style, value);
    return;
  }
  if (key === 'ref') {
    if (typeof value === 'function') {
      value(node);
    } else if (value && typeof value === 'object') {
      value.current = node;
    }
    return;
  }
  if (key === 'key') {
    return;
  }
  if (key === 'htmlFor') {
    node.setAttribute('for', value);
    return;
  }
  if (key === 'value') {
    node.value = value;
    return;
  }
  if (key === 'checked') {
    node.checked = Boolean(value);
    return;
  }
  if (key === 'dangerouslySetInnerHTML' && value && typeof value.__html === 'string') {
    node.innerHTML = value.__html;
    return;
  }
  if (key.startsWith('on') && typeof value === 'function') {
    const event = key.slice(2).toLowerCase();
    node.addEventListener(event, value);
    return;
  }
  if (value === true) {
    node.setAttribute(key, '');
    return;
  }
  if (value === false) {
    node.removeAttribute(key);
    return;
  }
  node.setAttribute(key, value);
}

function renderElement(element, container) {
  if (element === null || element === undefined || typeof element === 'boolean') {
    return;
  }

  if (typeof element === 'string' || typeof element === 'number') {
    container.appendChild(document.createTextNode(String(element)));
    return;
  }

  if (element.type === TEXT_ELEMENT) {
    container.appendChild(document.createTextNode(element.props.nodeValue));
    return;
  }

  if (element.type === Fragment) {
    element.props.children.forEach((child) => renderElement(child, container));
    return;
  }

  if (typeof element.type === 'function') {
    const component = element.type;
    const previousHooks = currentHooks;
    const previousHookIndex = currentHookIndex;
    let hookState = componentHooks.get(component);
    if (!hookState) {
      hookState = [];
      componentHooks.set(component, hookState);
    }
    currentHooks = hookState;
    currentHookIndex = 0;
    const rendered = component({ ...element.props, children: element.props.children });
    renderElement(rendered, container);
    currentHooks = previousHooks;
    currentHookIndex = previousHookIndex;
    return;
  }

  const node = document.createElement(element.type);
  Object.keys(element.props || {}).forEach((key) => {
    setProperty(node, key, element.props[key]);
  });

  element.props.children.forEach((child) => {
    if (child === null || child === undefined || typeof child === 'boolean') {
      return;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      renderElement(child, node);
    }
  });

  container.appendChild(node);
}

function rerender() {
  if (!rerenderRoot) {
    return;
  }
  const { element, container } = rerenderRoot;
  container.innerHTML = '';
  renderElement(element, container);
  flushEffects();
}

function flushEffects() {
  while (effectQueue.length) {
    const effect = effectQueue.shift();
    effect();
  }
}

function createRoot(container) {
  return {
    render(element) {
      rerenderRoot = { container, element };
      rerender();
    },
  };
}

function useState(initialState) {
  if (!currentHooks) {
    throw new Error('useState can only be used inside a component');
  }
  const hookIndex = currentHookIndex++;
  if (!(hookIndex in currentHooks)) {
    currentHooks[hookIndex] = typeof initialState === 'function' ? initialState() : initialState;
  }
  const setState = (value) => {
    const newValue = typeof value === 'function' ? value(currentHooks[hookIndex]) : value;
    if (Object.is(newValue, currentHooks[hookIndex])) {
      return;
    }
    currentHooks[hookIndex] = newValue;
    rerender();
  };
  return [currentHooks[hookIndex], setState];
}

function useMemo(factory, deps) {
  if (!currentHooks) {
    throw new Error('useMemo can only be used inside a component');
  }
  const hookIndex = currentHookIndex++;
  const prevEntry = currentHooks[hookIndex];
  if (prevEntry) {
    const [prevValue, prevDeps] = prevEntry;
    if (deps && prevDeps && deps.length === prevDeps.length && deps.every((dep, idx) => Object.is(dep, prevDeps[idx]))) {
      return prevValue;
    }
  }
  const value = factory();
  currentHooks[hookIndex] = [value, deps];
  return value;
}

function useEffect(effect, deps) {
  if (!currentHooks) {
    throw new Error('useEffect can only be used inside a component');
  }
  const hookIndex = currentHookIndex++;
  const prevEntry = currentHooks[hookIndex];
  let shouldRun = true;
  if (prevEntry) {
    const [, prevDeps, cleanup] = prevEntry;
    if (deps && prevDeps && deps.length === prevDeps.length && deps.every((dep, idx) => Object.is(dep, prevDeps[idx]))) {
      shouldRun = false;
    } else if (cleanup) {
      cleanup();
    }
  }
  if (shouldRun) {
    effectQueue.push(() => {
      const cleanup = effect();
      currentHooks[hookIndex] = [null, deps, typeof cleanup === 'function' ? cleanup : undefined];
    });
  } else {
    currentHooks[hookIndex] = prevEntry;
  }
}

function useRef(initialValue) {
  if (!currentHooks) {
    throw new Error('useRef can only be used inside a component');
  }
  const hookIndex = currentHookIndex++;
  if (!(hookIndex in currentHooks)) {
    currentHooks[hookIndex] = { current: initialValue };
  }
  return currentHooks[hookIndex];
}

const React = {
  createElement,
  Fragment,
  useState,
  useMemo,
  useEffect,
  useRef,
};

const ReactDOM = {
  createRoot,
};

export { React, ReactDOM, Fragment, createElement };
