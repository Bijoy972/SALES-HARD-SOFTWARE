// Tiny DOM helpers used by views.
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset' && typeof v === 'object')
      Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number')
      el.appendChild(document.createTextNode(String(c)));
    else el.appendChild(c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = h('div', { class: 'toast ' + (kind || '') }, msg);
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(() => el.remove(), 280);
  }, 2200);
}

export function openModal(contentNode) {
  const root = document.getElementById('modal-root');
  const card = document.getElementById('modal-card');
  clear(card);
  card.appendChild(contentNode);
  root.classList.remove('hidden');
  const scrim = root.querySelector('.modal-scrim');
  scrim.onclick = closeModal;
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  root.classList.add('hidden');
  clear(document.getElementById('modal-card'));
}

export async function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const card = h('div', {}, [
      h('div', { class: 'modal-title' }, opts.title || 'Confirm'),
      h('p', { class: 'muted', style: { marginBottom: '14px' } }, message),
      h('div', { class: 'btn-row' }, [
        h(
          'button',
          {
            class: 'btn btn-ghost flex-1',
            onclick: () => {
              closeModal();
              resolve(false);
            },
          },
          opts.cancelLabel || 'Cancel',
        ),
        h(
          'button',
          {
            class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + ' flex-1',
            onclick: () => {
              closeModal();
              resolve(true);
            },
          },
          opts.okLabel || 'Yes',
        ),
      ]),
    ]);
    openModal(card);
  });
}

export function setActiveNav(route) {
  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    a.classList.toggle(
      'active',
      a.getAttribute('href') === '#/' + route ||
        a.getAttribute('href') === '#' + route,
    );
  });
  document.querySelectorAll('.drawer a').forEach((a) => {
    a.classList.toggle(
      'active',
      a.getAttribute('href') === '#/' + route ||
        a.getAttribute('href') === '#' + route,
    );
  });
}
