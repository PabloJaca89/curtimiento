'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Alcance = 'todo' | 'futuro' | 'pasado'

export default function BorrarPlanModal({
  userId, onClose, onDone,
}: {
  userId: string
  onClose: () => void
  onDone: () => void
}) {
  const { notificar } = useToast()

  const [alcance, setAlcance] = useState<Alcance>('futuro')
  const [conservarComp, setConservarComp] = useState(true)
  const [conservarCompromiso, setConservarCompromiso] = useState(true)
  const [borrarDureza, setBorrarDureza] = useState(false)
  const [durezaDesde, setDurezaDesde] = useState('')

  const [paso, setPaso] = useState<'config' | 'confirmando'>('config')
  const [calculando, setCalculando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [idsSesiones, setIdsSesiones] = useState<string[]>([])
  const [numDureza, setNumDureza] = useState(0)

  const alcanceLabel: Record<Alcance, string> = {
    todo: 'todo el plan (pasado y futuro)',
    futuro: 'solo las sesiones de hoy en adelante',
    pasado: 'solo las sesiones anteriores a hoy',
  }

  // Paso 1 → 2: calcula qué se va a borrar realmente y pasa a la confirmación.
  const handleContinuar = async () => {
    if (!userId) return
    setCalculando(true)
    try {
      const hoy = toStr(new Date())

      let sel = supabase.from('sessions').select('id, day_type').eq('user_id', userId)
      if (alcance === 'futuro') sel = sel.gte('date', hoy)
      else if (alcance === 'pasado') sel = sel.lt('date', hoy)

      const { data: candidatas, error } = await sel
      if (error) {
        notificar('No se pudo preparar el borrado. Inténtalo de nuevo.', 'error')
        setCalculando(false)
        return
      }

      const ids = (candidatas || [])
        .filter((s: { day_type?: string }) => {
          if (conservarComp && s.day_type === 'competition') return false
          if (conservarCompromiso && s.day_type === 'compromise') return false
          return true
        })
        .map((s: { id: string }) => s.id)
      setIdsSesiones(ids)

      let cntDureza = 0
      if (borrarDureza) {
        let d = supabase
          .from('weekly_load_ratings')
          .select('semana_inicio', { count: 'exact', head: true })
          .eq('user_id', userId)
        if (durezaDesde) d = d.gte('semana_inicio', durezaDesde)
        const { count } = await d
        cntDureza = count || 0
      }
      setNumDureza(cntDureza)

      setPaso('confirmando')
    } catch {
      notificar('No se pudo preparar el borrado. Inténtalo de nuevo.', 'error')
    }
    setCalculando(false)
  }

  // Paso 2: ejecuta el borrado definitivo.
  const handleBorrar = async () => {
    setBorrando(true)
    try {
      if (idsSesiones.length > 0) {
        const { error } = await supabase.from('sessions').delete().in('id', idsSesiones)
        if (error) {
          notificar('No se pudieron borrar las sesiones. No se ha borrado nada.', 'error')
          setBorrando(false)
          return
        }
      }

      if (borrarDureza) {
        let d = supabase.from('weekly_load_ratings').delete().eq('user_id', userId)
        if (durezaDesde) d = d.gte('semana_inicio', durezaDesde)
        const { error: errDureza } = await d
        if (errDureza) {
          notificar('Las sesiones se borraron, pero no el histórico de dureza. Revisa las estadísticas.', 'info')
          onDone()
          onClose()
          return
        }
      }

      notificar('Borrado completado.', 'success')
      onDone()
      onClose()
    } catch {
      notificar('Hubo un error durante el borrado.', 'error')
      setBorrando(false)
    }
  }

  const toggleClass = (activo: boolean) =>
    `flex-1 py-2.5 rounded-xl text-xs font-medium border transition ${
      activo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500'
    }`

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-800 p-6 max-h-[90vh] overflow-y-auto">

        {paso === 'config' ? (
          <>
            <h3 className="font-semibold text-lg mb-1 text-red-400">🗑️ Borrar planificación</h3>
            <p className="text-gray-400 text-sm mb-5">
              Elige qué quieres eliminar. Podrás revisar el resumen antes de confirmar.
            </p>

            <div className="mb-5">
              <label className="text-xs text-gray-400 mb-2 block">¿Qué periodo?</label>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setAlcance('todo')} className={toggleClass(alcance === 'todo')}>Todo</button>
                <button onClick={() => setAlcance('futuro')} className={toggleClass(alcance === 'futuro')}>Solo futuro</button>
                <button onClick={() => setAlcance('pasado')} className={toggleClass(alcance === 'pasado')}>Solo pasado</button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {alcance === 'futuro' && 'Se borrarán las sesiones de hoy en adelante.'}
                {alcance === 'pasado' && 'Se borrarán las sesiones anteriores a hoy.'}
                {alcance === 'todo' && 'Se borrarán todas las sesiones, pasadas y futuras.'}
              </p>
            </div>

            <div className="mb-5">
              <label className="text-xs text-gray-400 mb-2 block">Conservar (no se borrarán)</label>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                  <span className="text-sm text-gray-300">🏁 Competiciones</span>
                  <div className="flex gap-2">
                    <button onClick={() => setConservarComp(true)}
                      className={`px-3 py-1 rounded-lg text-xs border transition ${conservarComp ? 'bg-green-700 border-green-700 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                      Conservar
                    </button>
                    <button onClick={() => setConservarComp(false)}
                      className={`px-3 py-1 rounded-lg text-xs border transition ${!conservarComp ? 'bg-red-700 border-red-700 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                      Borrar
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                  <span className="text-sm text-gray-300">📅 Compromisos</span>
                  <div className="flex gap-2">
                    <button onClick={() => setConservarCompromiso(true)}
                      className={`px-3 py-1 rounded-lg text-xs border transition ${conservarCompromiso ? 'bg-green-700 border-green-700 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                      Conservar
                    </button>
                    <button onClick={() => setConservarCompromiso(false)}
                      className={`px-3 py-1 rounded-lg text-xs border transition ${!conservarCompromiso ? 'bg-red-700 border-red-700 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                      Borrar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <label className="text-xs text-gray-400 mb-2 block">Estadísticas</label>
              <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                <span className="text-sm text-gray-300">📊 Histórico de dureza semanal</span>
                <div className="flex gap-2">
                  <button onClick={() => setBorrarDureza(false)}
                    className={`px-3 py-1 rounded-lg text-xs border transition ${!borrarDureza ? 'bg-green-700 border-green-700 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                    Conservar
                  </button>
                  <button onClick={() => setBorrarDureza(true)}
                    className={`px-3 py-1 rounded-lg text-xs border transition ${borrarDureza ? 'bg-red-700 border-red-700 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                    Borrar
                  </button>
                </div>
              </div>
              {borrarDureza && (
                <div className="mt-2 bg-gray-800 rounded-xl px-4 py-3">
                  <label className="text-xs text-gray-400 mb-1 block">Borrar dureza desde (incluido). Vacío = todo el histórico.</label>
                  <input type="date" value={durezaDesde} onChange={e => setDurezaDesde(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm transition">
                Cancelar
              </button>
              <button onClick={handleContinuar} disabled={calculando}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 py-3 rounded-xl text-sm font-medium transition">
                {calculando ? 'Calculando...' : 'Continuar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-lg mb-1 text-red-400">Confirmar borrado</h3>
            <p className="text-gray-400 text-sm mb-4">Revisa lo que se va a eliminar. Esta acción es permanente y no se puede deshacer.</p>

            <div className="bg-gray-800 rounded-xl px-4 py-3 mb-4 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-red-400">•</span>
                <span className="text-gray-200">
                  <span className="font-semibold">{idsSesiones.length}</span> sesiones ({alcanceLabel[alcance]}).
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                <span className="text-gray-400">
                  Se conservan: {[
                    conservarComp ? 'competiciones' : null,
                    conservarCompromiso ? 'compromisos' : null,
                  ].filter(Boolean).join(' y ') || 'nada especial'}.
                </span>
              </div>
              {borrarDureza && (
                <div className="flex items-start gap-2">
                  <span className="text-red-400">•</span>
                  <span className="text-gray-200">
                    <span className="font-semibold">{numDureza}</span> registros de dureza semanal
                    {durezaDesde ? ` desde el ${new Date(durezaDesde + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}` : ' (todo el histórico)'}.
                  </span>
                </div>
              )}
            </div>

            {idsSesiones.length === 0 && !borrarDureza && (
              <p className="text-yellow-400 text-sm mb-4">No hay nada que borrar con estas opciones.</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setPaso('config')} disabled={borrando}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm transition disabled:opacity-50">
                ← Atrás
              </button>
              <button onClick={handleBorrar} disabled={borrando || (idsSesiones.length === 0 && !borrarDureza)}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 py-3 rounded-xl text-sm font-medium transition">
                {borrando ? 'Borrando...' : 'Sí, borrar definitivamente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}