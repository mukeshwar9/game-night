import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import Demo from './pages/Demo';
import DailyGame from './pages/DailyGame';
import Profile from './pages/Profile';
import Friends from './pages/Friends';
import NotFound from './pages/NotFound';
import { Toaster } from './components/ui/sonner';
import UpdatePrompt from './components/UpdatePrompt';
import ConnectionBanner from './components/ConnectionBanner';
import InviteToasts from './components/InviteToasts';
import BottomTabBar from './components/BottomTabBar';
import NavBar, { HomeInterceptProvider } from './components/NavBar';
import { AuthProvider } from './lib/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';

// Persistent Home/Daily/Friends/Profile tab bar — only on the four meta
// routes. Game rooms and /demo stay bar-free so it doesn't cover controls.
const TAB_BAR_ROUTES = ['/', '/daily', '/friends', '/profile'];

// M-61 + M-84: reset scroll and replay a short fade on every route change.
// `key={pathname}` remounts the wrapper so the CSS animation (index.css
// .route-fade) restarts. NavBar + BottomTabBar live *outside* this wrapper:
// the fade used to keep a transform on the ancestor, which trapped
// position:fixed/sticky descendants so the footer scrolled away.
function AppRoutes() {
  const { pathname } = useLocation();
  const showTabBar = TAB_BAR_ROUTES.includes(pathname);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <NavBar />
      <div key={pathname} className="route-fade">
        {/* Bottom padding clears the fixed tab bar so page content (including
            bottom-of-page CTAs like Home's install prompt) never sits under it. */}
        <div className={showTabBar ? 'pb-[calc(3.75rem+env(safe-area-inset-bottom))]' : undefined}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameId" element={<Game />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/solo/:type" element={<Demo />} />
            <Route path="/daily" element={<DailyGame />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
      {showTabBar && <BottomTabBar />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <HomeInterceptProvider>
            <AppRoutes />
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
