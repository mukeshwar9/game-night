import { Toaster as Sonner } from 'sonner'

export function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      closeButton
      // Toasts sit below the sticky NavBar / room toolbar (~56px + safe
      // area) so alerts never cover header controls or the OS gesture zone.
      offset={{ top: 'max(4rem, env(safe-area-inset-top))' }}
      mobileOffset={{ top: 'max(4rem, env(safe-area-inset-top))' }}
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
