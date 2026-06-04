'use server'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 8192

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

  if (!response.ok) {
    const err = await response.text()
    if (err.includes('credit') || err.includes('billing') || err.includes('insufficient')) {
      throw new Error('SALDO_INSUFICIENTE')
    }
    throw new Error(err)
  }
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

function parsearRespuesta(texto: string): any[] {
  const sesiones: any[] = []
  const lineas = texto.split('\n').filter(l => l.trim() && !l.startsWith('#'))

  const normalizar: Record<string, string> = {
    'running': 'Running', 'carrera': 'Running', 'run': 'Running',
    'bici carretera': 'Bici carretera', 'ciclismo': 'Bici carretera', 'bici': 'Bici carretera', 'bike': 'Bici carretera',
    'btt': 'BTT', 'mtb': 'BTT',
    'spinning': 'Spinning', 'spin': 'Spinning',
    'natación': 'Natación', 'natacion': 'Natación', 'swim': 'Natación',
    'paddle surf': 'Paddle surf', 'paddle': 'Paddle surf',
    'fuerza tren inferior': 'Fuerza tren inferior', 'tren inferior': 'Fuerza tren inferior', 'fuerza inferior': 'Fuerza tren inferior',
    'fuerza tren superior a': 'Fuerza tren superior A', 'tren superior a': 'Fuerza tren superior A', 'dorsal/tríceps': 'Fuerza tren superior A', 'dorsal triceps': 'Fuerza tren superior A',
    'fuerza tren superior b': 'Fuerza tren superior B', 'tren superior b': 'Fuerza tren superior B', 'hombro/pecho': 'Fuerza tren superior B', 'hombro pecho': 'Fuerza tren superior B',
    'descanso': 'Descanso', 'rest': 'Descanso', 'brick': 'Running',
  }

  for (const linea of lineas) {
    const partes = linea.split('|')
    if (partes.length < 4) continue

    const [date, disciplineRaw, zona, duracion, carga, descripcion] = partes.map(p => p.trim())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const discLower = disciplineRaw.toLowerCase()
    const discipline = normalizar[discLower] || disciplineRaw

    if (discipline.toLowerCase().includes('competici')) continue

    const dayType = discipline.toLowerCase() === 'descanso' ? 'rest'
      : discipline.toLowerCase() === 'compromiso' ? 'compromise'
      : 'training'

    sesiones.push({
      date, discipline, day_type: dayType,
      planned_zone: zona ? parseInt(zona.replace('Z', '').replace('z', '')) || null : null,
      planned_duration: duracion ? parseInt(duracion) || null : null,
      planned_load: carga ? parseInt(carga) || null : null,
      title: descripcion || discipline,
      description: descripcion || null,
      type: dayType,
    })
  }

  return sesiones
}

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

function generarCadenciaTexto(perfil: any, fechaInicio: string, fechaFin: string): string {
  const sp = perfil.schedule_pattern
  if (!sp?.cycle_start || !sp?.pattern) return ''

  const pattern: string[] = sp.pattern
  const shiftEnergy: Record<string, number> = sp.shift_energy || {}
  const shiftNames: Record<string, string> = {
    'M': 'Mañanas', 'T': 'Tardes', 'N': 'Noches', 'S': 'Saliente', 'L': 'Libre'
  }

  const start = new Date(sp.cycle_start + 'T12:00:00')
  const inicio = new Date(fechaInicio + 'T12:00:00')
  const fin = new Date(fechaFin + 'T12:00:00')

  const lineas = ['CADENCIA LABORAL DÍA A DÍA:']
  const cursor = new Date(inicio)

  while (cursor <= fin) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    const diff = Math.round((cursor.getTime() - start.getTime()) / 86400000)
    const idx = ((diff % pattern.length) + pattern.length) % pattern.length
    const turno = pattern[idx]
    const energia = shiftEnergy[turno] || 3
    lineas.push(`${dateStr}: ${shiftNames[turno] || turno} (energía ${energia}/5)`)
    cursor.setDate(cursor.getDate() + 1)
  }

  return lineas.join('\n')
}

function calcularZonaFTP(ftp: number, zona: string): string {
  const rangos: Record<string, [number, number]> = {
    z1: [0.55, 0.65], z2: [0.65, 0.75], z3: [0.75, 0.87],
    z4: [0.87, 1.00], z5: [1.00, 1.15],
  }
  const r = rangos[zona]
  if (!r) return ''
  return `Potencia ${Math.round(ftp * r[0])}-${Math.round(ftp * r[1])}w`
}

const SYSTEM_PLAN = `Eres un entrenador experto en multideporte.
Respondes ÚNICAMENTE con el plan en formato de texto plano, una sesión por línea.
Formato estricto: YYYY-MM-DD|Disciplina|Zona|Duración_min|Carga_1-10|Descripción_corta
- Zona: Z1, Z2, Z3, Z4 o Z5 (vacío para fuerza y descanso)
- Disciplinas válidas (usa EXACTAMENTE estos nombres, sin variaciones):
  Running, Bici carretera, BTT, Spinning, Fuerza tren inferior, Fuerza tren superior A, Fuerza tren superior B, Descanso
- USA ÚNICAMENTE las disciplinas del perfil del atleta, no incluyas otras
- PROHIBIDO usar: ciclismo, carrera, natacion, bike, swim, brick, triatlón, o cualquier variación
- NUNCA generes sesiones de tipo Competición
- Para Z3/Z4/Z5 incluye series y ritmos/potencias en la descripción
- Sin cabeceras, sin texto adicional, sin markdown`

const REGLAS_COMUNES = `REGLAS ESTRICTAS — NO NEGOCIABLES:

DESCANSO:
- Obligatorio 1 día de descanso cada 8, 9 o 10 días. Cuenta los días desde el último descanso y coloca el siguiente en el día 8, 9 o 10 exactamente. NUNCA antes del día 8 salvo día antes de competición A o B. Esto supone mínimo 3 descansos al mes

DISTRIBUCIÓN DE ZONAS:
- Zona prioritaria: Z4. Pauta base: por cada 3 sesiones Z4, incluir 1 sesión Z3 y 1 sesión Z5
- Z3 aproximadamente 1 vez cada 3 semanas. Z5 aproximadamente 1 vez cada 2 semanas
- Es correcto encadenar hasta 4 sesiones suaves (Z1/Z2/gym) entre sesiones intensas — esto NO es un error, pero habitualmente serán 3 sesiones suaves entre las intensas. Dependerá del turno de trabajo y la energía disponible, si no hay mucha energía disponible NO se pondrá sesión intensa, cuando toque trabajar por la mañana no habrá z3, ni z4, ni z5.
- La secuencia típica tras Z4 o Z5 es: Z1/Z2 → gym → Z1/Z2 → vuelta a intensidad
- Días con energía 4 o 5 sobre 5: usar Z3, Z4 o Z5. NUNCA Z1 en un día de energía 4 o 5 salvo que sea el día inmediatamente antes o después de Z4/Z5
- El último o penúltimo día LIBRE antes de cambiar a MAÑANAS tiene que haber como mínimo Z3 alguno de esos días, salvo que interfiera con recuperación de competiciones pasadas o preparación de futuras competiciones.
- En bloques de 5 días Libres consecutivos: el día Libre 1 debe ser Z4 o Z5, el día Libre 5 debe ser Z4, Z5 o Z3 (si lleva más de 2 semanas sin Z3). Los días Libre 2, 3 y 4 siguen la secuencia normal de recuperación
- La disciplina prioritaria del atleta debe protagonizar la mayoría de las sesiones Z4 y Z5. Si la disciplina prioritaria es Running, al menos 2 de cada 3 sesiones Z4/Z5 deben ser Running. Si es Bici carretera, al menos 2 de cada 3 sesiones Z4/Z5 deben ser en bici
- Tras Z3, con 1 día suave de por medio, ya se puede meter Z4. Ejemplo: Z3 → Z1/Z2 o gym → Z4- Días con energía 3 sobre 5: Z2 o Z3 suave
- Días con energía 2 sobre 5: Z1 o Z2, máx 60min
- Días con energía 1 sobre 5: descanso obligatorio
- ALTERNANCIA OBLIGATORIA: nunca dos días consecutivos de la misma disciplina de cardio (running, bici, spinning). Ejemplo correcto: Running → Gym → Bici. Ejemplo incorrecto: Running → Running

ANTES/DESPUÉS DE SESIONES INTENSAS:
- Día antes de Z4 o Z5: Z1, Z2 de otra disciplina, o fuerza tren superior
- Día después de Z4 o Z5: Z1, Z2 de otra disciplina, o fuerza tren superior
- NUNCA dos días Z4 o Z5 consecutivos

PUESTA A PUNTO:
- Competición A: los 5 días previos solo Z2 y gym. Los 2 días inmediatamente anteriores: Z1 o descanso. Día posterior: descanso, Z1 o gym tren superior
- Competición B: los 2 días inmediatamente anteriores: Z1 o descanso. Resto de semana normal. Día posterior: descanso, Z1 o gym tren superior
- Competición C: los 2 días inmediatamente anteriores: Z1 o descanso. Día posterior: descanso, Z1 o gym tren superior
- EXCEPCIÓN día posterior: si la competición es OCR o Hyrox, el día después puede ser más activo según sensaciones

FUERZA:
- Alternar A (dorsal/tríceps) y B (hombro/pecho), nunca mezclar en la misma sesión
- Tren inferior: solo oct-mar. Nov-feb: hasta 2/semana. Oct y mar: máx 1/semana. Abr-sep: NO incluir

TÉCNICA:
- Para Z3/Z4/Z5 especificar series y ritmos exactos usando las zonas del atleta
- No aumentar carga más de 10% por semana`

export async function generarPlanAction(
  perfil: any,
  competiciones: any[],
  fechaInicio: string,
  fechaFin: string,
  instruccionesLibres?: string
): Promise<{ sesiones: any[] }> {

  const zonasTexto = extraerZonasTexto(perfil)
  const compTrimestre = competiciones.filter(c => c.date >= fechaInicio && c.date <= fechaFin)
  const compAnuales = competiciones.filter(c => c.date > fechaFin)
  const cadencia = generarCadenciaTexto(perfil, fechaInicio, fechaFin)

  const prompt = `PERFIL DEL ATLETA:
Nombre: ${perfil.name}
Nivel: ${perfil.level}/5
Objetivo: ${perfil.general_goal}
Horas/semana: ${perfil.weekly_hours}h
Duración máxima sesión: ${perfil.max_session_duration}min
Disciplinas (SOLO estas): ${perfil.disciplines?.list?.join(', ')}
Disciplina prioritaria: ${perfil.disciplines?.priority}
Equipamiento: ${perfil.equipment?.join(', ')}
${perfil.coming_from_break ? `Viene de parón de ${perfil.break_duration_weeks} semanas` : ''}
${perfil.injuries ? `Lesiones: ${perfil.injuries}` : ''}

${cadencia}

${zonasTexto}

COMPETICIONES EN EL TRIMESTRE (${fechaInicio} a ${fechaFin}):
${compTrimestre.length > 0 ? compTrimestre.map(c => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (Importancia ${c.competition_importance})`).join('\n') : 'Ninguna'}

COMPETICIONES FUTURAS (orientan la progresión a largo plazo):
${compAnuales.length > 0 ? compAnuales.map(c => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (Importancia ${c.competition_importance})`).join('\n') : 'Ninguna'}

${instruccionesLibres ? `INSTRUCCIONES DEL ATLETA:\n${instruccionesLibres}\n` : ''}
${REGLAS_COMUNES}

Genera el plan completo día a día del ${fechaInicio} al ${fechaFin}:`

  const texto = await llamarClaude(SYSTEM_PLAN, prompt)
  const sesiones = parsearRespuesta(texto)
  if (sesiones.length === 0) throw new Error('No se generaron sesiones válidas')

  // Rellenar días sin sesión como Descanso
  const fechasConSesion = new Set(sesiones.map(s => s.date))
  const cursor = new Date(fechaInicio + 'T12:00:00')
  const finDate = new Date(fechaFin + 'T12:00:00')
  while (cursor <= finDate) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (!fechasConSesion.has(dateStr)) {
      sesiones.push({
        date: dateStr, discipline: 'Descanso', day_type: 'rest',
        planned_zone: null, planned_duration: null, planned_load: null,
        title: 'Descanso', description: null, type: 'rest',
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  const { calcularPlannedLoad } = await import('@/lib/fatigaService')
  const { data: { session: authSession } } = await (await import('@/lib/supabase')).supabase.auth.getSession()
  if (authSession) {
    for (const s of sesiones) {
      if (s.day_type === 'training' && s.planned_zone && s.planned_duration) {
        const load = await calcularPlannedLoad(authSession.user.id, s.discipline, s.planned_zone, s.planned_duration)
        if (load !== null) s.planned_load = load
      }
    }
  }

  return { sesiones }
}

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
  const cadencia = generarCadenciaTexto(perfil, hoy, fechaFin)

  const prompt = `Recalcula el plan desde ${hoy} hasta ${fechaFin}.

PERFIL DEL ATLETA:
Nombre: ${perfil.name}, Nivel: ${perfil.level}/5
Disciplinas (SOLO estas): ${perfil.disciplines?.list?.join(', ')}
Horas/semana: ${perfil.weekly_hours}h, Duración máx: ${perfil.max_session_duration}min
${perfil.injuries ? `Lesiones: ${perfil.injuries}` : ''}

${cadencia}

FATIGA ACTUAL:
- Carga Alostática: ${ca.ca} (${ca.estado}) — ${ca.recomendacion}
- ACR: ${ca.acr}

${zonasTexto}

COMPETICIONES (no las generes, solo para puestas a punto):
${competiciones.length > 0 ? competiciones.map(c => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (${c.competition_importance})`).join('\n') : 'Ninguna'}

MOTIVO: ${motivo}
${instruccionesLibres ? `INSTRUCCIONES DEL ATLETA: ${instruccionesLibres}` : ''}

${REGLAS_COMUNES}
- Si CA > 3.0 reduce carga. Si CA > 4.0 solo recuperación activa los primeros días

Genera el plan del ${hoy} al ${fechaFin}:`

  const texto = await llamarClaude(SYSTEM_PLAN, prompt)
  const nuevasSesiones = parsearRespuesta(texto)
  if (nuevasSesiones.length === 0) throw new Error('No se generaron sesiones válidas')
  return { sesiones: nuevasSesiones }
}

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

  if (!response.ok) {
    const err = await response.text()
    if (err.includes('credit') || err.includes('billing') || err.includes('insufficient')) {
      throw new Error('SALDO_INSUFICIENTE')
    }
    throw new Error(err)
  }
  const data = await response.json()
  return data.content?.[0]?.text || ''
}