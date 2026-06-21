import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import Demo from './pages/Demo';
import DailyGame from './pages/DailyGame';
import Profile from './pages/Profile';
import Friends from './pages/Friends';
import { Toaster } from './components/ui/sonner';
import UpdatePrompt from './components/UpdatePrompt';
import { AuthProvider } from './lib/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameId" element={<Game />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/daily" element={<DailyGame />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/friends" element={<Friends />} />
          </Routes>
          <Toaster />
          <UpdatePrompt />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
