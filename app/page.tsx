import { redirect } from 'next/navigation'

// Página raíz: redirige al dashboard. Si no hay sesión iniciada,
// el propio dashboard redirige a /login.
export default function Home() {
  redirect('/dashboard')
}