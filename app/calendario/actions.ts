'use server'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 8192

// ─── LLAMADA BASE A CLAUDE ────────────────────────────────────────────────────
async function llamarClaude(system: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('API key no configurada')

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

// ─── PARSEAR FORMATO COMPACTO ─────────────────────────────────────────────────
// Formato: YYYY-MM-DD|Disciplina|Zona|Duración|Carga|Descripción
function parsearRespuesta(texto: string): any[] {
  const sesiones: any[] = []
  const lineas = texto.split('\n').filter(l => l.trim() && !l.startsWith('#'))

  for (const linea of lineas) {
    const partes = linea.split('|')
    if (partes.length < 4) continue

    const [date, discipline, zona, duracion, carga, descripcion] = partes.map(p => p.trim())

    // Validar fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const dayType = discipline.toLowerCase() === 'descanso' ? 'rest'
      : discipline.toLowerCase() === 'compromiso' ? 'compromise'
      : discipline.toLowerCase() === 'competición' ? 'competition'
      : 'training'

    sesiones.push({
      date,
      discipline: dayType === 'training' ? discipline : discipline,
      day_type: dayType,
      planned_zone: zona ? parseInt(zona.replace('Z', '')) || null : null,
      planned_duration: duracion ? parseInt(duracion) || null : null,
      planned_load: carga ? parseInt(carga) || null : null,
      title: descripcion || discipline,
      description: descripcion || null,
      type: dayType,
    })
  }

  return sesiones
}

// ─── CALCULAR RITMOS Y POTENCIAS DESDE PERFIL ────────────────────────────────
function extraerZonasTexto(perfil: any): string {
  const hr = perfil.heart_rate_zones || {}
  const pace = perfil.running_paces || {}
  const ftp = perfil.ftp || null

  const lineas = ['ZONAS DEL ATLETA:']

  for (const z of ['z1', 'z2', 'z3', 'z4', 'z5']) {
    const zNum = z.replace('z', 'Z')
    const hrZ = hr[z] ? `FC ${hr[z].min}-${hr[z].max} ppm` : ''
    const paceZ = pace[z] ? `Ritmo ${pace[z].max}-${pace[z].min} min/km` : ''
    const ftpZ = ftp ? calcularZonaFTP(ftp, z) : ''
    lineas.push(`${zNum}: ${[hrZ, paceZ, ftpZ].filter(Boolean).join(' | ')}`)
  }

  return lineas.join('\n')
}

function calcularZonaFTP(ftp: number, zona: string): string {
  const rangos: Record<string, [number, number]> = {
    z1: [0.55, 0.65],
    z2: [0.65, 0.75],
    z3: [0.75, 0.87],
    z4: [0.87, 1.00],
    z5: [1.00, 1.15],
  }
  const r = rangos[zona]
  if (!r) return ''
  return `Potencia ${Math.round(ftp * r[0])}-${Math.round(ftp * r[1])}w`
}

// ─── GENERAR PLAN (trimestre con contexto anual) ───────────────────────────────
export async function generarPlanAction(
  perfil: any,
  competiciones: any[],
  fechaInicio: string,
  fechaFin: string,
  instruccionesLibres?: string
): Promise<{ sesiones: any[] }> {

  const zonasTexto = extraerZonasTexto(perfil)

  // Competiciones del trimestre y del año completo
  const compTrimestre = competiciones.filter(c => c.date >= fechaInicio && c.date <= fechaFin)
  const compAnuales = competiciones.filter(c => c.date > fechaFin)

  const system = `Eres un entrenador experto en multideporte. 
Respondes ÚNICAMENTE con el plan en formato de texto plano, una sesión por línea.
Formato estricto: YYYY-MM-DD|Disciplina|Zona|Duración_min|Carga_1-10|Descripción_corta
- Zona: Z1, Z2, Z3, Z4, Z5 (vacío para fuerza/descanso)
- Disciplinas válidas: Running, Bici carretera, BTT, Spinning, Natación, Paddle surf, Fuerza tren inferior, Fuerza tren superior A, Fuerza tren superior B, Descanso
- Para Z3/Z4/Z5 incluye series y ritmos/potencias en la descripción
- Sin cabeceras, sin texto adicional, sin markdown`

  const prompt = `PERFIL DEL ATLETA:
Nombre: ${perfil.name}
Nivel: ${perfil.level}/5
Objetivo: ${perfil.general_goal}
Horas/semana: ${perfil.weekly_hours}h
Duración máxima sesión: ${perfil.max_session_duration}min
Disciplinas: ${perfil.disciplines?.list?.join(', ')}
Disciplina prioritaria: ${perfil.disciplines?.priority}
Equipamiento: ${perfil.equipment?.join(', ')}
${perfil.coming_from_break ? `Viene de parón de ${perfil.break_duration_weeks} semanas` : ''}
${perfil.injuries ? `Lesiones a tener en cuenta: ${perfil.injuries}` : ''}
Cadencia laboral: ${JSON.stringify(perfil.schedule_pattern)}

${zonasTexto}

COMPETICIONES EN ESTE TRIMESTRE (${fechaInicio} a ${fechaFin}):
${compTrimestre.length > 0 ? compTrimestre.map(c => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (Importancia ${c.competition_importance})`).join('\n') : 'Ninguna'}

COMPETICIONES FUTURAS A TENER EN CUENTA (orientan la progresión):
${compAnuales.length > 0 ? compAnuales.map(c => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (Importancia ${c.competition_importance})`).join('\n') : 'Ninguna'}

${instruccionesLibres ? `INSTRUCCIONES ADICIONALES DEL ATLETA:\n${instruccionesLibres}` : ''}

PERÍODO A PLANIFICAR: ${fechaInicio} al ${fechaFin}

REGLAS:
- Puesta a punto competición A: 10 días antes (carga mínima)
- Puesta a punto competición B: 3-4 días antes
- No aumentar carga más de 10% por semana
- Incluir días de descanso según disponibilidad energética de la cadencia
- Para Z3/Z4/Z5 especificar series y ritmos usando las zonas del atleta
- Fuerza tren superior: alternar Fuerza tren superior A (dorsal/tríceps) y Fuerza tren superior B (hombro/pecho). Nunca mezclar grupos en la misma sesión
- Fuerza tren inferior: SOLO en temporada invernal (octubre a marzo). En noviembre, diciembre, enero y febrero: hasta 2 sesiones/semana. En octubre y marzo: máximo 1 sesión/semana. De abril a septiembre: NO incluir tren inferior
- Días de descanso: máximo 1 cada 10 días. No incluir más descansos salvo puesta a punto o CA elevada
Genera el plan completo día a día del ${fechaInicio} al ${fechaFin}:`

  const texto = await llamarClaude(system, prompt)
  const sesiones = parsearRespuesta(texto)

  if (sesiones.length === 0) throw new Error('No se generaron sesiones válidas')

  return { sesiones }
}

// ─── RECALCULAR PLAN ──────────────────────────────────────────────────────────
export async function recalcularPlanAction(
  perfil: any,
  sesiones: any[],
  competiciones: any[],
  ca: any,
  motivo: string,
  instruccionesLibres?: string
): Promise<{ sesiones: any[] }> {

  const hoy = new Date().toISOString().split('T')[0]
  const fin = new Date()
  fin.setMonth(fin.getMonth() + 3)
  const fechaFin = fin.toISOString().split('T')[0]

  const zonasTexto = extraerZonasTexto(perfil)

  const system = `Eres un entrenador experto en multideporte.
Respondes ÚNICAMENTE con el plan en formato de texto plano, una sesión por línea.
Formato: YYYY-MM-DD|Disciplina|Zona|Duración_min|Carga_1-10|Descripción_corta
Sin cabeceras, sin texto adicional, sin markdown.`

  const prompt = `Recalcula el plan desde ${hoy} hasta ${fechaFin}.

FATIGA ACTUAL:
- Carga Alostática: ${ca.ca} (${ca.estado})
- Recomendación: ${ca.recomendacion}
- ACR: ${ca.acr}

${zonasTexto}

COMPETICIONES:
${competiciones.map(c => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (${c.competition_importance})`).join('\n')}

MOTIVO DEL RECÁLCULO: ${motivo}
${instruccionesLibres ? `INSTRUCCIONES DEL ATLETA: ${instruccionesLibres}` : ''}

REGLAS:
- NO incluyas sesiones anteriores a ${hoy}
- Si CA > 3.0 reduce carga. Si CA > 4.0 solo recuperación activa
- Respeta puestas a punto de competiciones
- Usa las zonas del atleta para series en Z3/Z4/Z5

Genera el plan del ${hoy} al ${fechaFin}:`

  const texto = await llamarClaude(system, prompt)
  const nuevasSesiones = parsearRespuesta(texto)

  if (nuevasSesiones.length === 0) throw new Error('No se generaron sesiones válidas')

  return { sesiones: nuevasSesiones }
}

// ─── CHAT ASISTENTE ───────────────────────────────────────────────────────────
export async function chatAsistenteAction(mensajes: any[], contexto: any): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('API key no configurada')

  const system = `Eres el asistente de entrenamiento de CURTIMIENTO.
Contexto actual del atleta:
- Carga Alostática: ${contexto.ca?.ca} (${contexto.ca?.estado})
- Próximas sesiones: ${contexto.sesionesProximas?.map((s: any) => `${s.date} ${s.discipline}`).join(', ')}

Cuando el atleta pida cambios en el plan, propón el cambio concreto y pide confirmación antes de aplicar.
Responde siempre en español y de forma concisa.`

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: mensajes,
    }),
  })

  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return data.content?.[0]?.text || ''
}