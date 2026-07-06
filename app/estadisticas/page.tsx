'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { obtenerDurezaSemanal } from '@/lib/fatigaService'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine
} from 'recharts'

const COLORES_ZONA: Record<string, string> = {
  Z1: '#22c55e', Z2: '#3b82f6', Z3: '#eab308', Z4: '#f97316', Z5: '#ef4444',
}
const COLORES_DISCIPLINA = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#14b8a6', '#ef4444', '#64748b']

const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const lunesDe = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  const dow = d.getDay()
  const diff = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - diff)
  return toStr(d)
}

const fmtSemana = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

const estiloTooltip = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#e5e7eb',
  fontSize: '12px',
}

export default function EstadisticasPage() {
  const [semanas, setSemanas] = useState<number>(8)
  const [loading, setLoading] = useState(true)
  const [sesiones, setSesiones] = useState<any[]>([])
  const [durezas, setDurezas] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setLoading(true)

    const hoy = new Date()
    const hoyStr = toStr(hoy)
    const inicio = new Date(lunesDe(hoyStr) + 'T12:00:00')
    inicio.setDate(inicio.getDate() - (semanas - 1) * 7)
    const inicioStr = toStr(inicio)

    const { data: s } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', inicioStr)
      .lte('date', hoyStr)
    setSesiones(s || [])

    const durs = await obtenerDurezaSemanal(session.user.id, semanas)
    setDurezas((durs || []).slice().reverse())

    setLoading(false)
  }, [semanas])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData() }, [fetchData])

  // ---------- Agregados ----------
  const hoyStr = toStr(new Date())
  const entrenos = sesiones.filter(s => s.day_type === 'training')
  const entrenosPasados = entrenos.filter(s => s.date <= hoyStr)
  const completadas = entrenosPasados.filter(s => s.completed)
  const descansos = sesiones.filter(s => s.day_type === 'rest' && s.date <= hoyStr)

  // Semanas del periodo (lunes) en orden cronológico
  const semanasPeriodo: string[] = (() => {
    const res: string[] = []
    const ini = new Date(lunesDe(hoyStr) + 'T12:00:00')
    ini.setDate(ini.getDate() - (semanas - 1) * 7)
    for (let i = 0; i < semanas; i++) {
      const d = new Date(ini)
      d.setDate(ini.getDate() + i * 7)
      res.push(toStr(d))
    }
    return res
  })()

  const datosCargaSemanal = semanasPeriodo.map(sem => {
    const delaSemana = entrenosPasados.filter(s => lunesDe(s.date) === sem)
    const planificada = delaSemana.reduce((acc, s) => acc + (Number(s.planned_load) || 0), 0)
    const realizada = delaSemana
      .filter(s => s.completed && s.perceived_rpe != null)
      .reduce((acc, s) => acc + (Number(s.perceived_rpe) || 0), 0)
    return { semana: fmtSemana(sem), Planificada: planificada, Realizada: realizada }
  })

  const datosVolumen = semanasPeriodo.map(sem => {
    const delaSemana = entrenosPasados.filter(s => lunesDe(s.date) === sem)
    const planificado = delaSemana.reduce((acc, s) => acc + (Number(s.planned_duration) || 0), 0)
    const realizado = delaSemana
      .filter(s => s.completed)
      .reduce((acc, s) => acc + (Number(s.actual_duration ?? s.planned_duration) || 0), 0)
    return {
      semana: fmtSemana(sem),
      Planificado: Math.round((planificado / 60) * 10) / 10,
      Realizado: Math.round((realizado / 60) * 10) / 10,
    }
  })

  const datosDesviacionRPE = semanasPeriodo.map(sem => {
    const conRPE = completadas.filter(
      s => lunesDe(s.date) === sem && s.perceived_rpe != null && s.planned_load != null
    )
    const desviacion = conRPE.length > 0
      ? conRPE.reduce((acc, s) => acc + (Number(s.perceived_rpe) - Number(s.planned_load)), 0) / conRPE.length
      : null
    return { semana: fmtSemana(sem), Desviación: desviacion !== null ? Math.round(desviacion * 100) / 100 : null }
  })

  const datosDureza = durezas.map((d: any) => ({
    semana: fmtSemana(d.semana_inicio),
    Dureza: d.nota,
  }))

  const datosZonas = (() => {
    const cuenta: Record<string, number> = {}
    completadas.forEach(s => {
      if (s.planned_zone) cuenta[s.planned_zone] = (cuenta[s.planned_zone] || 0) + 1
    })
    return ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']
      .filter(z => cuenta[z])
      .map(z => ({ name: z, value: cuenta[z] }))
  })()

  const datosDisciplinas = (() => {
    const minutos: Record<string, number> = {}
    completadas.forEach(s => {
      const min = Number(s.actual_duration ?? s.planned_duration) || 0
      if (min > 0) minutos[s.discipline] = (minutos[s.discipline] || 0) + min
    })
    return Object.entries(minutos)
      .map(([name, min]) => ({ name, value: Math.round((min / 60) * 10) / 10 }))
      .sort((a, b) => b.value - a.value)
  })()

  const adherencia = entrenosPasados.length > 0
    ? Math.round((completadas.length / entrenosPasados.length) * 100)
    : null

  const sinDatos = !loading && entrenosPasados.length === 0

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-widest">📊 ESTADÍSTICAS</h1>
            <a href="/calendario"
              className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl transition">
              ← Calendario
            </a>
          </div>
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {[4, 8, 12].map(n => (
              <button key={n} onClick={() => setSemanas(n)}
                className={`px-4 py-2 text-sm transition ${semanas === n ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {n} sem
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-20">Cargando...</div>
        ) : sinDatos ? (
          <div className="text-center text-gray-500 py-20">
            Aún no hay sesiones registradas en este periodo. Las estadísticas aparecerán cuando completes entrenamientos.
          </div>
        ) : (
          <>
            {/* Tarjetas resumen */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Adherencia</div>
                <div className="text-2xl font-bold text-blue-400">
                  {adherencia !== null ? `${adherencia}%` : '—'}
                </div>
                <div className="text-xs text-gray-600">{completadas.length} de {entrenosPasados.length} sesiones</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Volumen total</div>
                <div className="text-2xl font-bold text-green-400">
                  {Math.round(completadas.reduce((acc, s) => acc + (Number(s.actual_duration ?? s.planned_duration) || 0), 0) / 60 * 10) / 10} h
                </div>
                <div className="text-xs text-gray-600">en {semanas} semanas</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Descansos</div>
                <div className="text-2xl font-bold text-purple-400">{descansos.length}</div>
                <div className="text-xs text-gray-600">días de descanso en el periodo</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Sesiones con RPE</div>
                <div className="text-2xl font-bold text-yellow-400">
                  {completadas.filter(s => s.perceived_rpe != null).length}
                </div>
                <div className="text-xs text-gray-600">registradas con sensaciones</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Carga semanal: planificada vs realizada</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={datosCargaSemanal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="semana" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip contentStyle={estiloTooltip} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Planificada" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Realizada" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Volumen semanal (horas)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={datosVolumen}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="semana" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip contentStyle={estiloTooltip} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Planificado" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Realizado" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Dureza experimentada semanal</h3>
                {datosDureza.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={datosDureza}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="semana" stroke="#6b7280" fontSize={11} />
                      <YAxis domain={[0, 10]} stroke="#6b7280" fontSize={11} />
                      <Tooltip contentStyle={estiloTooltip} />
                      <Line type="monotone" dataKey="Dureza" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-gray-600 text-sm py-16 text-center">Sin datos de dureza todavía.</div>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Desviación RPE (percibida − planificada)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={datosDesviacionRPE}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="semana" stroke="#6b7280" fontSize={11} />
                    <YAxis domain={[-3, 3]} stroke="#6b7280" fontSize={11} />
                    <Tooltip contentStyle={estiloTooltip} />
                    <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="Desviación" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <div className="text-xs text-gray-600 mt-1">Positivo = te resulta más duro de lo planificado · Negativo = más fácil</div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Distribución de zonas (sesiones completadas)</h3>
                {datosZonas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={datosZonas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, value }) => `${name}: ${value}`}>
                        {datosZonas.map(z => (
                          <Cell key={z.name} fill={COLORES_ZONA[z.name] || '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={estiloTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-gray-600 text-sm py-16 text-center">Sin sesiones completadas con zona.</div>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Reparto por disciplina (horas realizadas)</h3>
                {datosDisciplinas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={datosDisciplinas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, value }) => `${name}: ${value}h`}>
                        {datosDisciplinas.map((d, i) => (
                          <Cell key={d.name} fill={COLORES_DISCIPLINA[i % COLORES_DISCIPLINA.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={estiloTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-gray-600 text-sm py-16 text-center">Sin sesiones completadas todavía.</div>
                )}
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  )
}