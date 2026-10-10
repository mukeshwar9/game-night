import { useEffect, useState } from 'react';
import { isInAppBrowser } from '../lib/uaLogic';
import { isNative } from '../lib/platform';

const isIosDevice = () =>
  typeof navigator !== 'undefined' &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !navigator.standalone &&
  // Already installed: this is the store app, not a browser tab.
  !isNative &&
  // "Share → Add to Home Screen" does not exist inside an in-app browser.
  !isInAppBrowser();

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [isIos] = useState(isIosDevice);

  useEffect(() => {
    if (isNative) return undefined;
    const onPrompt = e => { e.preventDefault(); setPrompt(e); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  return { canInstall: !!prompt && !installed, install, isIos };
}
