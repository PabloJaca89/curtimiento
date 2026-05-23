'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const DISCIPLINE_COLORS: Record<string, { bg: string; text: string }> = {
  'Running':               { bg: 'bg-blue-900',   text: 'text-blue-300' },
  'Bici carretera':        { bg: 'bg-green-900',  text: 'text-green-300' },
  'BTT':                   { bg: 'bg-lime-900',   text: 'text-lime-300' },
  'Spinning':              { bg: 'bg-teal-900',   text: 'text-teal-300' },
  'Natación':              { bg: 'bg-purple-900', text: 'text-purple-300' },
  'Paddle surf':           { bg: 'bg-cyan-900',   text: 'text-cyan-300' },
  'Fuerza tren superior':  { bg: 'bg-orange-900', text: 'text-orange-300' },
  'Fuerza tren inferior':  { bg: 'bg-yellow-900', text: 'text-yellow-300' },
  'Descanso':              { bg: 'bg-gray-800',   text: 'text-gray-500' },
  'Compromiso':            { bg: 'bg-orange-900', text: 'text-orange-400' },
  'Competición':           { bg: 'bg-red-900',    text: 'text-red-400' },
}

interface Session {
  id: string
  date: string
  type: string
  discipline?: string
  title?: string
  energy_level?: number
  rpe?: number
  perceived_rpe?: number
  planned_zone?: number
  planned_duration?: number
  actual_duration?: number
  completed?: boolean
  competition_importance?: string
  day_type?: string
  planned_load?: number
}

interface Props {
  currentDate: Date
  sessions: Session[]
  onRefresh: () => void
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function CalendarMonth({ currentDate, sessions, onRefresh }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [modalDate, setModalDate] = useState<string>('')
  const [modalSession, setModalSession] = useState<Session | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(null)

  const today = toDateStr(new Date())

  const getSessionsForDay = (date: Date) =>
    sessions.filter(s => s.date === toDateStr(date))

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

  return (
    <>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs text-gray-500 py-2 font-medium">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          if (!day) return <div key={idx} className="min-h-[80px]" />
          const dateStr = toDateStr(day)
          const daySessions = getSessionsForDay(day)
          const isToday = dateStr === today
          const isPast = dateStr < today

          return (
            <div key={idx} onClick={() => handleDayClick(day)}
              className={`min-h-[80px] bg-gray-900 rounded-xl p-2 border cursor-pointer hover:border-blue-500 transition
                ${isToday ? 'border-blue-500' : 'border-gray-800'}
                ${isPast && !isToday ? 'opacity-70' : ''}`}>
              <div className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-400' : 'text-gray-500'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-1">
                {daySessions.map(s => {
                  const disc = s.discipline || s.type
                  const colors = DISCIPLINE_COLORS[disc] || { bg: 'bg-gray-800', text: 'text-gray-400' }
                  const isComp = s.day_type === 'competition'
                  return (
                    <div key={s.id} onClick={e => handleSessionClick(e, s)}
                      className={`text-xs px-1.5 py-0.5 rounded-md ${colors.bg} ${colors.text} truncate
                        ${isComp ? 'border border-red-500' : ''}
                        ${s.completed ? 'opacity-60' : ''}`}>
                      {isComp && s.competition_importance && (
                        <span className="mr-1">
                          {s.competition_importance === 'A' ? '★' : s.competition_importance === 'B' ? '◆' : '●'}
                        </span>
                      )}
                      {s.completed ? '✓ ' : ''}{s.title || disc}
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

      {showModal && (
        <DayModal
          date={modalDate}
          sessions={sessions.filter(s => s.date === modalDate)}
          editSession={modalSession}
          onClose={() => setShowModal(false)}
          onRefresh={() => { onRefresh(); setShowModal(false) }}
        />
      )}
    </>
  )
}

function DayModal({ date, sessions, editSession, onClose, onRefresh }: {
  date: string
  sessions: Session[]
  editSession: Session | null
  onClose: () => void
  onRefresh: () => void
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
  const [completed, setCompleted] = useState(editSession?.completed || false)
  const [loading, setLoading] = useState(false)

  const DISCIPLINES = [
    'Running', 'Bici carretera', 'BTT', 'Spinning',
    'Natación', 'Paddle surf', 'Fuerza tren superior', 'Fuerza tren inferior'
  ]

  const handleSave = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    if (isEdit) {
      await supabase.from('sessions').update({
        title: title || null,
        planned_duration: plannedDuration ? parseInt(plannedDuration) : null,
        actual_duration: actualDuration ? parseInt(actualDuration) : null,
        planned_zone: plannedZone || null,
        perceived_rpe: perceivedRpe || null,
        energy_level: energy ? parseInt(energy) : null,
        completed,
      }).eq('id', editSession!.id)
    } else {
      await supabase.from('sessions').insert({
        user_id: session.user.id,
        date,
        type,
        discipline: type === 'training' ? discipline : type,
        title: title || null,
        planned_duration: plannedDuration ? parseInt(plannedDuration) : null,
        actual_duration: actualDuration ? parseInt(actualDuration) : null,
        planned_zone: plannedZone || null,
        perceived_rpe: perceivedRpe || null,
        energy_level: energy ? parseInt(energy) : null,
        day_type: type,
        competition_importance: type === 'competition' ? importance : null,
      })
    }

    setLoading(false)
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
                const colors = DISCIPLINE_COLORS[s.discipline || s.type] || { bg: 'bg-gray-800', text: 'text-gray-400' }
                return (
                  <div key={s.id} className={`flex justify-between items-center px-3 py-2 rounded-xl ${colors.bg}`}>
                    <span className={`text-sm ${colors.text}`}>{s.title || s.discipline || s.type}</span>
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
                  { id: 'training', label: 'Entreno' },
                  { id: 'rest', label: 'Descanso' },
                  { id: 'competition', label: 'Competición' },
                  { id: 'compromise', label: 'Compromiso' },
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
          )}

          {(type === 'training' || isEdit) && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Título (opcional)</label>
              <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Rodaje Z2 45min" />
            </div>
          )}

          {(type === 'training' || isEdit) && (
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

          {(type === 'training' || isEdit) && (
            <div className={`grid gap-3 ${isPast || isEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Duración planificada (min)</label>
                <input className={inputClass} type="number" value={plannedDuration} onChange={e => setPlannedDuration(e.target.value)} placeholder="Ej: 60" />
              </div>
              {(isPast || isEdit) && (
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Duración real (min)</label>
                  <input className={inputClass} type="number" value={actualDuration} onChange={e => setActualDuration(e.target.value)} placeholder="Ej: 45" />
                </div>
              )}
            </div>
          )}

          {(isPast || isEdit) && type === 'training' && (
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

          {(isPast || isEdit) && (
            <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
              <span className="text-sm text-gray-300">Sesión completada</span>
              <button onClick={() => setCompleted(!completed)}
                className={`w-12 h-6 rounded-full transition ${completed ? 'bg-blue-600' : 'bg-gray-700'}`}>
                <div className={`w-5 h-5 bg-white rounded-full mx-0.5 transition-transform ${completed ? 'translate-x-6' : ''}`} />
              </button>
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