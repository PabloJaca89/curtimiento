'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generarPlanAction, recalcularPlanAction, chatAsistenteAction, ajustarVentanaCompeticionAction } from './actions'
import { calcularCargaAlostatica, actualizarDurezaSemanal, obtenerDurezaSemanal } from '@/lib/fatigaService'
import CalendarMonth from '@/components/calendar/CalendarMonth'
import { useToast } from '@/components/ui/Toast'
import { generarICS, descargarICS } from '@/lib/icsExport'
import BorrarPlanModal from '@/components/BorrarPlanModal'

export default function CalendarioPage() {
  const { notificar } = useToast()
  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState<any>(null)
  const [userId, setUserId] = useState<string>('')
  const [ca, setCa] = useState<any>(null)
  const [durezas, setDurezas] = useState<any[]>([])
  const [durezaAbierta, setDurezaAbierta] = useState(false)
  const [sinSaldo, setSinSaldo] = useState(false)
  const [planGenerado, setPlanGenerado] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [showBorrar, setShowBorrar] = useState(false)
  const [showConfirmRecalc, setShowConfirmRecalc] = useState(false)
  const [showModalPlan, setShowModalPlan] = useState(false)
  const [instruccionesLibres, setInstruccionesLibres] = useState('')
  const [compPendiente, setCompPendiente] = useState<any>(null)
  const [showAjusteVentana, setShowAjusteVentana] = useState(false)

  const [showExtenderPlan, setShowExtenderPlan] = useState(false)
  const [ultimaFechaPlan, setUltimaFechaPlan] = useState<string>('')
  const [diasRestantesPlan, setDiasRestantesPlan] = useState<number>(0)
  const extenderDescartadoRef = useRef(false)

  const [chatAbierto, setChatAbierto] = useState(false)
  const [mensajesChat, setMensajesChat] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: '¡Hola! Soy tu asistente de entrenamiento. Puedo ayudarte a ajustar tu plan, responder dudas o hacer cambios. ¿En qué te ayudo?' }
  ])
  const [inputChat, setInputChat] = useState('')
  const [cargandoChat, setCargandoChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setLoading(true)

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
    const hayPlan = !!(haySesiones && haySesiones.length > 0)
    setPlanGenerado(hayPlan)

    // Rango según la vista (mes completo o semana lunes-domingo). Sin toISOString (zona horaria).
    const toS = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    let startStr: string, endStr: string
    if (view === 'week') {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
      const dow = d.getDay(); const diff = dow === 0 ? 6 : dow - 1
      const lunes = new Date(d); lunes.setDate(d.getDate() - diff)
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
      startStr = toS(lunes); endStr = toS(domingo)
    } else {
      const y = currentDate.getFullYear()
      const m = currentDate.getMonth()
      startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const lastDay = new Date(y, m + 1, 0).getDate()
      endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }

    const { data: s } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', startStr)
      .lte('date', endStr)
    setSessions(s || [])

    // Detección de fin de plan: si quedan 30 días o menos, ofrecer generar el siguiente trimestre
    if (hayPlan) {
      const { data: ultima } = await supabase
        .from('sessions')
        .select('date')
        .eq('user_id', session.user.id)
        .neq('day_type', 'competition')
        .order('date', { ascending: false })
        .limit(1)
      if (ultima && ultima.length > 0) {
        const ultimaFecha = ultima[0].date
        setUltimaFechaPlan(ultimaFecha)
        const hoyStr = toS(new Date())
        const dRestantes = Math.floor(
          (new Date(ultimaFecha + 'T12:00:00').getTime() - new Date(hoyStr + 'T12:00:00').getTime()) / 86400000
        )
        setDiasRestantesPlan(dRestantes)
        if (dRestantes <= 30 && !extenderDescartadoRef.current) {
          setShowExtenderPlan(true)
        }
      }
    }

    const caHoy = await calcularCargaAlostatica(session.user.id, null)
    setCa(caHoy)

    // Dureza experimentada: calcula ventanas cerradas pendientes y lee las últimas 4
    await actualizarDurezaSemanal(session.user.id, null)
    const durs = await obtenerDurezaSemanal(session.user.id, 4)
    setDurezas(durs || [])

    setLoading(false)
  }, [currentDate, view])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (chatAbierto) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajesChat, chatAbierto])

  const handleExportarICS = async () => {
    if (!userId) return
    setExportando(true)
    try {
      const { data: todas } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true })

      if (!todas || todas.length === 0) {
        notificar('No hay plan que exportar todavía.', 'info')
        setExportando(false)
        return
      }

      const ics = generarICS(todas)
      descargarICS(ics, 'curtimiento-plan.ics')
      notificar('Plan exportado. Ábrelo para añadirlo a tu calendario.', 'success')
    } catch (err) {
      notificar('No se pudo exportar el plan. Inténtalo de nuevo.', 'error')
    }
    setExportando(false)
  }

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

      if (!resultado?.sesiones || resultado.sesiones.length === 0) {
        notificar('No se pudo generar el plan (la IA no devolvió sesiones). Inténtalo de nuevo.', 'error')
        setGenerando(false)
        return
      }

      const fechasConCompeticion = new Set((competiciones || []).map((c: any) => c.date))
      const nuevasSesiones = resultado.sesiones
        .filter((s: any) => !fechasConCompeticion.has(s.date))
        .map((s: any) => ({ ...s, user_id: userId, type: s.day_type || 'training' }))

      if (nuevasSesiones.length === 0) {
        notificar('No se pudo generar el plan. Inténtalo de nuevo.', 'error')
        setGenerando(false)
        return
      }

      const { error: errorInsert } = await supabase.from('sessions').insert(nuevasSesiones)
      if (errorInsert) {
        notificar('No se pudo guardar el plan generado: ' + errorInsert.message, 'error')
        setGenerando(false)
        return
      }

      setPlanGenerado(true)
      await fetchData()
      notificar('Plan generado correctamente.', 'success')
    } catch (err: any) {
      if (String(err?.message || err).includes('SALDO_INSUFICIENTE')) setSinSaldo(true)
      else notificar('Hubo un error al generar el plan. Inténtalo de nuevo.', 'error')
    }
    setGenerando(false)
  }

  const handleExtenderPlan = async () => {
    if (!perfil || !ultimaFechaPlan) return
    setShowExtenderPlan(false)
    setGenerando(true)
    try {
      const toStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      // El nuevo trimestre empieza el día después de la última sesión planificada
      // (o mañana, si el plan ya terminó en el pasado)
      const dSiguiente = new Date(ultimaFechaPlan + 'T12:00:00')
      dSiguiente.setDate(dSiguiente.getDate() + 1)
      const dManana = new Date()
      dManana.setDate(dManana.getDate() + 1)
      dManana.setHours(12, 0, 0, 0)
      const dInicio = dSiguiente.getTime() >= dManana.getTime() ? dSiguiente : dManana
      const inicioStr = toStr(dInicio)

      const dFin = new Date(dInicio)
      dFin.setMonth(dFin.getMonth() + 3)
      const finStr = toStr(dFin)

      const { data: competiciones } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId).eq('day_type', 'competition')

      const resultado = await generarPlanAction(perfil, competiciones || [], inicioStr, finStr, '')

      if (!resultado?.sesiones || resultado.sesiones.length === 0) {
        notificar('No se pudo generar el siguiente trimestre. Tu plan actual se ha conservado. Inténtalo de nuevo.', 'error')
        setGenerando(false)
        return
      }

      // Solo insertamos sesiones desde el inicio del nuevo trimestre, sin pisar plan existente ni competiciones
      const fechasConCompeticion = new Set((competiciones || []).map((c: any) => c.date))
      const nuevasSesiones = resultado.sesiones
        .filter((s: any) => !fechasConCompeticion.has(s.date) && s.date >= inicioStr)
        .map((s: any) => ({ ...s, user_id: userId, type: s.day_type || 'training' }))

      if (nuevasSesiones.length === 0) {
        notificar('No se pudo generar el siguiente trimestre. Tu plan actual se ha conservado. Inténtalo de nuevo.', 'error')
        setGenerando(false)
        return
      }

      const { error: errorInsert } = await supabase.from('sessions').insert(nuevasSesiones)
      if (errorInsert) {
        notificar('No se pudo guardar el siguiente trimestre. Tu plan actual se ha conservado: ' + errorInsert.message, 'error')
        setGenerando(false)
        return
      }

      extenderDescartadoRef.current = true
      await fetchData()
      notificar('Siguiente trimestre añadido a continuación del plan.', 'success')
    } catch (err: any) {
      if (String(err?.message || err).includes('SALDO_INSUFICIENTE')) setSinSaldo(true)
      else notificar('Hubo un error al generar el siguiente trimestre. Tu plan actual se ha conservado.', 'error')
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

      // Historial de las últimas 4 semanas (sesiones pasadas completadas con RPE):
      // se usa para comparar RPE percibida vs carga planificada en el recálculo.
      const hace28 = new Date()
      hace28.setDate(hace28.getDate() - 28)
      const hace28Str = hace28.toISOString().split('T')[0]

      const { data: historial } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId)
        .eq('day_type', 'training')
        .eq('completed', true)
        .gte('date', hace28Str)
        .lt('date', hoy)

      const { data: competiciones } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId).eq('day_type', 'competition')

      const resultado = await recalcularPlanAction(
        perfil, historial || [], competiciones || [],
        ca || { ca: 3, estado: 'Moderado', recomendacion: 'Según plan', acr: 1, componentes: {} },
        'Recálculo manual solicitado por el usuario',
        instruccionesLibres
      )

      // 1. Si la IA no devolvió sesiones válidas, NO tocamos nada.
      if (!resultado?.sesiones || resultado.sesiones.length === 0) {
        notificar('No se pudo recalcular el plan (la IA no devolvió sesiones). Tu plan actual se ha conservado. Inténtalo de nuevo.', 'error')
        setGenerando(false)
        return
      }

      const fechasConCompeticion = new Set((competiciones || []).map((c: any) => c.date))
      const nuevasSesiones = resultado.sesiones
        .filter((s: any) => !fechasConCompeticion.has(s.date))
        .map((s: any) => ({ ...s, user_id: userId, type: s.day_type || 'training' }))

      if (nuevasSesiones.length === 0) {
        notificar('No se pudo recalcular el plan. Tu plan actual se ha conservado. Inténtalo de nuevo.', 'error')
        setGenerando(false)
        return
      }

      // 2. PRIMERO insertamos las nuevas. Si falla, NO borramos nada.
      const { error: errorInsert } = await supabase.from('sessions').insert(nuevasSesiones)
      if (errorInsert) {
        notificar('No se pudo guardar el plan recalculado. Tu plan actual se ha conservado: ' + errorInsert.message, 'error')
        setGenerando(false)
        return
      }

      // 3. Solo si la inserción fue bien, borramos las viejas (por su id, sin tocar las recién creadas ni las competiciones).
      const idsAntiguos = (todasSesiones || [])
        .filter((s: any) => s.day_type !== 'competition')
        .map((s: any) => s.id)

      if (idsAntiguos.length > 0) {
        const { error: errorDelete } = await supabase.from('sessions')
          .delete().in('id', idsAntiguos)
        if (errorDelete) {
          notificar('El plan nuevo se ha generado, pero quedaron sesiones antiguas duplicadas. Revisa el calendario.', 'info')
        }
      }

      await fetchData()
      notificar('Plan recalculado correctamente.', 'success')
    } catch (err: any) {
      if (String(err?.message || err).includes('SALDO_INSUFICIENTE')) setSinSaldo(true)
      else notificar('Hubo un error al recalcular. Tu plan actual se ha conservado.', 'error')
    }
    setGenerando(false)
  }

  const handleCompeticionAnadida = (comp: any) => {
    // Solo ofrecer ajuste si ya hay plan generado; sin plan no hay nada que recalcular
    if (!planGenerado) return
    setCompPendiente(comp)
    setShowAjusteVentana(true)
  }

  const handleAjustarVentana = async () => {
    if (!compPendiente || !perfil) return
    const comp = compPendiente
    setShowAjusteVentana(false)
    setGenerando(true)
    try {
      const toStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      const dWinStart = new Date(comp.date + 'T12:00:00'); dWinStart.setDate(dWinStart.getDate() - 5)
      const dWinEnd = new Date(comp.date + 'T12:00:00'); dWinEnd.setDate(dWinEnd.getDate() + 5)
      const dCtxStart = new Date(comp.date + 'T12:00:00'); dCtxStart.setDate(dCtxStart.getDate() - 8)
      const dCtxEnd = new Date(comp.date + 'T12:00:00'); dCtxEnd.setDate(dCtxEnd.getDate() + 8)
      const ventanaInicio = toStr(dWinStart)
      const ventanaFin = toStr(dWinEnd)
      const ctxInicio = toStr(dCtxStart)
      const ctxFin = toStr(dCtxEnd)

      // Sesiones del rango ampliado (ventana + contexto de bordes)
      const { data: rango } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId)
        .gte('date', ctxInicio).lte('date', ctxFin)
      const todas = rango || []

      // Todas las competiciones (para respetar puestas a punto solapadas)
      const { data: competiciones } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId).eq('day_type', 'competition')

      const sesionesVentana = todas.filter((s: any) =>
        s.date >= ventanaInicio && s.date <= ventanaFin && s.day_type !== 'competition')
      const sesionesContexto = todas.filter((s: any) =>
        (s.date < ventanaInicio || s.date > ventanaFin) && s.day_type !== 'competition')

      const resultado = await ajustarVentanaCompeticionAction(
        perfil, comp, sesionesVentana, sesionesContexto, competiciones || []
      )

      // Si la IA no devolvió sesiones, NO tocamos la ventana.
      if (!resultado?.sesiones || resultado.sesiones.length === 0) {
        notificar('No se pudo ajustar la ventana de la competición. Tus entrenamientos actuales se han conservado.', 'error')
        setCompPendiente(null)
        setGenerando(false)
        return
      }

      // Red de seguridad: rellenar días de la ventana sin sesión como Descanso (excepto el día de competición)
      const fechasGeneradas = new Set(resultado.sesiones.map((s: any) => s.date))
      const sesionesFinales = [...resultado.sesiones]
      const cur = new Date(ventanaInicio + 'T12:00:00')
      const finV = new Date(ventanaFin + 'T12:00:00')
      while (cur <= finV) {
        const ds = toStr(cur)
        if (ds !== comp.date && !fechasGeneradas.has(ds)) {
          sesionesFinales.push({
            date: ds, discipline: 'Descanso', day_type: 'rest',
            planned_zone: null, planned_duration: null, planned_load: null,
            title: 'Descanso', description: null, type: 'rest',
          })
        }
        cur.setDate(cur.getDate() + 1)
      }

      // Insertar las nuevas (evitando fechas con competición). Si falla, NO borramos nada.
      const fechasConCompeticion = new Set((competiciones || []).map((c: any) => c.date))
      const nuevasSesiones = sesionesFinales
        .filter((s: any) => !fechasConCompeticion.has(s.date))
        .map((s: any) => ({ ...s, user_id: userId, type: s.day_type || 'training' }))

      const { error: errorInsert } = await supabase.from('sessions').insert(nuevasSesiones)
      if (errorInsert) {
        notificar('No se pudo guardar el ajuste de la competición. Tus entrenamientos actuales se han conservado: ' + errorInsert.message, 'error')
        setCompPendiente(null)
        setGenerando(false)
        return
      }

      // Solo si insertó bien, borramos los entrenamientos/descansos antiguos de la ventana (por id, sin tocar competiciones ni los recién creados)
      const idsAntiguosVentana = sesionesVentana
        .filter((s: any) => s.day_type !== 'competition')
        .map((s: any) => s.id)

      if (idsAntiguosVentana.length > 0) {
        const { error: errorDelete } = await supabase.from('sessions')
          .delete().in('id', idsAntiguosVentana)
        if (errorDelete) {
          notificar('El ajuste se ha aplicado, pero quedaron sesiones antiguas duplicadas en la ventana. Revisa el calendario.', 'info')
        }
      }

      await fetchData()
      notificar('Ventana de competición ajustada.', 'success')
    } catch (err) {
      notificar('Hubo un error al ajustar la ventana. Tus entrenamientos actuales se han conservado.', 'error')
    }
    setCompPendiente(null)
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
      notificar('El asistente no está disponible ahora mismo. Inténtalo de nuevo.', 'error')
    }
    setCargandoChat(false)
  }

  const prev = () => {
    if (view === 'week') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7))
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }
  const next = () => {
    if (view === 'week') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7))
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }
  const monthName = currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })
  const rangoSemana = (() => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
    const dow = d.getDay(); const diff = dow === 0 ? 6 : dow - 1
    const lunes = new Date(d); lunes.setDate(d.getDate() - diff)
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
    const f = (x: Date) => x.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `${f(lunes)} - ${f(domingo)}`
  })()
  const tituloCabecera = view === 'week' ? rangoSemana : monthName

  const durezaColor = (n: number) =>
    n >= 8 ? 'text-red-400' : n >= 6 ? 'text-orange-400' : n >= 4 ? 'text-yellow-400' : 'text-green-400'
  const fmtSemana = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  const ultimaDureza = durezas[0] || null

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
            <a href="/suplementacion"
              className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl transition">
              💊 Suplementación
            </a>
            <a href="/estadisticas"
              className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl transition">
              📊 Estadísticas
            </a>
            {planGenerado && (
              <button onClick={handleExportarICS} disabled={exportando}
                className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-2 rounded-xl transition">
                {exportando ? '⏳ Exportando...' : '📆 Exportar .ics'}
              </button>
            )}
            <button onClick={() => setShowBorrar(true)}
              className="text-xs text-red-400 hover:text-red-300 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl transition">
              🗑️ Borrar plan
            </button>
          </div>
          <div className="flex items-center gap-3">
            {ca && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm">
                <span className="text-gray-500">CA </span>
                <span className={`font-bold ${caColor}`}>{ca.ca}</span>
                <span className="text-gray-500 text-xs ml-1">— {ca.estado}</span>
              </div>
            )}
            {ultimaDureza && (
              <div className="relative">
                <button onClick={() => setDurezaAbierta(v => !v)}
                  className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl px-3 py-2 text-sm transition flex items-center gap-1">
                  <span className="text-gray-500">Dureza </span>
                  <span className={`font-bold ${durezaColor(ultimaDureza.nota)}`}>{ultimaDureza.nota}</span>
                  <span className="text-gray-500 text-xs">/10</span>
                  <span className="text-gray-600 text-xs ml-1">▾</span>
                </button>
                {durezaAbierta && (
                  <div className="absolute right-0 mt-2 w-60 bg-gray-900 border border-gray-800 rounded-xl p-3 z-50 shadow-2xl">
                    <div className="text-xs text-gray-400 mb-2">Dureza experimentada (últimas semanas)</div>
                    <div className="space-y-1.5">
                      {durezas.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 text-xs">Semana del {fmtSemana(d.semana_inicio)}</span>
                          <span className="flex items-center gap-2">
                            <span className={`font-bold ${durezaColor(d.nota)}`}>{d.nota}</span>
                            <span className="text-gray-600 text-xs">({d.num_sesiones} ses.)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-800">10 = muy dura · 1 = muy suave</div>
                  </div>
                )}
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
          <button onClick={prev} className="text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition">←</button>
          <h2 className="text-lg font-medium capitalize">{tituloCabecera}</h2>
          <button onClick={next} className="text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition">→</button>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-20">Cargando...</div>
        ) : (
          <CalendarMonth
            currentDate={currentDate}
            sessions={sessions}
            onRefresh={fetchData}
            schedulePattern={perfil?.schedule_pattern}
            onCompetitionAdded={handleCompeticionAnadida}
            view={view}
          />
        )}
      </div>

      {showBorrar && (
        <BorrarPlanModal
          userId={userId}
          onClose={() => setShowBorrar(false)}
          onDone={fetchData}
        />
      )}

      {showExtenderPlan && !generando && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-800 p-6">
            <h3 className="font-semibold text-lg mb-2">📅 Tu plan está acabando</h3>
            <p className="text-gray-400 text-sm mb-4">
              {diasRestantesPlan >= 0
                ? `Quedan ${diasRestantesPlan} días de plan (última sesión: ${new Date(ultimaFechaPlan + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}).`
                : 'Tu plan ya ha terminado.'}
              {' '}¿Quieres generar ahora el siguiente trimestre? Se añadirá a continuación del plan actual, sin modificar lo que ya tienes.
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setShowExtenderPlan(false); extenderDescartadoRef.current = true }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm transition">
                Ahora no
              </button>
              <button onClick={handleExtenderPlan}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-xl text-sm font-medium transition">
                Generar siguiente trimestre
              </button>
            </div>
          </div>
        </div>
      )}

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
              El recálculo tendrá en cuenta la RPE que has registrado en tus últimas sesiones.
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

      {showAjusteVentana && compPendiente && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-800 p-6">
            <h3 className="font-semibold text-lg mb-2">🏁 Competición añadida</h3>
            <p className="text-gray-400 text-sm mb-4">
              Has añadido {compPendiente.modalidad || 'una competición'} el{' '}
              {new Date(compPendiente.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
              {' '}(importancia {compPendiente.competition_importance}). ¿Quieres ajustar los entrenamientos
              de los días de alrededor para la puesta a punto y la recuperación?
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setShowAjusteVentana(false); setCompPendiente(null) }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm transition">
                No, mantener
              </button>
              <button onClick={handleAjustarVentana}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-xl text-sm font-medium transition">
                Sí, ajustar
              </button>
            </div>
          </div>
        </div>
      )}

      {sinSaldo && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-red-900 p-6">
            <h3 className="font-semibold text-lg mb-2 text-red-400">⚠️ Sin saldo en la API</h3>
            <p className="text-gray-300 text-sm mb-4">
              No se ha podido generar el plan porque la cuenta de Anthropic no tiene saldo suficiente.
              Recarga saldo en el panel de Anthropic (Plans &amp; Billing) y vuelve a intentarlo.
            </p>
            <button onClick={() => setSinSaldo(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl text-sm font-medium transition">
              Entendido
            </button>
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