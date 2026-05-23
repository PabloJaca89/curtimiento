'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import CalendarMonth from '@/components/calendar/CalendarMonth'

export default function CalendarioPage() {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
  }, [currentDate])

  const fetchSessions = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', start.toISOString().split('T')[0])
      .lte('date', end.toISOString().split('T')[0])

    setSessions(data || [])
    setLoading(false)
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

  const monthName = currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold tracking-widest">CURTIMIENTO</h1>
          <div className="flex gap-2">
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
          </div>
        </div>

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
            onRefresh={fetchSessions}
          />
        )}
      </div>
    </div>
  )
}