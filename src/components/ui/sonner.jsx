import { Toaster as Sonner } from 'sonner'

export function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
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
          error: 'border-retro-p2!',
        },
      }}
      {...props}
    />
  )
}
