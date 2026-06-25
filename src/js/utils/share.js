// Save a PDF/JSON blob and offer it via the Android share sheet.
// On Android, Capacitor's Share.share({ files: [...] }) routes the file:// URI
// through FileProvider automatically, avoiding FileUriExposedException.
// Writes go to the Cache directory so no storage permission is required.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

export async function saveAndShareBlob(blob, filename, dialogTitle = 'Share') {
  if (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const writeRes = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      await Share.share({
        title: dialogTitle,
        dialogTitle,
        files: [writeRes.uri],
      });
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (!/cancel/i.test(msg)) throw e;
    }
    return writeRes.uri;
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
