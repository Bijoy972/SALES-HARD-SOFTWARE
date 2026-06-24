import * as settings from '../db/settings.js';
import { t } from '../i18n.js';

export async function maybeLock() {
  const hash = await settings.get('pinHash');
  const overlay = document.getElementById('lock-overlay');
  const app = document.getElementById('app');
  if (!hash) {
    overlay.classList.add('hidden');
    app.classList.remove('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  app.classList.add('hidden');
  const input = document.getElementById('lock-input');
  const submit = document.getElementById('lock-submit');
  const error = document.getElementById('lock-error');
  input.value = '';
  setTimeout(() => input.focus(), 50);

  const tryUnlock = async () => {
    const pin = input.value.trim();
    if (pin.length !== 4) return;
    const tryHash = await settings.hashPin(pin);
    if (tryHash === hash) {
      overlay.classList.add('hidden');
      app.classList.remove('hidden');
      error.textContent = '';
    } else {
      error.textContent = t('lock.wrong');
      input.value = '';
      input.focus();
    }
  };
  submit.onclick = tryUnlock;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') tryUnlock();
  };
  input.oninput = () => {
    if (input.value.length === 4) tryUnlock();
  };
}
