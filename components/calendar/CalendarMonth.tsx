'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularPlannedLoad } from '@/lib/fatigaService'

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const DISCIPLINE_COLORS: Record<string, { bg: string; text: string }> = {
  'Running':                { bg: 'bg-blue-900',   text: 'text-blue-300' },
  'Bici carretera':         { bg: 'bg-green-900',  text: 'text-green-300' },
  'BTT':                    { bg: 'bg-lime-900',   text: 'text-lime-300' },
  'Spinning':               { bg: 'bg-teal-900',   text: 'text-teal-300' },
  'Natación':               { bg: 'bg-purple-900', text: 'text-purple-300' },
  'Paddle surf':            { bg: 'bg-cyan-900',   text: 'text-cyan-300' },
  'Fuerza tren superior A': { bg: 'bg-orange-900', text: 'text-orange-300' },
  'Fuerza tren superior B': { bg: 'bg-orange-900', text: 'text-orange-300' },
  'Fuerza tren inferior':   { bg: 'bg-yellow-900', text: 'text-yellow-300' },
  'Descanso':               { bg: 'bg-gray-800',   text: 'text-gray-500' },
  'Compromiso':             { bg: 'bg-orange-900', text: 'text-orange-400' },
  'Competición':            { bg: 'bg-red-900',    text: 'text-red-400' },
}

const ZONE_COLORS: Record<number, string> = {
  1: 'bg-sky-400', 2: 'bg-green-400', 3: 'bg-yellow-400',
  4: 'bg-orange-400', 5: 'bg-red-500',
}

const DISCIPLINE_ICONS: Record<string, string> = {
  'Running': '🏃', 'Bici carretera': '🚴', 'BTT': '🚵', 'Spinning': '⚡',
  'Natación': '🏊', 'Paddle surf': '🏄', 'Fuerza tren superior A': '💪',
  'Fuerza tren superior B': '💪', 'Fuerza tren inferior': '🦵',
  'Descanso': '😴', 'Compromiso': '📅', 'Competición': '🏁',
}

const SHIFT_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  'M': { label: 'M', bg: 'bg-blue-300/20',   text: 'text-blue-300' },
  'T': { label: 'T', bg: 'bg-blue-500/20',   text: 'text-blue-400' },
  'N': { label: 'N', bg: 'bg-blue-800/30',   text: 'text-blue-200' },
  'S': { label: 'S', bg: 'bg-yellow-900/30', text: 'text-yellow-600' },
  'L': { label: 'L', bg: 'bg-yellow-900/10', text: 'text-yellow-700' },
  'W': { label: 'W', bg: 'bg-indigo-600/30', text: 'text-indigo-300' },
}

function calcularTurno(dateStr: string, schedulePattern: any): string | null {
  if (!schedulePattern?.cycle_start || !schedulePattern?.pattern) return null
  const start = new Date(schedulePattern.cycle_start + 'T12:00:00')
  const date = new Date(dateStr + 'T12:00:00')
  const diffDays = Math.round((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const pattern: string[] = schedulePattern.pattern
  const idx = ((diffDays % pattern.length) + pattern.length) % pattern.length
  return pattern[idx]
}

function normalizarDisc(raw: string, dayType?: string): string {
  if (!raw) return 'Descanso'
  const d = raw.toLowerCase().trim()
  if (d === 'competition' || dayType === 'competition') return 'Competición'
  if (d === 'compromise' || dayType === 'compromise') return 'Compromiso'
  if (d === 'rest' || dayType === 'rest') return 'Descanso'
  if (d.includes('superior') && d.includes('a')) return 'Fuerza tren superior A'
  if (d.includes('superior') && d.includes('b')) return 'Fuerza tren superior B'
  if (d.includes('superior')) return 'Fuerza tren superior A'
  if (d.includes('inferior')) return 'Fuerza tren inferior'
  const map: Record<string, string> = {
    'running': 'Running', 'carrera': 'Running',
    'bici carretera': 'Bici carretera', 'ciclismo': 'Bici carretera', 'bici': 'Bici carretera',
    'btt': 'BTT', 'mtb': 'BTT', 'spinning': 'Spinning',
    'natación': 'Natación', 'natacion': 'Natación',
    'paddle surf': 'Paddle surf', 'paddle': 'Paddle surf',
    'descanso': 'Descanso', 'rest': 'Descanso',
    'compromiso': 'Compromiso', 'competición': 'Competición', 'competicion': 'Competición',
  }
  return map[d] || raw
}

function aplicarCorrector(texto: string, corrector: number): string {
  if (!texto || corrector === 0) return texto
  let result = texto.replace(/(\d+)-(\d+)\s*w/gi, (_m: string, a: string, b: string) =>
    `${Math.round(parseInt(a) * (1 - corrector))}-${Math.round(parseInt(b) * (1 - corrector))}w`)
  result = result.replace(/(\d+)[':'](\d{2})['"']/g, (_m: string, min: string, sec: string) => {
    const totalSecs = parseInt(min) * 60 + parseInt(sec)
    const adjusted = Math.round(totalSecs / (1 - corrector))
    return `${Math.floor(adjusted / 60)}'${String(adjusted % 60).padStart(2, '0')}''`
  })
  return result
}

interface Session {
  id: string; date: string; type: string; discipline?: string; title?: string
  description?: string; energy_level?: number; rpe?: number; perceived_rpe?: number
  planned_zone?: number; planned_duration?: number; actual_duration?: number
  completed?: boolean | null; competition_importance?: string; day_type?: string
  planned_load?: number; modalidad?: string; distancia?: string
}

interface Props {
  currentDate: Date; sessions: Session[]; onRefresh: () => void; schedulePattern?: any
  onCompetitionAdded?: (competicion: any) => void
  view?: 'month' | 'week'
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function CalendarMonth({ currentDate, sessions, onRefresh, schedulePattern, onCompetitionAdded, view = 'month' }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [modalDate, setModalDate] = useState<string>('')
  const [modalSession, setModalSession] = useState<Session | null>(null)

  // Drag & drop state
  const [dragSession, setDragSession] = useState<Session | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveTarget, setMoveTarget] = useState<string | null>(null)

  const detailed = view === 'week'
  const days: (Date | null)[] = []
  if (detailed) {
    const base = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
    const dow = base.getDay()
    const diff = dow === 0 ? 6 : dow - 1
    const lunes = new Date(base); lunes.setDate(base.getDate() - diff)
    for (let i = 0; i < 7; i++) days.push(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i))
  } else {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
    while (days.length % 7 !== 0) days.push(null)
  }

  const today = toDateStr(new Date())
  const getSessionsForDay = (date: Date) => sessions.filter(s => s.date === toDateStr(date))

  const handleDayClick = (date: Date) => {
    setModalDate(toDateStr(date))
    setModalSession(null)
    setShowModal(true)
  }

  const handleSessionClick = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation()
    setModalDate(session.date)
    setModalSession(session)
    setShowModal(true)
  }

  // ─── DRAG & DROP ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, session: Session) => {
    e.stopPropagation()
    setDragSession(session)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(dateStr)
  }

  const handleDragLeave = () => setDragOver(null)

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault()
    setDragOver(null)
    if (!dragSession || dateStr === dragSession.date) { setDragSession(null); return }
    setMoveTarget(dateStr)
    setShowMoveModal(true)
  }

  const handleMoverSesion = async (modo: 'mover' | 'intercambiar') => {
    if (!dragSession || !moveTarget) return
    setShowMoveModal(false)

    const sesionesDestino = sessions.filter(s => s.date === moveTarget && s.day_type !== 'competition')

    if (modo === 'mover') {
      // Mover sesión al nuevo día
      await supabase.from('sessions').update({ date: moveTarget }).eq('id', dragSession.id)
    } else if (modo === 'intercambiar') {
      // Intercambiar: sesión origen va al destino, sesiones destino van al origen
      await supabase.from('sessions').update({ date: moveTarget }).eq('id', dragSession.id)
      for (const s of sesionesDestino) {
        await supabase.from('sessions').update({ date: dragSession.date }).eq('id', s.id)
      }
    }

    setDragSession(null)
    setMoveTarget(null)
    onRefresh()
  }

  const sesionesEnDestino = moveTarget ? sessions.filter(s => s.date === moveTarget && s.day_type !== 'competition') : []

  return (
    <>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs text-gray-500 py-2 font-medium">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 md:gap-1">
        {days.map((day, idx) => {
          if (!day) return <div key={idx} className={detailed ? 'min-h-[180px]' : 'min-h-[64px] md:min-h-[80px]'} />
          const dateStr = toDateStr(day)
          const daySessions = getSessionsForDay(day)
          const isToday = dateStr === today
          const isPast = dateStr < today
          const turno = calcularTurno(dateStr, schedulePattern)
          const turnoStyle = turno ? SHIFT_STYLES[turno] : null
          const isDragOver = dragOver === dateStr

          return (
            <div key={idx}
              onClick={() => handleDayClick(day)}
              onDragOver={e => handleDragOver(e, dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, dateStr)}
              className={`${detailed ? 'min-h-[180px]' : 'min-h-[64px] md:min-h-[80px]'} bg-gray-900 rounded-lg md:rounded-xl p-1 md:p-2 border cursor-pointer transition
                ${isToday ? 'border-blue-500' : isDragOver ? 'border-purple-400 bg-purple-900/20' : 'border-gray-800'}
                ${isPast && !isToday ? 'opacity-70' : ''}
                hover:border-blue-500`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-0.5">
                  <div className={`text-xs font-medium ${isToday ? 'text-blue-400' : 'text-gray-500'}`}>
                    {day.getDate()}
                  </div>
                  {daySessions.filter(s => s.completed === true).map((s, i) => (
                    <span key={`tick-${s.id}-${i}`} className="text-green-400 text-xs leading-none" title="Sesión realizada">✓</span>
                  ))}
                  {daySessions.filter(s => s.completed === false).map((s, i) => (
                    <span key={`cross-${s.id}-${i}`} className="text-red-400 text-xs leading-none" title="Sesión no realizada">✗</span>
                  ))}
                </div>
                {turnoStyle && (
                  <span className={`text-xs font-bold px-1 rounded ${turnoStyle.bg} ${turnoStyle.text}`}>
                    {turnoStyle.label}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {daySessions.map(s => {
                  const disc = normalizarDisc(s.discipline || s.type, s.day_type)
                  const colors = DISCIPLINE_COLORS[disc] || { bg: 'bg-gray-800', text: 'text-gray-400' }
                  const isComp = s.day_type === 'competition' || disc === 'Competición'
                  return (
                    <div key={s.id}
                      draggable={!isComp}
                      onDragStart={e => !isComp && handleDragStart(e, s)}
                      onClick={e => handleSessionClick(e, s)}
                      className={`text-xs px-1 md:px-1.5 py-0.5 md:py-1 rounded-md ${colors.bg} ${colors.text} ${detailed ? '' : 'truncate'}
                        transition hover:ring-2 hover:ring-white/40
                        ${isComp ? 'border border-red-500' : 'cursor-grab active:cursor-grabbing'}
                        ${s.completed === true ? 'opacity-60' : ''}
                        ${s.completed === false ? 'opacity-40 line-through' : ''}
                        ${dragSession?.id === s.id ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-1">
                        <span className="text-xs hidden md:inline">{DISCIPLINE_ICONS[disc] || '📋'}</span>
                        {s.planned_zone && ZONE_COLORS[s.planned_zone] && (
                          <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${ZONE_COLORS[s.planned_zone]}`} />
                        )}
                        {s.planned_load && (
                          <span className="text-xs opacity-60 font-mono hidden md:inline">{s.planned_load}</span>
                        )}
                        <span className={detailed ? 'font-medium' : 'truncate'}>
                          {isComp && s.competition_importance && (
                            <span className="mr-0.5">
                              {s.competition_importance === 'A' ? '★' : s.competition_importance === 'B' ? '◆' : '●'}
                            </span>
                          )}
                          {s.completed === true ? '✓ ' : s.completed === false ? '✗ ' : ''}{s.title || disc}
                        </span>
                      </div>
                      {detailed && (s.planned_zone || s.planned_duration) && (
                        <div className="text-[10px] opacity-70 mt-0.5">
                          {s.planned_zone ? `Z${s.planned_zone}` : ''}{s.planned_zone && s.planned_duration ? ' · ' : ''}{s.planned_duration ? `${s.planned_duration} min` : ''}
                        </div>
                      )}
                      {detailed && s.description && (
                        <div className="text-[10px] opacity-60 mt-0.5 leading-snug">{s.description}</div>
                      )}
                    </div>
                  )
                })}
              </div>
              {daySessions.some(s => s.energy_level) && (
                <div className="mt-1 flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    daySessions[0].energy_level! >= 8 ? 'bg-green-400' :
                    daySessions[0].energy_level! >= 5 ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <span className="text-xs text-gray-600">{daySessions[0].energy_level}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal sesión */}
      {showModal && (
        <DayModal
          date={modalDate}
          sessions={sessions.filter(s => s.date === modalDate)}
          editSession={modalSession}
          onClose={() => setShowModal(false)}
          onRefresh={() => { onRefresh(); setShowModal(false) }}
          onCompetitionAdded={onCompetitionAdded}
        />
      )}

      {/* Modal mover/intercambiar */}
      {showMoveModal && dragSession && moveTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-sm border border-gray-800 p-6">
            <h3 className="font-semibold text-lg mb-2">Mover sesión</h3>
            <p className="text-gray-400 text-sm mb-1">
              <span className="text-white">{dragSession.title || dragSession.discipline}</span>
              {' '}→ {new Date(moveTarget + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
            </p>
            {sesionesEnDestino.length > 0 && (
              <p className="text-xs text-gray-500 mb-4">
                El día destino ya tiene: {sesionesEnDestino.map(s => s.title || s.discipline).join(', ')}
              </p>
            )}
            <div className="flex flex-col gap-3 mt-4">
              <button onClick={() => handleMoverSesion('mover')}
                className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl text-sm font-medium transition">
                Mover aquí {sesionesEnDestino.length > 0 ? '(se solapan)' : ''}
              </button>
              {sesionesEnDestino.length > 0 && (
                <button onClick={() => handleMoverSesion('intercambiar')}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-xl text-sm font-medium transition">
                  Intercambiar sesiones
                </button>
              )}
              <button onClick={() => { setShowMoveModal(false); setDragSession(null); setMoveTarget(null) }}
                className="w-full bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DayModal({ date, sessions, editSession, onClose, onRefresh, onCompetitionAdded }: {
  date: string; sessions: Session[]; editSession: Session | null
  onClose: () => void; onRefresh: () => void
  onCompetitionAdded?: (competicion: any) => void
}) {
  const isEdit = !!editSession
  const isPast = date < toDateStr(new Date())

  const [type, setType] = useState(editSession?.day_type || 'training')
  const [discipline, setDiscipline] = useState(editSession?.discipline || '')
  const [title, setTitle] = useState(editSession?.title || '')
  const [plannedDuration, setPlannedDuration] = useState(String(editSession?.planned_duration || ''))
  const [actualDuration, setActualDuration] = useState(String(editSession?.actual_duration || ''))
  const [plannedZone, setPlannedZone] = useState(editSession?.planned_zone || 0)
  const [perceivedRpe, setPerceivedRpe] = useState(editSession?.perceived_rpe || 0)
  const [energy, setEnergy] = useState(String(editSession?.energy_level || ''))
  const [importance, setImportance] = useState(editSession?.competition_importance || 'B')
  const [modalidad, setModalidad] = useState(editSession?.modalidad || '')
  const [distancia, setDistancia] = useState(editSession?.distancia || '')
  const [completed, setCompleted] = useState<boolean | null>(
    editSession?.completed === true ? true : editSession?.completed === false ? false : null
  )
  const [loading, setLoading] = useState(false)
  const [correctorCalorAmarillo, setCorrectorCalorAmarillo] = useState(false)
  const [correctorCalorRojo, setCorrectorCalorRojo] = useState(false)
  const [correctorEnfAmarillo, setCorrectorEnfAmarillo] = useState(false)
  const [correctorEnfRojo, setCorrectorEnfRojo] = useState(false)

  // Esfuerzo estimado en tiempo real (baremos del modelo de fatiga, escala 1-10).
  // Se recalcula al cambiar disciplina, zona o duración, con un pequeño retardo.
  // Para gimnasio la carga es fija y se calcula YA en el primer render (sin retardo),
  // de modo que un valor antiguo mal guardado en BD nunca llegue a mostrarse.
  const [esfuerzoEstimado, setEsfuerzoEstimado] = useState<number | null>(() => {
    const d = editSession?.discipline || ''
    if (d.startsWith('Fuerza')) return d === 'Fuerza tren inferior' ? 5 : 4
    return null
  })

  useEffect(() => {
    const timer = setTimeout(async () => {
      const dur = plannedDuration ? parseInt(plannedDuration) : 0
      const esFuerza = discipline.startsWith('Fuerza')
      const esEntrenable = discipline && !['rest', 'competition', 'compromise', 'Descanso'].includes(discipline)
      if (!esEntrenable) {
        setEsfuerzoEstimado(null)
        return
      }
      // Gimnasio: carga fija determinista (tren inferior 5/10, tren superior 4/10)
      if (esFuerza) {
        setEsfuerzoEstimado(discipline === 'Fuerza tren inferior' ? 5 : 4)
        return
      }
      if (!dur || !plannedZone) {
        setEsfuerzoEstimado(null)
        return
      }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const load = await calcularPlannedLoad(session.user.id, discipline, plannedZone || null, dur)
        setEsfuerzoEstimado(typeof load === 'number' ? load : null)
      } catch {
        setEsfuerzoEstimado(null)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [discipline, plannedZone, plannedDuration])

  // Esfuerzo a mostrar/guardar: la estimación en vivo si existe; si no, la guardada
  const loadPrevisto: number | null = esfuerzoEstimado ?? editSession?.planned_load ?? null

  const correctorTotal = (correctorCalorAmarillo ? 0.07 : 0) + (correctorCalorRojo ? 0.15 : 0) +
    (correctorEnfAmarillo ? 0.07 : 0) + (correctorEnfRojo ? 0.15 : 0)

  const DISCIPLINES = [
    'Running', 'Bici carretera', 'BTT', 'Spinning', 'Natación', 'Paddle surf',
    'Fuerza tren superior A', 'Fuerza tren superior B', 'Fuerza tren inferior'
  ]

  // Qué inputs tienen consecuencia según el tipo de día:
  // - Zona, duración planificada y RPE solo alimentan entrenamientos.
  // - Estado (realizada/no realizada) alimenta entrenamientos y competiciones.
  // - Título tiene sentido en entrenos, compromisos y cualquier edición.
  const esEntreno = type === 'training'
  const esCompeticion = type === 'competition'

  const handleSave = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    if (isEdit) {
      await supabase.from('sessions').update({
        title: title || null, planned_duration: plannedDuration ? parseInt(plannedDuration) : null,
        actual_duration: actualDuration ? parseInt(actualDuration) : null,
        planned_zone: plannedZone || null, perceived_rpe: perceivedRpe || null,
        energy_level: energy ? parseInt(energy) : null, completed,
        planned_load: loadPrevisto,
      }).eq('id', editSession!.id)
    } else {
      await supabase.from('sessions').insert({
        user_id: session.user.id, date, type,
        discipline: type === 'training' ? discipline : type,
        title: title || null, planned_duration: plannedDuration ? parseInt(plannedDuration) : null,
        actual_duration: actualDuration ? parseInt(actualDuration) : null,
        planned_zone: plannedZone || null, perceived_rpe: perceivedRpe || null,
        energy_level: energy ? parseInt(energy) : null, day_type: type,
        competition_importance: type === 'competition' ? importance : null,
        modalidad: type === 'competition' ? modalidad : null,
        distancia: type === 'competition' ? distancia : null,
        completed: completed,
        planned_load: type === 'training' ? loadPrevisto : null,
      })
    }
    setLoading(false)

    // Aviso hacia arriba: competición NUEVA recién creada (page.tsx decide si recalcular ±5)
    if (!isEdit && type === 'competition' && onCompetitionAdded) {
      onCompetitionAdded({
        date,
        competition_importance: importance,
        modalidad: modalidad || null,
        distancia: distancia || null,
      })
    }

    onRefresh()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('sessions').delete().eq('id', id)
    onRefresh()
  }

  const inputClass = "w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
  const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b border-gray-800">
          <h3 className="font-semibold capitalize">{dateFormatted}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {!isEdit && sessions.length > 0 && (
            <div className="space-y-2">
              {sessions.map(s => {
                const disc = normalizarDisc(s.discipline || s.type, s.day_type)
                const colors = DISCIPLINE_COLORS[disc] || { bg: 'bg-gray-800', text: 'text-gray-400' }
                return (
                  <div key={s.id} className={`flex justify-between items-center px-3 py-2 rounded-xl ${colors.bg}`}>
                    <span className={`text-sm ${colors.text}`}>{s.title || disc}</span>
                    <button onClick={() => handleDelete(s.id)} className="text-gray-500 hover:text-red-400 text-xs transition">✕</button>
                  </div>
                )
              })}
            </div>
          )}

          {!isEdit && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Tipo de día</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'training', label: 'Entreno' }, { id: 'rest', label: 'Descanso' },
                  { id: 'competition', label: 'Competición' }, { id: 'compromise', label: 'Compromiso' },
                ].map(t => (
                  <button key={t.id} onClick={() => setType(t.id)}
                    className={`py-2 rounded-xl text-xs font-medium border transition ${
                      type === t.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500'
                    }`}>{t.label}</button>
                ))}
              </div>
            </div>
          )}

          {!isEdit && type === 'training' && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Disciplina</label>
              <select className={inputClass} value={discipline} onChange={e => setDiscipline(e.target.value)}>
                <option value="">Selecciona</option>
                {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {type === 'competition' && !isEdit && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Modalidad</label>
                <select className={inputClass} value={modalidad} onChange={e => setModalidad(e.target.value)}>
                  <option value="">Selecciona</option>
                  {['Running', 'Bici carretera', 'BTT', 'Triatlón', 'Duatlón', 'OCR', 'Hyrox', 'Natación', 'Paddle surf', 'Ultra trail', 'Otra'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Distancia / Formato</label>
                <input className={inputClass} value={distancia} onChange={e => setDistancia(e.target.value)} placeholder="Ej: Maratón, 70.3, 10K, OCR estándar..." />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Importancia</label>
                <div className="flex gap-3">
                  {['A', 'B', 'C'].map(i => (
                    <button key={i} onClick={() => setImportance(i)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition ${
                        importance === i ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}>{i}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(esEntreno || type === 'compromise' || isEdit) && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Título (opcional)</label>
              <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'compromise' ? 'Ej: Boda, viaje de trabajo...' : 'Ej: Rodaje Z2 45min'} />
            </div>
          )}

          {isEdit && esEntreno && loadPrevisto !== null && (
            <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
              <span className="text-sm text-gray-300">Esfuerzo previsto por la app</span>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                  loadPrevisto >= 8 ? 'bg-red-900 text-red-300' :
                  loadPrevisto >= 5 ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'
                }`}>{loadPrevisto}</div>
                <span className="text-xs text-gray-500">/ 10</span>
              </div>
            </div>
          )}

          {isEdit && esEntreno && editSession?.planned_zone && (
            <div className="bg-gray-800 rounded-xl px-4 py-3 space-y-3">
              {editSession.description && (
                <div className="text-xs text-gray-300 leading-relaxed">
                  {aplicarCorrector(editSession.description, correctorTotal)}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Corrector de condiciones</span>
                {correctorTotal > 0 && <span className="text-xs text-yellow-400 font-medium">-{Math.round(correctorTotal * 100)}%</span>}
              </div>
              <div className="flex gap-2">
                {[
                  { state: correctorCalorAmarillo, set: setCorrectorCalorAmarillo, icon: '🌤️', title: 'Calor moderado (-7%)', active: 'bg-yellow-600 border-yellow-600' },
                  { state: correctorCalorRojo, set: setCorrectorCalorRojo, icon: '☀️', title: 'Calor extremo (-15%)', active: 'bg-orange-600 border-orange-600' },
                  { state: correctorEnfAmarillo, set: setCorrectorEnfAmarillo, icon: '🤒', title: 'Enfermedad leve (-7%)', active: 'bg-yellow-600 border-yellow-600' },
                  { state: correctorEnfRojo, set: setCorrectorEnfRojo, icon: '🤧', title: 'Enfermedad grave (-15%)', active: 'bg-red-600 border-red-600' },
                ].map((btn, i) => (
                  <button key={i} onClick={() => btn.set(!btn.state)} title={btn.title}
                    className={`flex-1 py-2 rounded-xl text-sm border transition ${btn.state ? btn.active : 'bg-gray-700 border-gray-600'}`}>
                    {btn.icon}
                  </button>
                ))}
              </div>
            </div>
          )}

          {esEntreno && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Zona objetivo</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(z => (
                  <button key={z} onClick={() => setPlannedZone(z)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition ${
                      plannedZone === z ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500'
                    }`}>Z{z}</button>
                ))}
              </div>
            </div>
          )}

          {(esEntreno || (isEdit && esCompeticion)) && (
            <div className={`grid gap-3 ${esEntreno && (isPast || isEdit) ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {esEntreno && (
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Duración planificada (min)</label>
                  <input className={inputClass} type="number" value={plannedDuration} onChange={e => setPlannedDuration(e.target.value)} placeholder="Ej: 60" />
                </div>
              )}
              {(isPast || isEdit) && (
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Duración real (min)</label>
                  <input className={inputClass} type="number" value={actualDuration} onChange={e => setActualDuration(e.target.value)} placeholder="Ej: 45" />
                </div>
              )}
            </div>
          )}

          {!isEdit && esEntreno && esfuerzoEstimado !== null && (
            <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
              <span className="text-sm text-gray-300">Esfuerzo estimado</span>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                  esfuerzoEstimado >= 8 ? 'bg-red-900 text-red-300' :
                  esfuerzoEstimado >= 5 ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'
                }`}>{esfuerzoEstimado}</div>
                <span className="text-xs text-gray-500">/ 10</span>
              </div>
            </div>
          )}

          {(isPast || isEdit) && esEntreno && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">RPE percibida (1-10)</label>
              <div className="flex gap-1">
                {[1,2,3,4,5,6,7,8,9,10].map(v => (
                  <button key={v} onClick={() => setPerceivedRpe(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                      perceivedRpe === v
                        ? v >= 8 ? 'bg-red-600 text-white' : v >= 5 ? 'bg-yellow-600 text-white' : 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                    }`}>{v}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-2 block">Energía del día (1-10)</label>
            <div className="flex gap-1">
              {[1,2,3,4,5,6,7,8,9,10].map(v => (
                <button key={v} onClick={() => setEnergy(String(v))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                    energy === String(v)
                      ? v >= 8 ? 'bg-green-600 text-white' : v >= 5 ? 'bg-yellow-600 text-white' : 'bg-red-600 text-white'
                      : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                  }`}>{v}</button>
              ))}
            </div>
          </div>

          {(isPast || isEdit) && (esEntreno || esCompeticion) && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Estado de la sesión</label>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setCompleted(null)}
                  className={`py-2.5 rounded-xl text-xs font-medium border transition ${
                    completed === null ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}>⏳ Pendiente</button>
                <button onClick={() => setCompleted(true)}
                  className={`py-2.5 rounded-xl text-xs font-medium border transition ${
                    completed === true ? 'bg-green-600 border-green-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-green-500'
                  }`}>✓ Realizada</button>
                <button onClick={() => setCompleted(false)}
                  className={`py-2.5 rounded-xl text-xs font-medium border transition ${
                    completed === false ? 'bg-red-600 border-red-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-red-500'
                  }`}>✗ No realizada</button>
              </div>
              {completed === false && (
                <p className="text-xs text-gray-500 mt-2">Esta sesión no computará carga: el día contará como descanso a efectos de fatiga.</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            {isEdit && (
              <button onClick={() => handleDelete(editSession!.id)} disabled={loading}
                className="flex-1 bg-red-900 hover:bg-red-800 text-red-300 py-3 rounded-xl text-sm font-medium transition disabled:opacity-50">
                Borrar sesión
              </button>
            )}
            <button onClick={handleSave} disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-medium transition disabled:opacity-50">
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios ✓' : '+ Añadir al calendario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}