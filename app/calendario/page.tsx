'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { generarPlanAction, recalcularPlanAction, chatAsistenteAction } from './actions'
import { calcularCargaAlostatica } from '@/lib/fatigaService'
import CalendarMonth from '@/components/calendar/CalendarMonth'

export default function CalendarioPage() {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState<any>(null)
  const [userId, setUserId] = useState<string>('')
  const [ca, setCa] = useState<any>(null)
  const [planGenerado, setPlanGenerado] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [showConfirmRecalc, setShowConfirmRecalc] = useState(false)
  const [showModalPlan, setShowModalPlan] = useState(false)
  const [instruccionesLibres, setInstruccionesLibres] = useState('')

  const [chatAbierto, setChatAbierto] = useState(false)
  const [mensajesChat, setMensajesChat] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: '¡Hola! Soy tu asistente de entrenamiento. Puedo ayudarte a ajustar tu plan, responder dudas o hacer cambios. ¿En qué te ayudo?' }
  ])
  const [inputChat, setInputChat] = useState('')
  const [cargandoChat, setCargandoChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    setUserId(session.user.id)

    const { data: p } = await supabase
      .from('athlete_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
    setPerfil(p)

    const { data: haySesiones } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', session.user.id)
      .neq('day_type', 'competition')
      .limit(1)
    setPlanGenerado(!!(haySesiones && haySesiones.length > 0))

    // Calcular fechas del mes sin depender de toISOString (evita bug de zona horaria)
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth()
    const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data: s } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', startStr)
      .lte('date', endStr)
    setSessions(s || [])

    const caHoy = await calcularCargaAlostatica(session.user.id, null)
    setCa(caHoy)

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [currentDate])
  useEffect(() => {
    if (chatAbierto) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajesChat, chatAbierto])

  const handleGenerarPlan = async () => {
    if (!perfil) return
    setGenerando(true)
    try {
      const hoy = new Date().toISOString().split('T')[0]
      const fin = new Date()
      fin.setMonth(fin.getMonth() + 3)
      const fechaFin = fin.toISOString().split('T')[0]

      const { data: competiciones } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId).eq('day_type', 'competition')

      const resultado = await generarPlanAction(perfil, competiciones || [], hoy, fechaFin, instruccionesLibres)

      if (resultado?.sesiones) {
        const fechasConCompeticion = new Set((competiciones || []).map((c: any) => c.date))
        const nuevasSesiones = resultado.sesiones
          .filter((s: any) => !fechasConCompeticion.has(s.date))
          .map((s: any) => ({ ...s, user_id: userId, type: s.day_type || 'training' }))
        await supabase.from('sessions').insert(nuevasSesiones)
        setPlanGenerado(true)
        await fetchData()
      }
    } catch (err) {
      console.error('Error generando plan:', err)
    }
    setGenerando(false)
  }

  const handleRecalcular = async () => {
    setShowConfirmRecalc(false)
    setGenerando(true)
    try {
      const hoy = new Date().toISOString().split('T')[0]

      const { data: todasSesiones } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId).gte('date', hoy)

      const { data: competiciones } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId).eq('day_type', 'competition')

      const resultado = await recalcularPlanAction(
        perfil, todasSesiones || [], competiciones || [],
        ca || { ca: 3, estado: 'Moderado', recomendacion: 'Según plan', acr: 1, componentes: {} },
        'Recálculo manual solicitado por el usuario',
        instruccionesLibres
      )

      if (resultado?.sesiones) {
        await supabase.from('sessions').delete()
          .eq('user_id', userId).gte('date', hoy).neq('day_type', 'competition')

        const nuevasSesiones = resultado.sesiones.map((s: any) => ({
          ...s, user_id: userId, type: s.day_type || 'training',
        }))
        await supabase.from('sessions').insert(nuevasSesiones)
        await fetchData()
      }
    } catch (err) {
      console.error('Error recalculando plan:', err)
    }
    setGenerando(false)
  }

  const handleEnviarChat = async () => {
    if (!inputChat.trim() || cargandoChat) return
    const nuevoMensaje = { role: 'user', content: inputChat }
    const historial = [...mensajesChat, nuevoMensaje]
    setMensajesChat(historial)
    setInputChat('')
    setCargandoChat(true)
    try {
      const contexto = {
        perfil, ca,
        sesionesProximas: sessions
          .filter(s => s.date >= new Date().toISOString().split('T')[0])
          .slice(0, 10),
      }
      const respuesta = await chatAsistenteAction(
        historial.map(m => ({ role: m.role, content: m.content })), contexto
      )
      if (respuesta) setMensajesChat([...historial, { role: 'assistant', content: respuesta }])
    } catch (err) {
      console.error('Error en chat:', err)
    }
    setCargandoChat(false)
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const monthName = currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })

  const caColor = ca
    ? ca.ca <= 2.0 ? 'text-green-400'
    : ca.ca <= 3.0 ? 'text-blue-400'
    : ca.ca <= 3.9 ? 'text-yellow-400'
    : 'text-red-400'
    : 'text-gray-400'

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-widest">CURTIMIENTO</h1>
            <a href="/perfil"
              className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl transition">
              👤 Perfil
            </a>
          </div>
          <div className="flex items-center gap-3">
            {ca && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm">
                <span className="text-gray-500">CA </span>
                <span className={`font-bold ${caColor}`}>{ca.ca}</span>
                <span className="text-gray-500 text-xs ml-1">— {ca.estado}</span>
              </div>
            )}
            <div className="flex bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button onClick={() => setView('month')}
                className={`px-4 py-2 text-sm transition ${view === 'month' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                Mes
              </button>
              <button onClick={() => setView('week')}
                className={`px-4 py-2 text-sm transition ${view === 'week' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                Semana
              </button>
            </div>
            <button
              onClick={() => planGenerado ? setShowConfirmRecalc(true) : setShowModalPlan(true)}
              disabled={generando || !perfil}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2">
              {generando ? (
                <><span className="animate-spin">⟳</span> Generando...</>
              ) : planGenerado ? '⟳ Recalcular plan' : '⚡ Generar plan'}
            </button>
          </div>
        </div>

        {!perfil && !loading && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-3 mb-4 text-sm text-yellow-300">
            ⚠️ Completa tu <a href="/perfil" className="underline">perfil de atleta</a> antes de generar el plan.
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition">←</button>
          <h2 className="text-lg font-medium capitalize">{monthName}</h2>
          <button onClick={nextMonth} className="text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition">→</button>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-20">Cargando...</div>
        ) : (
          <CalendarMonth
            currentDate={currentDate}
            sessions={sessions}
            onRefresh={fetchData}
            schedulePattern={perfil?.schedule_pattern}
          />
        )}
      </div>

      {showModalPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-800 p-6">
            <h3 className="font-semibold text-lg mb-2">⚡ Generar plan</h3>
            <p className="text-gray-400 text-sm mb-4">
              ¿Alguna instrucción especial para la IA? Por ejemplo: prioridades, lesiones, preferencias...
            </p>
            <textarea
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={4}
              placeholder="Ej: Prioriza el running, tengo tendencia a lesionarme la rodilla derecha..."
              value={instruccionesLibres}
              onChange={e => setInstruccionesLibres(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowModalPlan(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm transition">
                Cancelar
              </button>
              <button onClick={() => { setShowModalPlan(false); handleGenerarPlan() }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-xl text-sm font-medium transition">
                Generar plan
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmRecalc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-800 p-6">
            <h3 className="font-semibold text-lg mb-2">⟳ Recalcular plan</h3>
            <p className="text-gray-400 text-sm mb-4">
              Se reemplazarán todas las sesiones futuras. Las pasadas y competiciones no se tocarán.
            </p>
            <textarea
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
              rows={3}
              placeholder="Instrucciones opcionales para la IA: cambios de objetivo, lesiones, preferencias..."
              value={instruccionesLibres}
              onChange={e => setInstruccionesLibres(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmRecalc(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm transition">
                Cancelar
              </button>
              <button onClick={handleRecalcular}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-xl text-sm font-medium transition">
                Sí, recalcular
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-40">
        {chatAbierto && (
          <div className="w-80 bg-gray-900 border border-purple-900 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            style={{ height: '420px' }}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
              <div>
                <div className="text-sm font-medium text-white">✦ Asistente CURTIMIENTO</div>
                <div className="text-xs text-purple-400">Contexto completo de tu plan</div>
              </div>
              <button onClick={() => setChatAbierto(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {mensajesChat.map((m, i) => (
                <div key={i} className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="text-xs text-gray-500">{m.role === 'user' ? 'Tú' : 'Asistente'}</div>
                  <div className={`text-xs rounded-xl px-3 py-2 max-w-[85%] leading-relaxed ${
                    m.role === 'user' ? 'bg-blue-900 text-blue-100' : 'bg-gray-800 text-gray-200'
                  }`}>{m.content}</div>
                </div>
              ))}
              {cargandoChat && (
                <div className="flex items-start gap-1">
                  <div className="text-xs bg-gray-800 text-gray-400 rounded-xl px-3 py-2 animate-pulse">Pensando...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-gray-800 flex gap-2">
              <input
                className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="Escribe al asistente..."
                value={inputChat}
                onChange={e => setInputChat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnviarChat()}
              />
              <button onClick={handleEnviarChat} disabled={cargandoChat}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl px-3 py-2 text-xs transition">
                →
              </button>
            </div>
          </div>
        )}
        <button onClick={() => setChatAbierto(!chatAbierto)}
          className="w-12 h-12 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center text-xl shadow-lg transition">
          {chatAbierto ? '✕' : '✦'}
        </button>
      </div>
    </div>
  )
}