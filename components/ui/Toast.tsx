'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type TipoToast = 'error' | 'success' | 'info'

interface Toast {
  id: number
  mensaje: string
  tipo: TipoToast
}

interface ToastContextValue {
  notificar: (mensaje: string, tipo?: TipoToast) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ESTILOS: Record<TipoToast, { border: string; icono: string; iconColor: string }> = {
  error:   { border: 'border-red-800',   icono: '⚠️', iconColor: 'text-red-400' },
  success: { border: 'border-green-800', icono: '✓',  iconColor: 'text-green-400' },
  info:    { border: 'border-blue-800',  icono: 'ℹ️', iconColor: 'text-blue-400' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const quitar = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const notificar = useCallback((mensaje: string, tipo: TipoToast = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, mensaje, tipo }])
    // Auto-cierre a los 6 segundos (los errores duran un poco más para poder leerlos)
    const duracion = tipo === 'error' ? 8000 : 5000
    setTimeout(() => quitar(id), duracion)
  }, [quitar])

  return (
    <ToastContext.Provider value={{ notificar }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-md px-4 pointer-events-none">
        {toasts.map(t => {
          const estilo = ESTILOS[t.tipo]
          return (
            <div key={t.id}
              className={`pointer-events-auto bg-gray-900 border ${estilo.border} rounded-xl px-4 py-3 shadow-2xl flex items-start gap-3 animate-[fadeIn_0.2s_ease-out]`}>
              <span className={`text-sm ${estilo.iconColor} mt-0.5`}>{estilo.icono}</span>
              <span className="text-sm text-gray-200 flex-1 leading-snug">{t.mensaje}</span>
              <button onClick={() => quitar(t.id)}
                className="text-gray-500 hover:text-white text-sm transition leading-none">✕</button>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback seguro si algún componente queda fuera del provider: no rompe la app.
    return { notificar: () => {} }
  }
  return ctx
}