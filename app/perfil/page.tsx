'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const DISCIPLINES = [
  'Running', 'Bici carretera', 'BTT', 'Spinning',
  'Natación', 'Paddle surf', 'Fuerza tren superior A', 'Fuerza tren superior B', 'Fuerza tren inferior'
]

const EQUIPMENT = [
  'Piscina', 'Gimnasio', 'Rodillo', 'Bici de carretera',
  'Bici de montaña', 'Material de paddle surf'
]

const SHIFT_TYPES = ['Libre', 'Mañanas', 'Tardes', 'Noches', 'Saliente']
const ROTATING_PATTERN = ['M','M','T','T','N','N','S','L','L','L','L','L']
const GUARD_PATTERN = ['W','W','W','W','W','W','W','L','L','L','L','L','L','L','L','L','L','L','L','L','L']
const SHIFT_LABELS: Record<string, string> = {
  'M': 'Mañanas', 'T': 'Tardes', 'N': 'Noches', 'S': 'Saliente', 'L': 'Libre', 'W': 'Trabajo'
}
const SCHEDULE_TYPES = [
  { id: 'rotating', label: 'Turno rotatorio', desc: '6x6 — MMTTNN + 1 saliente + 5 libres' },
  { id: 'office', label: 'Lunes a viernes', desc: 'Fines de semana libres' },
  { id: 'guard714', label: '7 trabajados / 14 libres', desc: '7 días de trabajo seguidos + 14 libres' }
]

function calcularCycleStart(dayIndex: number): string {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayIndex)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

function calcularCycleDayDesdeStart(cycleStart: string, cycleLength: number = 12): number | null {
  if (!cycleStart) return null
  const start = new Date(cycleStart + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((today.getTime() - start.getTime()) / 86400000)
  return ((diff % cycleLength) + cycleLength) % cycleLength
}

export default function PerfilPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [level, setLevel] = useState(0)
  const [injuries, setInjuries] = useState('')

  const [weeklyHours, setWeeklyHours] = useState('')
  const [maxSession, setMaxSession] = useState('')
  const [scheduleType, setScheduleType] = useState('')
  const [cycleDay, setCycleDay] = useState<number | null>(null)
  const [shiftEnergy, setShiftEnergy] = useState<Record<string, number>>({
    Libre: 5, Mañanas: 2, Tardes: 4, Noches: 3, Saliente: 3, Trabajo: 2
  })

  const [disciplines, setDisciplines] = useState<string[]>([])
  const [priorityDiscipline, setPriorityDiscipline] = useState('')
  const [equipment, setEquipment] = useState<string[]>([])

  const [goal, setGoal] = useState('')
  const [currentFitness, setCurrentFitness] = useState(5)
  const [fromBreak, setFromBreak] = useState(false)
  const [breakWeeks, setBreakWeeks] = useState('')

  const [ftp, setFtp] = useState('')
  const [hrZones, setHrZones] = useState({
    z1: { min: '', max: '' }, z2: { min: '', max: '' }, z3: { min: '', max: '' },
    z4: { min: '', max: '' }, z5: { min: '', max: '' }
  })
  const [runPaces, setRunPaces] = useState({
    z1: { min: '', max: '' }, z2: { min: '', max: '' }, z3: { min: '', max: '' },
    z4: { min: '', max: '' }, z5: { min: '', max: '' }
  })

  // Cargar datos existentes al montar
  useEffect(() => {
    const cargarPerfil = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: p } = await supabase
        .from('athlete_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (p) {
        setName(p.name || '')
        setAge(p.age ? String(p.age) : '')
        setSex(p.sex || '')
        setLevel(p.level || 0)
        setInjuries(p.injuries || '')
        setWeeklyHours(p.weekly_hours ? String(p.weekly_hours) : '')
        setMaxSession(p.max_session_duration ? String(p.max_session_duration) : '')
        setGoal(p.general_goal || '')
        setCurrentFitness(p.current_fitness || 5)
        setFromBreak(p.coming_from_break || false)
        setBreakWeeks(p.break_duration_weeks ? String(p.break_duration_weeks) : '')
        setFtp(p.ftp ? String(p.ftp) : '')

        if (p.disciplines?.list) setDisciplines(p.disciplines.list)
        if (p.disciplines?.priority) setPriorityDiscipline(p.disciplines.priority)
        if (p.equipment) setEquipment(p.equipment)

        if (p.heart_rate_zones) setHrZones(p.heart_rate_zones)
        if (p.running_paces) setRunPaces(p.running_paces)

        if (p.schedule_pattern) {
          const sp = p.schedule_pattern
          setScheduleType(sp.type || '')
          if (sp.shift_energy) {
            setShiftEnergy({
              Libre:    sp.shift_energy.L ?? 5,
              Mañanas:  sp.shift_energy.M ?? 2,
              Tardes:   sp.shift_energy.T ?? 4,
              Noches:   sp.shift_energy.N ?? 3,
              Saliente: sp.shift_energy.S ?? 3,
              Trabajo:  sp.shift_energy.W ?? 2,
            })
          }
          if (sp.cycle_start) {
            const len = sp.pattern?.length || 12
            const dayIdx = calcularCycleDayDesdeStart(sp.cycle_start, len)
            setCycleDay(dayIdx)
          }
        }
      }
      setLoadingData(false)
    }
    cargarPerfil()
  }, [])

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item])
  }

  const updateShiftEnergy = (shift: string, value: number) => {
    setShiftEnergy(prev => ({ ...prev, [shift]: value }))
  }

  const buildSchedulePattern = () => {
    if (scheduleType === 'guard714' && cycleDay !== null) {
      return {
        type: 'guard714',
        cycle_start: calcularCycleStart(cycleDay),
        pattern: GUARD_PATTERN,
        shift_energy: {
          W: shiftEnergy['Trabajo'],
          L: shiftEnergy['Libre'],
        }
      }
    }
    if (scheduleType === 'rotating' && cycleDay !== null) {
      return {
        type: 'rotating',
        cycle_start: calcularCycleStart(cycleDay),
        pattern: ROTATING_PATTERN,
        shift_energy: {
          M: shiftEnergy['Mañanas'],
          T: shiftEnergy['Tardes'],
          N: shiftEnergy['Noches'],
          S: shiftEnergy['Saliente'],
          L: shiftEnergy['Libre'],
        }
      }
    }
    return {
      type: scheduleType,
      shift_energy: {
        M: shiftEnergy['Mañanas'],
        T: shiftEnergy['Tardes'],
        N: shiftEnergy['Noches'],
        S: shiftEnergy['Saliente'],
        L: shiftEnergy['Libre'],
      }
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { error } = await supabase.from('athlete_profiles').upsert({
      id: session.user.id,
      name, age: parseInt(age), sex, level, injuries,
      weekly_hours: parseFloat(weeklyHours),
      max_session_duration: parseInt(maxSession),
      schedule_pattern: buildSchedulePattern(),
      disciplines: { list: disciplines, priority: priorityDiscipline },
      equipment,
      general_goal: goal,
      current_fitness: currentFitness,
      coming_from_break: fromBreak,
      break_duration_weeks: fromBreak ? parseInt(breakWeeks) : null,
      ftp: ftp ? parseInt(ftp) : null,
      heart_rate_zones: hrZones,
      running_paces: runPaces,
      updated_at: new Date().toISOString()
    })

    if (error) { setError(error.message); setLoading(false); return }
    router.push('/calendario')
  }

  const inputClass = "w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
  const labelClass = "block text-gray-400 text-sm mb-1"
  const tagClass = (active: boolean) =>
    `px-3 py-2 rounded-xl text-sm cursor-pointer border transition ${active
      ? 'bg-blue-600 border-blue-600 text-white'
      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-blue-500'}`

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Cargando perfil...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-2xl font-bold tracking-widest">CURTIMIENTO</h1>
          <a href="/calendario" className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl transition">
            ← Calendario
          </a>
        </div>
        <p className="text-gray-400 mb-6">Configura tu perfil de atleta</p>

        <div className="flex gap-2 mb-8">
          {[1,2,3,4,5].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${step >= s ? 'bg-blue-500' : 'bg-gray-800'}`} />
          ))}
        </div>

        {/* BLOQUE 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-blue-400">Datos personales</h2>
            <div>
              <label className={labelClass}>Nombre</label>
              <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Edad</label>
                <input className={inputClass} type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="Años" />
              </div>
              <div>
                <label className={labelClass}>Sexo</label>
                <select className={inputClass} value={sex} onChange={e => setSex(e.target.value)}>
                  <option value="">Selecciona</option>
                  <option value="hombre">Hombre</option>
                  <option value="mujer">Mujer</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Nivel</label>
              <div className="flex gap-2 mt-1">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setLevel(s)}
                    className={`text-2xl transition ${s <= level ? 'text-yellow-400' : 'text-gray-600'}`}>★</button>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {['', 'Principiante', 'Amateur básico', 'Amateur medio', 'Amateur avanzado', 'Profesional'][level]}
              </div>
            </div>
            <div>
              <label className={labelClass}>Lesiones relevantes (opcional)</label>
              <textarea className={inputClass} value={injuries} onChange={e => setInjuries(e.target.value)}
                placeholder="Ej: rodilla derecha, lumbar..." rows={2} />
            </div>
          </div>
        )}

        {/* BLOQUE 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-blue-400">Disponibilidad</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Horas disponibles/semana</label>
                <input className={inputClass} type="number" value={weeklyHours} onChange={e => setWeeklyHours(e.target.value)} placeholder="Ej: 10" />
              </div>
              <div>
                <label className={labelClass}>Duración máxima sesión (min)</label>
                <input className={inputClass} type="number" value={maxSession} onChange={e => setMaxSession(e.target.value)} placeholder="Ej: 90" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Tipo de cadencia laboral</label>
              <div className="flex flex-col gap-3 mt-2">
                {SCHEDULE_TYPES.map(st => (
                  <button key={st.id} onClick={() => { setScheduleType(st.id); setCycleDay(null) }}
                    className={`flex flex-col items-start px-4 py-3 rounded-xl border transition text-left ${
                      scheduleType === st.id ? 'bg-blue-600 border-blue-600' : 'bg-gray-800 border-gray-700 hover:border-blue-500'}`}>
                    <span className="font-medium text-sm">{st.label}</span>
                    <span className="text-xs text-gray-300 mt-0.5">{st.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {scheduleType === 'rotating' && (
              <div>
                <label className={labelClass}>¿En qué día del ciclo estás hoy?</label>
                <p className="text-xs text-gray-500 mb-3">El patrón es MMTTNNSLLLLL. Selecciona el turno de hoy.</p>
                <div className="grid grid-cols-12 gap-1">
                  {ROTATING_PATTERN.map((shift, idx) => (
                    <button key={idx} onClick={() => setCycleDay(idx)}
                      className={`flex flex-col items-center py-2 px-1 rounded-lg border text-xs transition ${
                        cycleDay === idx
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500'}`}>
                      <span className="font-bold">{shift}</span>
                      <span className="text-gray-500 text-xs">{idx + 1}</span>
                    </button>
                  ))}
                </div>
                {cycleDay !== null && (
                  <p className="text-xs text-blue-400 mt-2">
                    Hoy: día {cycleDay + 1} del ciclo — {SHIFT_LABELS[ROTATING_PATTERN[cycleDay]]}
                  </p>
                )}
              </div>
            )}

            {scheduleType === 'guard714' && (
              <div>
                <label className={labelClass}>¿En qué día del ciclo estás hoy?</label>
                <p className="text-xs text-gray-500 mb-3">7 días de Trabajo (W) + 14 Libres (L). Selecciona el día de hoy.</p>
                <div className="grid grid-cols-7 gap-1">
                  {GUARD_PATTERN.map((shift, idx) => (
                    <button key={idx} onClick={() => setCycleDay(idx)}
                      className={`flex flex-col items-center py-2 px-1 rounded-lg border text-xs transition ${
                        cycleDay === idx
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500'}`}>
                      <span className="font-bold">{shift}</span>
                      <span className="text-gray-500 text-xs">{idx + 1}</span>
                    </button>
                  ))}
                </div>
                {cycleDay !== null && (
                  <p className="text-xs text-blue-400 mt-2">
                    Hoy: día {cycleDay + 1} del ciclo — {SHIFT_LABELS[GUARD_PATTERN[cycleDay]]}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>Energía disponible por tipo de jornada</label>
              <div className="space-y-2 mt-2">
                {(scheduleType === 'guard714' ? ['Trabajo', 'Libre'] : SHIFT_TYPES).map(shift => (
                  <div key={shift} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                    <span className="text-sm text-gray-300 w-24">{shift}</span>
                    <div className="flex gap-2">
                      {[1,2,3,4,5].map(v => (
                        <button key={v} onClick={() => updateShiftEnergy(shift, v)}
                          className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                            shiftEnergy[shift] === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>{v}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BLOQUE 3 */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-blue-400">Disciplinas y equipamiento</h2>
            <div>
              <label className={labelClass}>Disciplinas que practicas</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DISCIPLINES.map(d => (
                  <button key={d} onClick={() => toggleItem(disciplines, setDisciplines, d)}
                    className={tagClass(disciplines.includes(d))}>{d}</button>
                ))}
              </div>
            </div>
            {disciplines.length > 0 && (
              <div>
                <label className={labelClass}>Disciplina prioritaria</label>
                <select className={inputClass} value={priorityDiscipline} onChange={e => setPriorityDiscipline(e.target.value)}>
                  <option value="">Selecciona</option>
                  {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Equipamiento disponible</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {EQUIPMENT.map(e => (
                  <button key={e} onClick={() => toggleItem(equipment, setEquipment, e)}
                    className={tagClass(equipment.includes(e))}>{e}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BLOQUE 4 */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-blue-400">Objetivos y estado actual</h2>
            <div>
              <label className={labelClass}>Objetivo general</label>
              <select className={inputClass} value={goal} onChange={e => setGoal(e.target.value)}>
                <option value="">Selecciona</option>
                <option value="rendimiento">Rendimiento / competición</option>
                <option value="salud">Salud y bienestar</option>
                <option value="distancia">Completar una distancia</option>
                <option value="perdida_peso">Pérdida de peso</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Nivel de forma actual (1-10)</label>
              <div className="flex items-center gap-4">
                <input type="range" min={1} max={10} value={currentFitness}
                  onChange={e => setCurrentFitness(parseInt(e.target.value))}
                  className="flex-1 accent-blue-500" />
                <span className="text-blue-400 font-bold text-xl w-8">{currentFitness}</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>¿Vienes de un parón?</label>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setFromBreak(true)} className={tagClass(fromBreak)}>Sí</button>
                <button onClick={() => setFromBreak(false)} className={tagClass(!fromBreak)}>No</button>
              </div>
            </div>
            {fromBreak && (
              <div>
                <label className={labelClass}>¿Cuántas semanas llevas parado?</label>
                <input className={inputClass} type="number" value={breakWeeks}
                  onChange={e => setBreakWeeks(e.target.value)} placeholder="Semanas" />
              </div>
            )}
          </div>
        )}

        {/* BLOQUE 5 */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-blue-400">
              Parámetros de rendimiento <span className="text-gray-500 text-sm font-normal">(opcional)</span>
            </h2>
            <div>
              <label className={labelClass}>FTP en watios (ciclismo)</label>
              <input className={inputClass} type="number" value={ftp} onChange={e => setFtp(e.target.value)} placeholder="Ej: 220" />
            </div>
            <div>
              <label className={labelClass}>Zonas de frecuencia cardíaca — rango en ppm</label>
              <div className="space-y-2 mt-2">
                {(['z1','z2','z3','z4','z5'] as const).map((z, i) => (
                  <div key={z} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                    <span className="text-sm text-gray-400 w-8">Z{i+1}</span>
                    <input className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      value={hrZones[z].min} onChange={e => setHrZones({...hrZones, [z]: {...hrZones[z], min: e.target.value}})}
                      placeholder="mín ppm" />
                    <span className="text-gray-500 text-sm">→</span>
                    <input className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      value={hrZones[z].max} onChange={e => setHrZones({...hrZones, [z]: {...hrZones[z], max: e.target.value}})}
                      placeholder="máx ppm" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Ritmos de carrera por zona — rango en min/km</label>
              <div className="space-y-2 mt-2">
                {(['z1','z2','z3','z4','z5'] as const).map((z, i) => (
                  <div key={z} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                    <span className="text-sm text-gray-400 w-8">Z{i+1}</span>
                    <input className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      value={runPaces[z].min} onChange={e => setRunPaces({...runPaces, [z]: {...runPaces[z], min: e.target.value}})}
                      placeholder="lento" />
                    <span className="text-gray-500 text-sm">→</span>
                    <input className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      value={runPaces[z].max} onChange={e => setRunPaces({...runPaces, [z]: {...runPaces[z], max: e.target.value}})}
                      placeholder="rápido" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)}
              className="bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-xl text-sm transition">
              ← Anterior
            </button>
          ) : <div />}
          {step < 5 ? (
            <button onClick={() => setStep(step + 1)}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl text-sm font-medium transition">
              Siguiente →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl text-sm font-medium transition disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar perfil ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}