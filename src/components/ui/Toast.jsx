import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastContext } from './ToastContext'

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((message, { duration = 4000, tone = 'info' } = {}) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 5)
    const newToast = { id, message, tone }

    setToasts((current) => [...current, newToast])

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }, [removeToast])

  const toast = useMemo(
    () => ({
      info: (msg, opts) => addToast(msg, { ...opts, tone: 'info' }),
      success: (msg, opts) => addToast(msg, { ...opts, tone: 'success' }),
      error: (msg, opts) => addToast(msg, { ...opts, tone: 'error' }),
      warning: (msg, opts) => addToast(msg, { ...opts, tone: 'warning' }),
      dismiss: removeToast,
    }),
    [addToast, removeToast],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map(({ id, message, tone }) => (
          <div key={id} className={`toast-item toast-${tone}`} role="status">
            <span className="toast-icon" aria-hidden="true">
              {tone === 'success' && <CheckCircle2 size={18} />}
              {tone === 'error' && <AlertCircle size={18} />}
              {tone === 'warning' && <AlertCircle size={18} />}
              {tone === 'info' && <Info size={18} />}
            </span>
            <span className="toast-message">{message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Cerrar notificación"
              onClick={() => removeToast(id)}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export default ToastProvider


