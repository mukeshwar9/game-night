import { useEffect, useState } from 'react';

const isIosDevice = () =>
  typeof navigator !== 'undefined' &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !navigator.standalone;

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [isIos] = useState(isIosDevice);

  useEffect(() => {
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
