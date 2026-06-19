import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import Demo from './pages/Demo';
import DailyGame from './pages/DailyGame';
import { Toaster } from './components/ui/sonner';
import UpdatePrompt from './components/UpdatePrompt';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/:gameId" element={<Game />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/daily" element={<DailyGame />} />
      </Routes>
      <Toaster />
      <UpdatePrompt />
    </BrowserRouter>
  );
}
