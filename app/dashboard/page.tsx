'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { calcularCargaAlostatica } from '@/lib/fatigaService'
import { generarAlertasRiesgo, AlertaRiesgo, NivelAlerta } from '@/lib/alertasRiesgo'
import Link from 'next/link'

const DISCIPLINE_ICONS: Record<string, string> = {
  'Running': '🏃', 'Bici carretera': '🚴', 'BTT': '🚵', 'Spinning': '⚡',
  'Natación': '🏊', 'Paddle surf': '🏄', 'Fuerza tren superior A': '💪',
  'Fuerza tren superior B': '💪', 'Fuerza tren inferior': '🦵',
  'Descanso': '😴', 'Compromiso': '📅', 'Competición': '🏁',
}

const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function iconoDe(s: any): string {
  if (s.day_type === 'competition') return '🏁'
  if (s.day_type === 'rest') return '😴'
  if (s.day_type === 'compromise') return '📅'
  return DISCIPLINE_ICONS[s.discipline] || '📋'
}

const ALERTA_ESTILOS: Record<NivelAlerta, { border: string; bg: string; icono: string; iconColor: string; etiqueta: string }> = {
  alto:  { border: 'border-red-800',    bg: 'bg-red-950/40',    icono: '⚠️', iconColor: 'text-red-400',    etiqueta: 'Atención' },
  medio: { border: 'border-yellow-800', bg: 'bg-yellow-950/30', icono: '⚡', iconColor: 'text-yellow-400', etiqueta: 'Aviso' },
  info:  { border: 'border-blue-800',   bg: 'bg-blue-950/30',   icono: 'ℹ️', iconColor: 'text-blue-400',   etiqueta: 'Info' },
}

function PanelAlertas({ alertas }: { alertas: AlertaRiesgo[] }) {
  if (alertas.length === 0) return null
  return (
    <div className="space-y-3 mb-4">
      {alertas.map(a => {
        const e = ALERTA_ESTILOS[a.nivel]
        return (
          <div key={a.id} className={`border ${e.border} ${e.bg} rounded-2xl p-4`}>
            <div className="flex items-start gap-3">
              <span className={`text-lg ${e.iconColor} mt-0.5`}>{e.icono}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-white">{a.titulo}</span>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${e.iconColor} border ${e.border}`}>
                    {e.etiqueta}
                  </span>
                </div>
                <div className="text-sm text-gray-300 leading-snug">{a.mensaje}</div>
                {a.sugerencia && (
                  <div className="text-sm text-gray-400 mt-2 flex items-start gap-1.5">
                    <span className="text-gray-500">→</span>
                    <span>{a.sugerencia}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TarjetaSesion({ titulo, sesiones }: { titulo: string; sesiones: any[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="text-xs text-gray-500 mb-3 uppercase tracking-wider">{titulo}</div>
      {sesiones.length === 0 ? (
        <div className="text-gray-600 text-sm">Sin sesión planificada.</div>
      ) : (
        <div className="space-y-3">
          {sesiones.map((s: any) => (
            <div key={s.id}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{iconoDe(s)}</span>
                <span className="font-medium text-white">
                  {s.title || s.discipline || (s.day_type === 'rest' ? 'Descanso' : 'Sesión')}
                </span>
                {s.completed === true && <span className="text-green-400 text-sm">✓</span>}
                {s.completed === false && <span className="text-red-400 text-sm">✗</span>}
              </div>
              {(s.planned_zone || s.planned_duration || s.planned_load) && (
                <div className="text-xs text-gray-400 flex gap-3 ml-8">
                  {s.planned_zone && <span>Zona Z{s.planned_zone}</span>}
                  {s.planned_duration && <span>{s.planned_duration} min</span>}
                  {s.planned_load && <span>Carga {s.planned_load}/10</span>}
                </div>
              )}
              {s.description && (
                <div className="text-xs text-gray-500 mt-1 ml-8 leading-snug">{s.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sesionesHoy, setSesionesHoy] = useState<any[]>([])
  const [sesionesManana, setSesionesManana] = useState<any[]>([])
  const [ca, setCa] = useState<any>(null)
  const [proximaComp, setProximaComp] = useState<any>(null)
  const [alertas, setAlertas] = useState<AlertaRiesgo[]>([])

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }
    setUser(session.user)

    const hoy = new Date()
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    const hoyStr = toStr(hoy)
    const mananaStr = toStr(manana)

    const { data: s } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', hoyStr)
      .lte('date', mananaStr)
    const todas = s || []
    setSesionesHoy(todas.filter((x: any) => x.date === hoyStr))
    setSesionesManana(todas.filter((x: any) => x.date === mananaStr))

    const { data: comps } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('day_type', 'competition')
      .gte('date', hoyStr)
      .order('date', { ascending: true })
      .limit(1)
    setProximaComp(comps && comps.length > 0 ? comps[0] : null)

    const caHoy = await calcularCargaAlostatica(session.user.id, null)
    setCa(caHoy)

    // Datos para las alertas de riesgo: historial completado reciente (racha RPE)
    // y próximas sesiones (para sugerir qué intensa suavizar).
    const hace14 = new Date()
    hace14.setDate(hace14.getDate() - 14)
    const hace14Str = toStr(hace14)

    const { data: historial } = await supabase
      .from('sessions')
      .select('date, day_type, discipline, planned_zone, planned_load, perceived_rpe, completed')
      .eq('user_id', session.user.id)
      .eq('day_type', 'training')
      .eq('completed', true)
      .gte('date', hace14Str)
      .lt('date', hoyStr)

    const dentro15 = new Date()
    dentro15.setDate(dentro15.getDate() + 15)
    const dentro15Str = toStr(dentro15)

    const { data: proximas } = await supabase
      .from('sessions')
      .select('date, day_type, discipline, planned_zone, planned_load, perceived_rpe, completed')
      .eq('user_id', session.user.id)
      .gte('date', hoyStr)
      .lte('date', dentro15Str)

    setAlertas(generarAlertasRiesgo(caHoy, historial || [], proximas || []))

    setLoading(false)
  }, [router])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData() }, [fetchData])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return null

  const diasParaComp = proximaComp
    ? Math.floor(
        (new Date(proximaComp.date + 'T12:00:00').getTime() - new Date(toStr(new Date()) + 'T12:00:00').getTime()) / 86400000
      )
    : null

  const caColor = ca
    ? ca.ca <= 2.0 ? 'text-green-400'
    : ca.ca <= 3.0 ? 'text-blue-400'
    : ca.ca <= 3.9 ? 'text-yellow-400'
    : 'text-red-400'
    : 'text-gray-400'

  const fechaHoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">

        <div className="flex justify-between items-center mb-2">
          <h1 className="text-2xl font-bold tracking-widest">CURTIMIENTO</h1>
          <button
            onClick={handleLogout}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-xl text-sm transition"
          >
            Cerrar sesión
          </button>
        </div>
        <div className="text-sm text-gray-500 capitalize mb-6">{fechaHoy}</div>

        {loading ? (
          <div className="text-center text-gray-500 py-20">Cargando...</div>
        ) : (
          <>
            {/* Alertas de riesgo proactivas */}
            <PanelAlertas alertas={alertas} />

            {/* Estado de fatiga + próxima competición */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Estado de fatiga</div>
                {ca ? (
                  <>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className={`text-4xl font-bold ${caColor}`}>{ca.ca}</span>
                      <span className="text-gray-400">— {ca.estado}</span>
                    </div>
                    {ca.recomendacion && (
                      <div className="text-sm text-gray-400 mt-2">{ca.recomendacion}</div>
                    )}
                  </>
                ) : (
                  <div className="text-gray-600 text-sm">Sin datos de fatiga todavía.</div>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Próxima competición</div>
                {proximaComp ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">🏁</span>
                      <span className="font-medium text-white">
                        {proximaComp.modalidad || proximaComp.title || 'Competición'}
                      </span>
                      {proximaComp.competition_importance && (
                        <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full font-bold">
                          {proximaComp.competition_importance}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 ml-8">
                      {new Date(proximaComp.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                      {proximaComp.distancia && ` · ${proximaComp.distancia}`}
                    </div>
                    <div className="mt-2 ml-8">
                      <span className="text-2xl font-bold text-blue-400">{diasParaComp}</span>
                      <span className="text-sm text-gray-500 ml-1">{diasParaComp === 1 ? 'día' : 'días'}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-600 text-sm">No hay competiciones programadas.</div>
                )}
              </div>
            </div>

            {/* Hoy y mañana */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <TarjetaSesion titulo="Hoy" sesiones={sesionesHoy} />
              <TarjetaSesion titulo="Mañana" sesiones={sesionesManana} />
            </div>

            {/* Accesos directos */}
            <div className="grid grid-cols-3 gap-4">
              <Link href="/calendario"
                className="bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-2xl p-5 text-center transition group">
                <div className="text-3xl mb-2">🗓️</div>
                <div className="text-sm text-gray-400 group-hover:text-white transition">Calendario</div>
              </Link>
              <Link href="/estadisticas"
                className="bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-2xl p-5 text-center transition group">
                <div className="text-3xl mb-2">📊</div>
                <div className="text-sm text-gray-400 group-hover:text-white transition">Estadísticas</div>
              </Link>
              <Link href="/suplementacion"
                className="bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-2xl p-5 text-center transition group">
                <div className="text-3xl mb-2">💊</div>
                <div className="text-sm text-gray-400 group-hover:text-white transition">Suplementación</div>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}