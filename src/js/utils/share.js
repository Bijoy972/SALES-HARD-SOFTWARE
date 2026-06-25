// Save a blob to device storage and offer it via the Android share sheet.
// DEBUG BUILD v1.0.5: on-screen overlay log because Capacitor WebView suppresses alert().
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function ensureLogPanel() {
  let el = document.getElementById('bijoy-share-debug');
  if (el) return el;
  el = document.createElement('pre');
  el.id = 'bijoy-share-debug';
  el.style.cssText =
    'position:fixed;left:0;right:0;top:0;z-index:99999;' +
    'background:rgba(255,255,0,0.95);color:#000;' +
    'font:11px/1.3 monospace;padding:6px 8px;margin:0;' +
    'max-height:50vh;overflow:auto;white-space:pre-wrap;' +
    'border-bottom:2px solid #000;';
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  return el;
}

export function DBG(msg) {
  const line = '[' + new Date().toISOString().slice(11, 19) + '] ' + msg;
  console.log('[BIJOY-SHARE]', line);
  try {
    const el = ensureLogPanel();
    el.textContent += line + '\n';
    el.scrollTop = el.scrollHeight;
  } catch (_) {}
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error || new Error('FileReader error'));
    fr.onload = () => {
      const s = String(fr.result || '');
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    fr.readAsDataURL(blob);
  });
}

function sanitize(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

async function nativeShare(blob, filename, dialogTitle) {
  DBG('1/5 nativeShare start, blob=' + (blob && blob.size != null ? blob.size + 'B' : 'null'));
  let data;
  try {
    data = await blobToBase64(blob);
    DBG('2/5 base64 ok, len=' + data.length);
  } catch (e) {
    DBG('2/5 base64 FAILED: ' + (e && e.message ? e.message : e));
    throw e;
  }

  const safeName = sanitize(filename);
  const dirsToTry = [
    ['Cache', Directory.Cache],
    ['External', Directory.External],
    ['Documents', Directory.Documents],
  ];
  let writeRes = null;
  let lastErr = null;
  for (const [label, dir] of dirsToTry) {
    try {
      writeRes = await Filesystem.writeFile({
        path: safeName,
        data,
        directory: dir,
        recursive: true,
      });
      DBG('3/5 wrote ' + label + ': ' + writeRes.uri);
      break;
    } catch (e) {
      lastErr = e;
      DBG('3/5 ' + label + ' FAIL: ' + (e && e.message ? e.message : e));
    }
  }
  if (!writeRes) {
    DBG('3/5 ALL writes failed');
    throw new Error('Could not save file: ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
  }

  DBG('4/5 Share.share files=[' + writeRes.uri + ']');
  try {
    await Share.share({
      title: dialogTitle,
      dialogTitle,
      files: [writeRes.uri],
    });
    DBG('5/5 share OK (files[])');
    return writeRes.uri;
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (/cancel/i.test(msg)) {
      DBG('5/5 cancelled by user');
      return writeRes.uri;
    }
    DBG('4/5 files[] failed: ' + msg + ' — trying url=');
    try {
      await Share.share({
        title: dialogTitle,
        dialogTitle,
        url: writeRes.uri,
      });
      DBG('5/5 share OK (url=)');
      return writeRes.uri;
    } catch (e2) {
      const msg2 = String((e2 && e2.message) || e2 || '');
      if (/cancel/i.test(msg2)) {
        DBG('5/5 cancelled by user (url path)');
        return writeRes.uri;
      }
      DBG('5/5 url= FAILED: ' + msg2);
      throw new Error('Saved to ' + writeRes.uri + ' but share failed: ' + msg2);
    }
  }
}

export async function saveAndShareBlob(blob, filename, dialogTitle = 'Share') {
  DBG('saveAndShareBlob called, filename=' + filename);
  if (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    return nativeShare(blob, filename, dialogTitle);
  }
  DBG('web fallback (createObjectURL + a.click)');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return null;
}

export async function saveAndShareText(text, filename, mime = 'application/json', dialogTitle = 'Share') {
  const blob = new Blob([text], { type: mime });
  return saveAndShareBlob(blob, filename, dialogTitle);
}
