import { Toaster as Sonner } from 'sonner'

export function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      closeButton
      // M-34: sonner's default mobile offset is a flat 16px with no
      // safe-area awareness — on an iPhone home-indicator that puts a
      // tappable JOIN/action button inside the OS gesture zone.
      mobileOffset={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
      toastOptions={{
        style: {
          background: 'rgb(var(--c-surface))',
          border: '1px solid rgb(var(--c-border))',
          color: 'rgb(var(--c-text))',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          letterSpacing: '0.05em',
          borderRadius: '4px',
        },
        classNames: {
          success: 'border-retro-p1!',
          // M-86: dedicated danger token — error toasts no longer borrow
          // Player O's identity color.
          error: 'border-retro-danger!',
          // M-59: explicit on-brand dismiss control so declining/closing a
          // toast (e.g. an invite) never depends on swipe-to-dismiss alone.
          closeButton: 'bg-retro-card! border-retro-border! text-retro-dim! hover:text-retro-text! hover:bg-retro-tint-cta!',
        },
      }}
      {...props}
    />
  )
}
