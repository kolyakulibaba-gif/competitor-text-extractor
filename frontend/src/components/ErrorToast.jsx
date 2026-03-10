import { useEffect } from 'react'
import './ErrorToast.css'

export default function ErrorToast({ message, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  return (
    <div className="error-toast" role="alert">
      <div className="error-toast-inner">
        <svg className="error-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span className="error-message">{message}</span>
        <button className="error-close" onClick={onDismiss} aria-label="Закрыть">✕</button>
      </div>
      <div className="error-toast-progress" />
    </div>
  )
}
