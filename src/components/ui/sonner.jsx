import { Toaster as Sonner } from 'sonner'

export function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      toastOptions={{
        style: {
          background: '#0f0f1a',
          border: '1px solid #1e1e3a',
          color: '#e0e0ff',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          letterSpacing: '0.05em',
          borderRadius: '4px',
        },
        classNames: {
          success: 'border-retro-cyan!',
          error: 'border-retro-pink!',
        },
      }}
      {...props}
    />
  )
}
