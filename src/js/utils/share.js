// Save a blob to device storage and offer it via the Android share sheet.
// DEBUG BUILD: each step uses alert() so the user can see exactly where it fails.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const DBG = (msg) => {
  console.log('[BIJOY-SHARE]', msg);
  try {
    alert('[Share debug] ' + msg);
  } catch (_) {}
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
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
  DBG('1/5 native start, blob size=' + (blob?.size ?? 'null'));
  let data;
  try {
    data = await blobToBase64(blob);
    DBG('2/5 base64 ok, length=' + data.length);
  } catch (e) {
    DBG('2/5 base64 FAILED: ' + (e?.message || e));
    throw e;
  }

  const safeName = sanitize(filename);
  const dirsToTry = [
    ['External', Directory.External],
    ['Cache', Directory.Cache],
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
      DBG('3/5 wrote to ' + label + ' OK: ' + writeRes.uri);
      break;
    } catch (e) {
      lastErr = e;
      DBG('3/5 write to ' + label + ' failed: ' + (e?.message || e));
    }
  }
  if (!writeRes) {
    DBG('3/5 ALL writes failed: ' + (lastErr?.message || lastErr));
    throw new Error('Could not save file: ' + (lastErr?.message || lastErr));
  }

  try {
    DBG('4/5 calling Share.share files=[' + writeRes.uri + ']');
    await Share.share({
      title: dialogTitle,
      dialogTitle,
      files: [writeRes.uri],
    });
    DBG('5/5 share returned OK');
    return writeRes.uri;
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/cancel/i.test(msg)) {
      DBG('5/5 share cancelled by user');
      return writeRes.uri;
    }
    DBG('4/5 share files[] failed: ' + msg + ' — trying url fallback');
    try {
      await Share.share({
        title: dialogTitle,
        dialogTitle,
        url: writeRes.uri,
      });
      DBG('5/5 share via url OK');
      return writeRes.uri;
    } catch (e2) {
      const msg2 = String(e2?.message || e2 || '');
      if (/cancel/i.test(msg2)) return writeRes.uri;
      DBG('5/5 share via url FAILED: ' + msg2);
      throw new Error(
        'Saved to ' + writeRes.uri + ' but share failed: ' + msg2,
      );
    }
  }
}

export async function saveAndShareBlob(blob, filename, dialogTitle = 'Share') {
  if (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    return nativeShare(blob, filename, dialogTitle);
  }
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
