// Exportación del plan de entrenamiento a formato iCalendar (.ics), estándar RFC 5545.
// Compatible con cualquier app de calendario (Apple, Outlook, Proton, Thunderbird...).
// No depende de Google ni de ningún servicio externo: genera el archivo en el navegador.

interface SesionICS {
  id?: string
  date: string
  discipline?: string
  day_type?: string
  title?: string
  description?: string
  planned_zone?: number | null
  planned_duration?: number | null
  planned_load?: number | null
  competition_importance?: string | null
  modalidad?: string | null
  distancia?: string | null
}

const ICONOS: Record<string, string> = {
  'Running': '🏃', 'Bici carretera': '🚴', 'BTT': '🚵', 'Spinning': '⚡',
  'Natación': '🏊', 'Paddle surf': '🏄', 'Fuerza tren superior A': '💪',
  'Fuerza tren superior B': '💪', 'Fuerza tren inferior': '🦵',
  'Descanso': '😴', 'Compromiso': '📅', 'Competición': '🏁',
}

// Escapa los caracteres especiales que exige el formato iCalendar.
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Plegado de líneas largas: el estándar limita a 75 octetos por línea.
// Las líneas que exceden se parten y continúan con un espacio al inicio.
function plegar(linea: string): string {
  if (linea.length <= 73) return linea
  const trozos: string[] = [linea.slice(0, 73)]
  let resto = linea.slice(73)
  while (resto.length > 72) {
    trozos.push(' ' + resto.slice(0, 72))
    resto = resto.slice(72)
  }
  if (resto.length) trozos.push(' ' + resto)
  return trozos.join('\r\n')
}

function fechaCompacta(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function fechaSiguienteCompacta(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function resumenSesion(s: SesionICS): string {
  if (s.day_type === 'competition') {
    const imp = s.competition_importance ? ` (${s.competition_importance})` : ''
    const nombre = [s.modalidad, s.distancia].filter(Boolean).join(' ') || s.title || 'Competición'
    return `🏁 ${nombre}${imp}`
  }
  if (s.day_type === 'rest') return '😴 Descanso'
  const icono = ICONOS[s.discipline || ''] || '📋'
  const zona = s.planned_zone ? ` Z${s.planned_zone}` : ''
  return `${icono} ${s.discipline || s.title || 'Sesión'}${zona}`
}

function descripcionSesion(s: SesionICS): string {
  const partes: string[] = []
  if (s.planned_zone) partes.push(`Zona Z${s.planned_zone}`)
  if (s.planned_duration) partes.push(`${s.planned_duration} min`)
  if (s.planned_load) partes.push(`Carga ${s.planned_load}/10`)
  const cabecera = partes.join(' · ')
  const cuerpo = s.description || ''
  return [cabecera, cuerpo].filter(Boolean).join('\n')
}

export function generarICS(sesiones: SesionICS[]): string {
  const now = new Date()
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CURTIMIENTO//Plan de entrenamiento//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CURTIMIENTO',
  ]

  sesiones
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((s, idx) => {
      const uid = `${s.id || `${fechaCompacta(s.date)}-${idx}`}@curtimiento`
      lineas.push('BEGIN:VEVENT')
      lineas.push(plegar(`UID:${uid}`))
      lineas.push(`DTSTAMP:${dtstamp}`)
      lineas.push(`DTSTART;VALUE=DATE:${fechaCompacta(s.date)}`)
      lineas.push(`DTEND;VALUE=DATE:${fechaSiguienteCompacta(s.date)}`)
      lineas.push(plegar(`SUMMARY:${escapar(resumenSesion(s))}`))
      const desc = descripcionSesion(s)
      if (desc) lineas.push(plegar(`DESCRIPTION:${escapar(desc)}`))
      if (s.day_type === 'competition') lineas.push('CATEGORIES:COMPETICION')
      lineas.push('END:VEVENT')
    })

  lineas.push('END:VCALENDAR')

  // El estándar exige separador de línea CRLF.
  return lineas.join('\r\n')
}

export function descargarICS(contenido: string, nombreArchivo: string): void {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}