import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import PixelDots from './components/loading/PixelDots';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { Toaster } from './components/ui/sonner';
import UpdatePrompt from './components/UpdatePrompt';
import useSWUpdateCheck from './hooks/useSWUpdateCheck';
import ConnectionBanner from './components/ConnectionBanner';
import InviteToasts from './components/InviteToasts';
import PremiumHost from './components/premium/PremiumHost';
import AvatarStudioHost from './components/AvatarStudioHost';
import { ViewAsPlayerBadge } from './components/premium/ViewAsPlayer';
import PaddleCheckoutHost from './components/premium/PaddleCheckoutHost';
import BottomTabBar from './components/BottomTabBar';
import NavBar, { HomeInterceptProvider, TAB_BAR_ROUTES } from './components/NavBar';
import { AuthProvider } from './lib/AuthContext';
import { authReady } from './lib/auth';
import useOnboardingOpen from './hooks/useOnboardingOpen';
import ErrorBoundary from './components/ErrorBoundary';
import { VideoCallLayoutProvider } from './components/VideoCallLayout';
import { LEADERBOARD_ENABLED } from './lib/features';
import { titleForPath } from './lib/routeTitle';
import { createScrollMemory, scrollTargetFor } from './lib/scrollMemory';
import { monetizationEnabled } from './lib/monetizationState';

// The shop and Pass routes exist only while monetization is switched on (monetization.js).
const SHOP_ROUTES = monetizationEnabled();
import { onNavigateRequest, notifyFirstScreen } from './lib/native/navigation';
import { isNative } from './lib/platform';

// Home (the landing page) and NotFound stay in the entry chunk; every other
// route downloads on first visit. lazyWithRetry reloads once if a chunk from
// an older deploy has been deleted.
const Games = lazyWithRetry(() => import('./pages/Games'));
const OnlineLobby = lazyWithRetry(() => import('./pages/OnlineLobby'));
const Game = lazyWithRetry(() => import('./pages/Game'));
const Demo = lazyWithRetry(() => import('./pages/Demo'));
const AdLanding = lazyWithRetry(() => import('./pages/AdLanding'));
const DailyGame = lazyWithRetry(() => import('./pages/DailyGame'));
const DailyMemory = lazyWithRetry(() => import('./pages/DailyMemory'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const Friends = lazyWithRetry(() => import('./pages/Friends'));
const Shop = lazyWithRetry(() => import('./pages/Shop'));
const Pass = lazyWithRetry(() => import('./pages/Pass'));
const Notes = lazyWithRetry(() => import('./pages/Notes'));
// Developer-only page: the route (and so its chunk) exists in dev builds only.
const EmojiLab = import.meta.env.DEV ? lazyWithRetry(() => import('./pages/EmojiLab')) : null;
const ArtDemo = import.meta.env.DEV ? lazyWithRetry(() => import('./pages/ArtDemo')) : null;
// Hidden for launch (features.js): no route, so the chunk is never requested.
const Leaderboard = LEADERBOARD_ENABLED ? lazyWithRetry(() => import('./pages/Leaderboard')) : null;
const Playground = lazyWithRetry(() => import('./pages/Playground'));
// Store builds only: the web never downloads the minimum-version gate. The
// chunk is bundled in the app, so a plain lazy() needs no retry.
const NativeUpdateGate = isNative ? lazy(() => import('./components/NativeUpdateGate')) : null;

// Shown while a route's chunk downloads — the same PixelDots as the boot
// splash (ConnectingSplash in AuthContext), minus its INSERT COIN line.
function RouteFallback() {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center">
      <PixelDots size="lg" glow />
    </div>
  );
}

// Offsets per history entry (lib/scrollMemory.js). The browser's own
// restoration is off: it runs before a lazy route has any height.
const scrollMemory = createScrollMemory();
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Scrolls to y once the page is tall enough (a lazy route renders after a
// frame or two), giving up after about a second.
function restoreScroll(y) {
  let tries = 0;
  const step = () => {
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && ++tries < 60) requestAnimationFrame(step);
  };
  step();
}

// M-61 + M-84: replay a short fade on every route change, and start a new
// page at the top while back/forward returns to where the player was.
// `key={pathname}` remounts the wrapper so the CSS animation (index.css
// .route-fade) restarts. NavBar + BottomTabBar live *outside* this wrapper:
// the fade used to keep a transform on the ancestor, which trapped
// position:fixed/sticky descendants so the footer scrolled away.
function AppRoutes() {
  const location = useLocation();
  const { pathname } = location;
  const navigationType = useNavigationType();
  // First-run onboarding covers Home until the visitor has a name; every tab
  // would only lead back to it, so the bar waits until it closes.
  const onboarding = useOnboardingOpen();
  const showTabBar = TAB_BAR_ROUTES.includes(pathname) && !onboarding;

  useEffect(() => {
    const y = scrollTargetFor(navigationType, scrollMemory.get(location.key));
    if (y > 0) restoreScroll(y);
    else window.scrollTo(0, 0);
    document.title = titleForPath(pathname);
    // Only a new page moves the scroll, not a search-param change on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Remember this entry's offset as the player scrolls.
  useEffect(() => {
    const key = location.key;
    let frame = 0;
    const onScroll = () => {
      // A route change can clamp the old page's offset before this listener
      // is removed; only the entry the browser is on may save.
      if (window.history.state?.key && window.history.state.key !== key) return;
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; scrollMemory.save(key, window.scrollY); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [location.key]);

  // AppRoutes only mounts once auth has settled: the first screen is up, so
  // the native splash (no-op on the web) can go.
  useEffect(() => { notifyFirstScreen(); }, []);

  // Native shell: a tapped notification, an opened invite link or the Android
  // back button asks for a route (lib/native/navigation.js). Never fires on the web.
  const navigate = useNavigate();
  useEffect(() => onNavigateRequest((path) => navigate(path)), [navigate]);

  return (
    <>
      {SHOP_ROUTES && <PaddleCheckoutHost />}
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
              <Route path="/play" element={<AdLanding />} />
              <Route path="/play/:type" element={<AdLanding />} />
              <Route path="/local/:type" element={<Demo mode="local" />} />
              <Route path="/daily" element={<DailyGame />} />
              <Route path="/daily/memory" element={<DailyMemory />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/friends" element={<Friends />} />
              {SHOP_ROUTES && <Route path="/shop" element={<Shop />} />}
              {SHOP_ROUTES && <Route path="/pass" element={<Pass />} />}
              <Route path="/notes" element={<Notes />} />
              {EmojiLab && <Route path="/emoji-lab" element={<EmojiLab />} />}
              {ArtDemo && <Route path="/art-demo" element={<ArtDemo />} />}
              {Leaderboard && <Route path="/leaderboard" element={<Leaderboard />} />}
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
  useSWUpdateCheck()
  return (
    <ErrorBoundary>
      <SlowBootNotice />
      <AuthProvider>
        <BrowserRouter>
          <HomeInterceptProvider>
            <VideoCallLayoutProvider><AppRoutes /></VideoCallLayoutProvider>
            <Toaster />
            <InviteToasts />
            <AvatarStudioHost />
            <PremiumHost />
            <ViewAsPlayerBadge />
            <UpdatePrompt />
            {NativeUpdateGate && <Suspense fallback={null}><NativeUpdateGate /></Suspense>}
            <ConnectionBanner />
          </HomeInterceptProvider>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
