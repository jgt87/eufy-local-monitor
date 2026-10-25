// Tiny DOM helpers shared by all views.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function loading(text = 'Loading') {
  return h('p', { class: 'muted' }, text, '…');
}

export function errorBox(err) {
  return h('div', { class: 'error', role: 'alert' }, h('strong', {}, 'Could not load this view. '), String(err?.message || err));
}

export const shortName = p => p.split('_').pop().replace(/\.(tsx?|jsx?)$/, '');
export const folderOf = p => p.split('_').slice(0, -1).join('/');
