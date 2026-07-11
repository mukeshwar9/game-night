// Shared "nothing here yet" treatment (M-85): bordered card + brief pixel-caps
// copy, used anywhere a list/stat block has no content yet (GamePicker filters,
// Home/Profile stats, Friends list).
export default function EmptyState({ children }) {
  return (
    <div className="bg-retro-card border border-retro-border rounded p-4 text-center">
      <p className="font-pixel text-[9px] text-retro-dim tracking-wider">{children}</p>
    </div>
  )
}
