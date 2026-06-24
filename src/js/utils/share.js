// Save a PDF blob to device storage (using Capacitor Filesystem when available)
// and offer it via the Android share sheet. In a web preview, falls back to a
// download anchor.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const s = String(fr.result || '');
      // strip "data:...;base64," prefix
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
      directory: Directory.Documents,
      recursive: true,
    });
    try {
      await Share.share({
        title: dialogTitle,
        url: writeRes.uri,
        dialogTitle,
      });
    } catch (e) {
      // user cancelled — that's fine
    }
    return writeRes.uri;
  }
  // Web fallback
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
