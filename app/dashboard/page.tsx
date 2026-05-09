'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
      }
    }
    checkUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold tracking-widest">CURTIMIENTO</h1>
          <button
            onClick={handleLogout}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-xl text-sm transition"
          >
            Cerrar sesión
          </button>
        </div>
        <div className="bg-gray-900 rounded-2xl p-8 text-center">
          <p className="text-gray-400 text-lg">¡Bienvenido! 👋</p>
          <p className="text-gray-500 text-sm mt-2">{user.email}</p>
          <p className="text-gray-600 text-sm mt-4">Etapa 1 completada ✅ — Aquí irá tu plan de entrenamiento</p>
        </div>
      </div>
    </div>
  )
}