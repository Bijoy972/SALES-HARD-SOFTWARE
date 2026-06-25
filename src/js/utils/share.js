// Save a blob to device storage and offer it via the Android share sheet.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
  const data = await blobToBase64(blob);
  const safeName = sanitize(filename);
  // Cache is always writable on Android without runtime permission;
  // its content:// URI is exposed to other apps via FileProvider.
  const dirsToTry = [
    Directory.Cache,
    Directory.External,
    Directory.Documents,
  ];
  let writeRes = null;
  let lastErr = null;
  for (const dir of dirsToTry) {
    try {
      writeRes = await Filesystem.writeFile({
        path: safeName,
        data,
        directory: dir,
        recursive: true,
      });
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!writeRes) {
    throw new Error('Could not save file: ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
  }

  try {
    await Share.share({
      title: dialogTitle,
      dialogTitle,
      files: [writeRes.uri],
    });
    return writeRes.uri;
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (/cancel/i.test(msg)) return writeRes.uri;
    // Fallback: some share targets prefer url= over files=
    try {
      await Share.share({ title: dialogTitle, dialogTitle, url: writeRes.uri });
      return writeRes.uri;
    } catch (e2) {
      const msg2 = String((e2 && e2.message) || e2 || '');
      if (/cancel/i.test(msg2)) return writeRes.uri;
      throw new Error('Saved to ' + writeRes.uri + ' but share failed: ' + msg2);
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
