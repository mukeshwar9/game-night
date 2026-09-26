import { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import PixelDots from './components/loading/PixelDots';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { Toaster } from './components/ui/sonner';
import UpdatePrompt from './components/UpdatePrompt';
import ConnectionBanner from './components/ConnectionBanner';
import InviteToasts from './components/InviteToasts';
import BottomTabBar from './components/BottomTabBar';
import NavBar, { HomeInterceptProvider, TAB_BAR_ROUTES } from './components/NavBar';
import { AuthProvider } from './lib/AuthContext';
import { authReady } from './lib/auth';
import useOnboardingOpen from './hooks/useOnboardingOpen';
import ErrorBoundary from './components/ErrorBoundary';
import { VideoCallLayoutProvider } from './components/VideoCallLayout';

// Home (the landing page) and NotFound stay in the entry chunk; every other
// route downloads on first visit. lazyWithRetry reloads once if a chunk from
// an older deploy has been deleted.
const Games = lazyWithRetry(() => import('./pages/Games'));
const OnlineLobby = lazyWithRetry(() => import('./pages/OnlineLobby'));
const Game = lazyWithRetry(() => import('./pages/Game'));
const Demo = lazyWithRetry(() => import('./pages/Demo'));
const DailyGame = lazyWithRetry(() => import('./pages/DailyGame'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const Friends = lazyWithRetry(() => import('./pages/Friends'));
const Notes = lazyWithRetry(() => import('./pages/Notes'));
// Developer-only page: the route (and so its chunk) exists in dev builds only.
const EmojiLab = import.meta.env.DEV ? lazyWithRetry(() => import('./pages/EmojiLab')) : null;
const Leaderboard = lazyWithRetry(() => import('./pages/Leaderboard'));
const Playground = lazyWithRetry(() => import('./pages/Playground'));

// Shown while a route's chunk downloads — the same PixelDots as the boot
// splash (ConnectingSplash in AuthContext), minus its INSERT COIN line.
function RouteFallback() {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center">
      <PixelDots size="lg" glow />
    </div>
  );
}

// M-61 + M-84: reset scroll and replay a short fade on every route change.
// `key={pathname}` remounts the wrapper so the CSS animation (index.css
// .route-fade) restarts. NavBar + BottomTabBar live *outside* this wrapper:
// the fade used to keep a transform on the ancestor, which trapped
// position:fixed/sticky descendants so the footer scrolled away.
function AppRoutes() {
  const { pathname } = useLocation();
  // First-run onboarding covers Home until the visitor has a name; every tab
  // would only lead back to it, so the bar waits until it closes.
  const onboarding = useOnboardingOpen();
  const showTabBar = TAB_BAR_ROUTES.includes(pathname) && !onboarding;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <NavBar />
      <div key={pathname} className="route-fade">
        {/* Bottom padding clears the fixed tab bar so page content (including
            bottom-of-page CTAs like Home's install prompt) never sits under it. */}
        <div className={showTabBar ? 'pb-[var(--app-tabbar-h)]' : undefined}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/games" element={<Games />} />
              <Route path="/online" element={<OnlineLobby />} />
              <Route path="/game/:gameId" element={<Game />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/solo/:type" element={<Demo />} />
              <Route path="/local/:type" element={<Demo mode="local" />} />
              <Route path="/daily" element={<DailyGame />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/notes" element={<Notes />} />
              {EmojiLab && <Route path="/emoji-lab" element={<EmojiLab />} />}
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/playground" element={<Playground />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </div>
      </div>
      {showTabBar && <BottomTabBar />}
    </>
  );
}

// The boot splash (ConnectingSplash in AuthContext) waits on authReady(). If
// that hangs — offline, blocked Firebase — say so after 8s and offer a reload,
// instead of an endless INSERT COIN. Rendered beside AuthProvider so it can sit
// over the splash, which owns the whole screen until auth settles.
const SLOW_BOOT_MS = 8000;

function SlowBootNotice() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) setSlow(true); }, SLOW_BOOT_MS);
    authReady().finally(() => {
      settled = true;
      clearTimeout(timer);
      setSlow(false);
    });
    return () => clearTimeout(timer);
  }, []);

  if (!slow) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-3 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <p className="font-mono text-sm text-retro-dim text-center">Still connecting… check your network.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 px-6 border-2 border-retro-cta text-retro-cta font-pixel text-[10px] tracking-widest rounded hover:bg-retro-tint-cta active:scale-95 transition-all"
      >
        RETRY
      </button>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SlowBootNotice />
      <AuthProvider>
        <BrowserRouter>
          <HomeInterceptProvider>
            <VideoCallLayoutProvider><AppRoutes /></VideoCallLayoutProvider>
            <Toaster />
            <InviteToasts />
            <UpdatePrompt />
            <ConnectionBanner />
          </HomeInterceptProvider>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
