import NavBar from '../components/NavBar'

// M-69: NavBar's logo is the one persistent, app-wide "go home" affordance —
// this page used to also render its own "← BACK TO HOME" text link, two
// redundant paths to the same place on one screen. NavBar alone now covers it.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col">
      <NavBar />
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4">
        <p className="font-pixel text-[10px] text-retro-p2 text-center max-w-xs leading-relaxed">
          404 — NOTHING AT THIS ADDRESS
        </p>
      </div>
    </div>
  )
}
