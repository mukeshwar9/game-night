import { Link } from 'react-router-dom'
import NavBar from '../components/NavBar'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col">
      <NavBar />
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4">
        <p className="font-pixel text-[10px] text-retro-p2 text-center max-w-xs leading-relaxed">
          404 — NOTHING AT THIS ADDRESS
        </p>
        <Link to="/" className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity">
          ← BACK TO HOME
        </Link>
      </div>
    </div>
  )
}
