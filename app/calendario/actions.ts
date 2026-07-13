'use server'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'
const MODEL_CHAT = 'claude-haiku-4-5'
const MAX_TOKENS = 32000

// Máximo de llamadas de continuación si la respuesta se corta por límite de tokens.
const MAX_CONTINUACIONES = 2

async function llamarClaude(system: string | any[], userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('API key no configurada')

  const systemBlocks = typeof system === 'string' ? [{ type: 'text', text: system }] : system

  let acumulado = ''

  for (let intento = 0; intento <= MAX_CONTINUACIONES; intento++) {
    const messages: any[] = [{ role: 'user', content: userPrompt }]
    // Si ya tenemos texto parcial, se envía como turno del assistant:
    // la API continúa exactamente donde se quedó (prefill).
    if (acumulado) messages.push({ role: 'assistant', content: acumulado })

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
        system: systemBlocks,
        messages,
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
    const trozo = data.content?.[0]?.text || ''

    if (data.stop_reason !== 'max_tokens') {
      return acumulado + trozo
    }

    // Respuesta cortada por max_tokens: acumulamos y reintentamos con continuación.
    // trimEnd es obligatorio: la API rechaza un prefill de assistant con espacios finales.
    acumulado = (acumulado + trozo).trimEnd()
    if (!acumulado) throw new Error('RESPUESTA_TRUNCADA')
  }

  // Tras agotar las continuaciones sigue cortada: la capa superior conserva el plan anterior.
  throw new Error('RESPUESTA_TRUNCADA')
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

  const DISCIPLINAS_VALIDAS = new Set([
    'Running', 'Bici carretera', 'BTT', 'Spinning', 'Natación', 'Paddle surf',
    'Fuerza tren inferior', 'Fuerza tren superior A', 'Fuerza tren superior B',
  ])

  for (const linea of lineas) {
    const partes = linea.split('|')
    if (partes.length < 4) continue

    const [date, disciplineRaw, zona, duracion, carga, descripcion] = partes.map(p => p.trim())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!disciplineRaw) continue

    const discLower = disciplineRaw.toLowerCase()
    const discipline = normalizar[discLower] || disciplineRaw

    if (discipline.toLowerCase().includes('competici')) continue

    // Línea sin disciplina reconocida y que no es Descanso: ruido de Claude, se descarta entera
    // (evita sesiones "training" fantasma sin disciplina, p. ej. "Recuperación completa").
    if (discipline !== 'Descanso' && !DISCIPLINAS_VALIDAS.has(discipline)) continue

    const dayType = discipline === 'Descanso' ? 'rest'
      : discipline.toLowerCase() === 'compromiso' ? 'compromise'
      : 'training'

    // Solo las sesiones de entrenamiento llevan zona, duración y carga.
    // Descansos y compromisos van siempre a null, aunque la IA rellene esos campos.
    const esEntreno = dayType === 'training'

    sesiones.push({
      date, discipline, day_type: dayType,
      planned_zone: esEntreno && zona ? parseInt(zona.replace('Z', '').replace('z', '')) || null : null,
      planned_duration: esEntreno && duracion ? parseInt(duracion) || null : null,
      planned_load: esEntreno && carga ? parseInt(carga) || null : null,
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
    'M': 'Mañanas', 'T': 'Tardes', 'N': 'Noches', 'S': 'Saliente', 'L': 'Libre', 'W': 'Trabajo'
  }

  const start = new Date(sp.cycle_start + 'T12:00:00')
  const lineas = ['CADENCIA LABORAL DÍA A DÍA (formato fecha: turno (energía/5)):']
  const cursor = new Date(fechaInicio + 'T12:00:00')

  while (true) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (dateStr > fechaFin) break
    const diff = Math.round((cursor.getTime() - start.getTime()) / 86400000)
    const idx = ((diff % pattern.length) + pattern.length) % pattern.length
    const turno = pattern[idx]
    const energia = shiftEnergy[turno] || 3
    lineas.push(`${dateStr}: ${shiftNames[turno] || turno} (${energia}/5)`)
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

// ---------- RPE percibida vs estimada ----------

// Estadísticas de desviación RPE (perceived_rpe - planned_load) sobre sesiones completadas.
// Devuelve null si hay menos de 3 sesiones con ambos valores.
function calcularEstadisticasRPE(historial: any[]): {
  n: number
  global: number
  porDisciplina: Record<string, { desv: number; n: number }>
  porZona: Record<string, { desv: number; n: number }>
} | null {
  const completadas = (historial || []).filter((s: any) =>
    s.day_type === 'training' && s.completed &&
    s.perceived_rpe != null && s.planned_load != null
  )
  if (completadas.length < 3) return null

  const media = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const r1 = (n: number) => Math.round(n * 10) / 10

  const desvsGlobal = completadas.map((s: any) => s.perceived_rpe - s.planned_load)

  const grupoDisc: Record<string, number[]> = {}
  const grupoZona: Record<string, number[]> = {}
  for (const s of completadas) {
    const d = s.perceived_rpe - s.planned_load
    if (s.discipline) {
      if (!grupoDisc[s.discipline]) grupoDisc[s.discipline] = []
      grupoDisc[s.discipline].push(d)
    }
    if (s.planned_zone) {
      const z = 'Z' + s.planned_zone
      if (!grupoZona[z]) grupoZona[z] = []
      grupoZona[z].push(d)
    }
  }

  const porDisciplina: Record<string, { desv: number; n: number }> = {}
  for (const [k, v] of Object.entries(grupoDisc)) porDisciplina[k] = { desv: r1(media(v)), n: v.length }
  const porZona: Record<string, { desv: number; n: number }> = {}
  for (const [k, v] of Object.entries(grupoZona)) porZona[k] = { desv: r1(media(v)), n: v.length }

  return { n: completadas.length, global: r1(media(desvsGlobal)), porDisciplina, porZona }
}

// Bloque de texto para el prompt de recálculo con las desviaciones e instrucciones de ajuste.
function generarAnalisisRPE(historial: any[]): string {
  const stats = calcularEstadisticasRPE(historial)
  if (!stats) return ''

  const signo = (n: number) => (n > 0 ? '+' : '') + n
  const desvGlobal = stats.global

  const lineas: string[] = []
  lineas.push(`FEEDBACK REAL DEL ATLETA (${stats.n} sesiones completadas recientes; desviación = RPE percibida 1-10 menos carga planificada 1-10):`)

  const etiquetaGlobal = desvGlobal >= 1
    ? '(las sesiones le resultan MÁS DURAS de lo planificado)'
    : desvGlobal <= -1
      ? '(las sesiones le resultan MÁS FÁCILES de lo planificado)'
      : '(percepción ajustada al plan)'
  lineas.push(`- Desviación media global: ${signo(desvGlobal)} ${etiquetaGlobal}`)

  for (const [disc, g] of Object.entries(stats.porDisciplina)) {
    if (g.n < 2) continue
    lineas.push(`- ${disc}: desviación ${signo(g.desv)} (n=${g.n})`)
  }
  for (const zona of ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']) {
    const g = stats.porZona[zona]
    if (!g || g.n < 2) continue
    lineas.push(`- ${zona}: desviación ${signo(g.desv)} (n=${g.n})`)
  }

  lineas.push('')
  lineas.push('AJUSTE OBLIGATORIO SEGÚN ESTE FEEDBACK:')
  if (desvGlobal >= 1.5) {
    lineas.push('- El atleta percibe el entrenamiento claramente MÁS DURO de lo planificado. REDUCE la carga: recorta la duración de las sesiones intensas (Z3/Z4/Z5) un 10-15% y sustituye 1 sesión intensa por semana por Z2. No compenses en otro sitio.')
  } else if (desvGlobal >= 0.8) {
    lineas.push('- El atleta percibe el entrenamiento algo más duro de lo planificado. Mantén la estructura pero acorta ligeramente (5-10%) las sesiones intensas.')
  } else if (desvGlobal <= -1.5) {
    lineas.push('- El atleta percibe el entrenamiento claramente MÁS FÁCIL de lo planificado. Puedes aumentar la duración de las sesiones intensas un 5-10%, respetando siempre la duración máxima del perfil y la regla de no subir más del 10% de carga por semana. NO añadas más días intensos de los que permiten las reglas.')
  } else if (desvGlobal <= -0.8) {
    lineas.push('- El atleta percibe el entrenamiento algo más fácil de lo planificado. Sé ligeramente más ambicioso en las series de las sesiones intensas (series algo más largas o menos recuperación), sin cambiar la estructura del plan.')
  } else {
    lineas.push('- La percepción del atleta coincide con lo planificado. Mantén el nivel de carga actual.')
  }
  lineas.push('- En las disciplinas o zonas listadas arriba con desviación ≥ +1.5, sé más conservador en duración e intensidad. En las de desviación ≤ -1.5, algo más ambicioso. Estas correcciones por disciplina/zona tienen prioridad sobre el ajuste global.')

  return lineas.join('\n')
}

function turnoDelDia(dateStr: string, perfil: any): string | null {
  const sp = perfil.schedule_pattern
  if (!sp?.cycle_start || !sp?.pattern) return null
  const pattern: string[] = sp.pattern
  const start = new Date(sp.cycle_start + 'T12:00:00')
  const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - start.getTime()) / 86400000)
  return pattern[((diff % pattern.length) + pattern.length) % pattern.length]
}

// VALIDADOR DETERMINISTA DE RPE: ajusta mecánicamente la duración de las sesiones
// intensas (Z3/Z4/Z5) del nuevo plan según la desviación RPE del historial.
// - desviación >= +1.5 → recorta 15% | >= +0.8 → recorta 8%
// - desviación <= -1.5 → alarga 10%  | <= -0.8 → alarga 5%
// Correcciones por disciplina (con n>=2) tienen prioridad sobre el factor global.
// Respeta: mínimo 20 min, duración máxima del perfil y límites de días de Trabajo
// (Running 45 min, Bici carretera 90 min). Redondea a múltiplos de 5 min.
// Solo toca duraciones, nunca zonas ni disciplinas (eso queda en manos de la IA
// para no romper el resto de reglas estructurales del plan).
function ajustarDuracionesPorRPE(sesiones: any[], historial: any[], perfil: any): void {
  const stats = calcularEstadisticasRPE(historial)
  if (!stats) return

  const factorGlobal = stats.global >= 1.5 ? 0.85
    : stats.global >= 0.8 ? 0.92
    : stats.global <= -1.5 ? 1.10
    : stats.global <= -0.8 ? 1.05
    : 1

  for (const s of sesiones) {
    if (s.day_type !== 'training') continue
    if ((s.planned_zone || 0) < 3) continue
    if (!s.planned_duration) continue

    let factor = factorGlobal
    const g = stats.porDisciplina[s.discipline]
    if (g && g.n >= 2) {
      if (g.desv >= 1.5) factor = Math.min(factor, 0.85)
      else if (g.desv <= -1.5) factor = Math.max(factor, 1.10)
    }
    if (factor === 1) continue

    let nueva = Math.round((s.planned_duration * factor) / 5) * 5
    nueva = Math.max(20, nueva)
    if (perfil.max_session_duration) nueva = Math.min(nueva, perfil.max_session_duration)
    if (turnoDelDia(s.date, perfil) === 'W') {
      if (s.discipline === 'Running') nueva = Math.min(nueva, 45)
      if (s.discipline === 'Bici carretera') nueva = Math.min(nueva, 90)
    }
    s.planned_duration = nueva
  }
}

// ---------- Prompts ----------

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
- Para Z1, Z2, fuerza y descanso: descripción de máximo 5 palabras (o vacía). NO detalles nada en las sesiones suaves
- Sin cabeceras, sin texto adicional, sin markdown
- Si el prompt incluye un bloque "INSTRUCCIONES DEL ATLETA — MÁXIMA PRIORIDAD", esas instrucciones PREVALECEN sobre cualquier regla posterior que las contradiga`

const REGLAS_COMUNES = `REGLAS ESTRICTAS — NO NEGOCIABLES (salvo INSTRUCCIONES DEL ATLETA que digan lo contrario):

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
- Tras Z3, con 1 día suave de por medio, ya se puede meter Z4. Ejemplo: Z3 → Z1/Z2 o gym → Z4
- Días con energía 3 sobre 5: Z2 o Z3 suave
- Días con energía 2 sobre 5: Z1 o Z2, máx 60min
- Días con energía 1 sobre 5: descanso obligatorio
- DÍAS DE TRABAJO (turno 'Trabajo'): aunque la energía sea baja, SÍ se permite meter intensidad si la sesión es CORTA. Máximo 2 sesiones intensas (Z3, Z4 o Z5) por cada bloque de 7 días de Trabajo, ÚNICAMENTE Running (máximo 45 min) o Bici carretera (máximo 90 min). El resto de días de Trabajo: gym, Z1, Z2 o descanso. Esta excepción tiene prioridad sobre la limitación por energía baja SOLO en los días de Trabajo. Aprovecha esta posibilidad para no dejar todos los días de Trabajo en suave.
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

// System prompt cacheado: SYSTEM_PLAN + REGLAS_COMUNES van juntos al system con
// prompt caching de Anthropic. Las lecturas cacheadas cuestan ~10% del precio normal.
// La caché dura 5 min: se aprovecha al encadenar operaciones (generar + ajustar, recálculos seguidos).
const SYSTEM_PLAN_CACHEADO = [
  {
    type: 'text',
    text: SYSTEM_PLAN + '\n\n' + REGLAS_COMUNES,
    cache_control: { type: 'ephemeral' },
  },
]

// Detecta si las instrucciones libres del atleta hablan de descansos: en ese caso,
// la gestión de descansos pasa a ser del atleta + la IA, y los validadores
// deterministas de descanso (separarDescansos y forzarDescansos) NO deben ejecutarse,
// porque impondrían el patrón por defecto (1 descanso cada 8-10 días) machacando
// la instrucción explícita del atleta (p. ej. "dos descansos por semana").
function atletaGestionaDescansos(instruccionesLibres?: string): boolean {
  return /descans/i.test(instruccionesLibres || '')
}

const CARDIO_DISCS = ['Running', 'Bici carretera', 'BTT', 'Spinning', 'Natación', 'Paddle surf']

function construirDescripcionZona(disc: string, zona: number, perfil: any): { title: string; description: string } {
  const z = 'z' + zona
  const hr = perfil.heart_rate_zones?.[z]
  const pace = perfil.running_paces?.[z]
  const ftp = perfil.ftp || null

  const partes: string[] = []
  if (hr) partes.push(`FC ${hr.min}-${hr.max} ppm`)
  if (disc === 'Running' && pace) partes.push(`ritmo ${pace.max}-${pace.min} min/km`)
  if (['Bici carretera', 'BTT', 'Spinning'].includes(disc) && ftp) {
    const p = calcularZonaFTP(ftp, z)
    if (p) partes.push(p.toLowerCase())
  }

  const detalle = partes.length ? ` Mantén ${partes.join(' / ')}.` : ''
  const esSuave = zona <= 2
  const title = `${disc} Z${zona} — ${esSuave ? 'rodaje suave' : 'sesión'}`
  const description = `${disc} en Z${zona}.${detalle} ${esSuave ? 'Ritmo cómodo y controlado, sin forzar.' : 'Mantén la intensidad objetivo.'}`
  return { title, description }
}

function elegirCardioDistinto(prevDisc: string | undefined, nextDisc: string | undefined, cardioDisponible: string[]): string | null {
  let opciones = cardioDisponible.filter(d => d !== prevDisc && d !== nextDisc)
  if (opciones.length === 0) opciones = cardioDisponible.filter(d => d !== prevDisc)
  if (opciones.length === 0) return null
  return opciones[0]
}

function corregirIntensidadYDisciplina(sesiones: any[], perfil: any): void {
  const lista: string[] = perfil.disciplines?.list || []
  const cardioDisponible = CARDIO_DISCS.filter(d => lista.includes(d))
  if (cardioDisponible.length === 0) return

  const esCardio = (s: any) => s && CARDIO_DISCS.includes(s.discipline)
  const esIntenso = (s: any) => s && (s.planned_zone || 0) >= 4
  const esEntreno = (s: any) => s && s.day_type === 'training'

  sesiones.sort((a, b) => a.date.localeCompare(b.date))

  for (let i = 1; i < sesiones.length; i++) {
    const prev = sesiones[i - 1]
    const cur = sesiones[i]
    const next = sesiones[i + 1]
    if (!esEntreno(cur)) continue

    if (esIntenso(prev) && esIntenso(cur)) {
      const disc = elegirCardioDistinto(prev.discipline, next?.discipline, cardioDisponible)
      if (disc) {
        cur.discipline = disc
        cur.planned_zone = 2
        cur.planned_duration = cur.planned_duration || 60
        cur.planned_load = null
        const d = construirDescripcionZona(disc, 2, perfil)
        cur.title = d.title
        cur.description = d.description
      }
      continue
    }

    if (esCardio(prev) && esCardio(cur) && prev.discipline === cur.discipline) {
      const disc = elegirCardioDistinto(prev.discipline, next?.discipline, cardioDisponible)
      if (disc) {
        cur.discipline = disc
        const d = construirDescripcionZona(disc, cur.planned_zone || 2, perfil)
        cur.title = d.title
        cur.description = d.description
      }
    }
  }
}

function energiaDelDia(dateStr: string, perfil: any): number {
  const sp = perfil.schedule_pattern
  if (!sp?.cycle_start || !sp?.pattern) return 3
  const pattern: string[] = sp.pattern
  const shiftEnergy: Record<string, number> = sp.shift_energy || {}
  const start = new Date(sp.cycle_start + 'T12:00:00')
  const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - start.getTime()) / 86400000)
  const idx = ((diff % pattern.length) + pattern.length) % pattern.length
  return shiftEnergy[pattern[idx]] ?? 3
}

function forzarDescansos(sesiones: any[], perfil: any): void {
  sesiones.sort((a, b) => a.date.localeCompare(b.date))

  const esIntenso = (s: any) => (s?.planned_zone || 0) >= 3
  const esGym = (s: any) => typeof s?.discipline === 'string' && s.discipline.startsWith('Fuerza')
  const esDescanso = (s: any) => s?.day_type === 'rest'
  const esSuave = (s: any) => s?.day_type === 'training' && (s?.planned_zone || 0) < 3

  const ponerDescanso = (s: any) => {
    s.discipline = 'Descanso'; s.day_type = 'rest'; s.type = 'rest'
    s.planned_zone = null; s.planned_duration = null; s.planned_load = null
    s.title = 'Descanso'; s.description = null
  }

  const hayGymCerca = (idx: number, radio: number): boolean => {
    for (let j = Math.max(0, idx - radio); j <= Math.min(sesiones.length - 1, idx + radio); j++) {
      if (j !== idx && esGym(sesiones[j])) return true
    }
    return false
  }

  let inicioRacha = 0
  for (let i = 0; i <= sesiones.length; i++) {
    const s = sesiones[i]
    if (s && !esDescanso(s)) continue

    const longitud = i - inicioRacha
    if (longitud >= 11) {
      const desde = inicioRacha + 7
      const hasta = Math.min(inicioRacha + 10, i - 1)
      const candidatos: number[] = []
      for (let k = desde; k <= hasta; k++) candidatos.push(k)

      const suaves = candidatos.filter(k => esSuave(sesiones[k]) && (!esGym(sesiones[k]) || !hayGymCerca(k, 3)))
      const pool = suaves.length > 0
        ? suaves
        : candidatos.filter(k => esSuave(sesiones[k]))

      if (pool.length > 0) {
        const pegadoADuro = (k: number) =>
          (k > 0 && esIntenso(sesiones[k - 1])) || (k < sesiones.length - 1 && esIntenso(sesiones[k + 1]))
        const bajaEnergia = pool.filter(k => energiaDelDia(sesiones[k].date, perfil) < 3)
        const base = bajaEnergia.length > 0 ? bajaEnergia : pool
        const conDuro = base.filter(pegadoADuro)
        const elegido = (conDuro.length > 0 ? conDuro : base)[0]
        ponerDescanso(sesiones[elegido])
      }
    }

    inicioRacha = i + 1
  }
}

function asegurarPlannedLoad(sesiones: any[]): void {
  const fallback: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 7, 5: 9 }
  for (const s of sesiones) {
    if (s.day_type === 'training' && s.planned_zone && (s.planned_load == null)) {
      s.planned_load = fallback[s.planned_zone] || 4
    }
  }
}

function aplicarPrePostCompeticion(sesiones: any[], competiciones: any[], perfil: any): void {
  if (!competiciones || competiciones.length === 0) return

  const porFecha: Record<string, any> = {}
  for (const s of sesiones) {
    if (s.day_type === 'training') porFecha[s.date] = s
  }

  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const capPara = (importancia: string, offset: number): number | null => {
    if (importancia === 'A') {
      if (offset >= -5 && offset <= -3) return 2
      if (offset === -2 || offset === -1) return 1
      if (offset === 1) return 1
      if (offset >= 2 && offset <= 5) return 2
    } else if (importancia === 'B') {
      if (offset >= -4 && offset <= -1) return 2
      if (offset === 1) return 1
      if (offset >= 2 && offset <= 5) return 2
    } else {
      if (offset >= -3 && offset <= -1) return 2
      if (offset >= 1 && offset <= 3) return 2
    }
    return null
  }

  const porFechaTodo: Record<string, any> = {}
  for (const s of sesiones) porFechaTodo[s.date] = s

  const ponerDescanso = (s: any) => {
    s.discipline = 'Descanso'; s.day_type = 'rest'; s.type = 'rest'
    s.planned_zone = null; s.planned_duration = null; s.planned_load = null
    s.title = 'Descanso'; s.description = null
  }

  for (const comp of competiciones) {
    const base = new Date(comp.date + 'T12:00:00')
    for (const offset of [-1, 1]) {
      const d = new Date(base); d.setDate(d.getDate() + offset)
      const fecha = toStr(d)
      // Si ese día -1/+1 coincide con OTRA competición, no se toca (evita duplicados)
      const esOtraCompeticion = competiciones.some((c: any) => c.date === fecha && c !== comp)
      if (esOtraCompeticion) continue
      const s = porFechaTodo[fecha]
      if (s && s.day_type !== 'competition') ponerDescanso(s)
    }
  }

  for (const comp of competiciones) {
    const importancia = comp.competition_importance || 'B'
    const base = new Date(comp.date + 'T12:00:00')

    for (let offset = -5; offset <= 5; offset++) {
      if (offset === 0) continue
      const cap = capPara(importancia, offset)
      if (cap == null) continue

      const d = new Date(base)
      d.setDate(d.getDate() + offset)
      const s = porFecha[toStr(d)]
      if (!s) continue

      const zona = s.planned_zone || 0
      if (zona === 0 || zona <= cap) continue

      s.planned_zone = cap
      s.planned_duration = s.planned_duration || (cap <= 1 ? 30 : 45)
      s.planned_load = null
      if (cap <= 1) {
        s.title = `${s.discipline} Z1 — descarga pre/post competición`
        s.description = 'Sesión muy suave de descarga. Piernas sueltas, sin forzar.'
      } else {
        const desc = construirDescripcionZona(s.discipline, cap, perfil)
        s.title = desc.title
        s.description = desc.description
      }
    }
  }
}

function corregirFuerzaEstacional(sesiones: any[]): void {
  sesiones.sort((a, b) => a.date.localeCompare(b.date))
  let ultimoSuperior: 'A' | 'B' | null = null
  for (const s of sesiones) {
    if (s.day_type !== 'training') continue
    const disc = s.discipline || ''
    if (disc === 'Fuerza tren superior A') { ultimoSuperior = 'A'; continue }
    if (disc === 'Fuerza tren superior B') { ultimoSuperior = 'B'; continue }
    if (disc === 'Fuerza tren inferior') {
      const mes = parseInt(s.date.slice(5, 7), 10)
      if (mes >= 4 && mes <= 9) {
        const nuevo: 'A' | 'B' = ultimoSuperior === 'A' ? 'B' : 'A'
        s.discipline = nuevo === 'A' ? 'Fuerza tren superior A' : 'Fuerza tren superior B'
        s.title = s.discipline
        s.description = nuevo === 'A'
          ? 'Fuerza de tren superior: dorsal y tríceps.'
          : 'Fuerza de tren superior: hombro y pecho.'
        ultimoSuperior = nuevo
      }
    }
  }
}

function forzarSeparacionIntensas(sesiones: any[], perfil: any): void {
  const lista: string[] = perfil.disciplines?.list || []
  const cardioDisponible = CARDIO_DISCS.filter(d => lista.includes(d))
  sesiones.sort((a, b) => a.date.localeCompare(b.date))

  const esIntenso = (s: any) => s && s.day_type === 'training' && (s.planned_zone || 0) >= 3
  const diasEntre = (a: string, b: string) =>
    Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

  let ultimaIntensa: string | null = null
  for (let i = 0; i < sesiones.length; i++) {
    const s = sesiones[i]
    if (!esIntenso(s)) continue

    if (ultimaIntensa && diasEntre(ultimaIntensa, s.date) <= 2) {
      const prev = sesiones[i - 1]
      const next = sesiones[i + 1]
      const disc = cardioDisponible.length > 0
        ? (elegirCardioDistinto(prev?.discipline, next?.discipline, cardioDisponible) || s.discipline)
        : s.discipline
      s.discipline = disc
      s.planned_zone = 2
      s.planned_duration = s.planned_duration || 60
      s.planned_load = null
      const d = construirDescripcionZona(disc, 2, perfil)
      s.title = d.title
      s.description = d.description
    } else {
      ultimaIntensa = s.date
    }
  }
}

function aplicarReglasDiaTrabajo(sesiones: any[], perfil: any): void {
  const sp = perfil.schedule_pattern
  if (!sp?.cycle_start || !sp?.pattern) return
  const pattern: string[] = sp.pattern
  const start = new Date(sp.cycle_start + 'T12:00:00')
  const turnoDe = (dateStr: string) => {
    const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - start.getTime()) / 86400000)
    return pattern[((diff % pattern.length) + pattern.length) % pattern.length]
  }

  sesiones.sort((a, b) => a.date.localeCompare(b.date))

  const esIntenso = (s: any) => s && s.day_type === 'training' && (s.planned_zone || 0) >= 3
  const diasEntre = (a: string, b: string) =>
    Math.abs(Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000))
  const bajarAZ2 = (s: any) => {
    const disc = s.discipline
    s.planned_zone = 2
    s.planned_duration = s.planned_duration || 60
    s.planned_load = null
    const d = construirDescripcionZona(disc, 2, perfil)
    s.title = d.title
    s.description = d.description
  }

  let intensasEnBloque = 0
  for (const s of sesiones) {
    const turno = turnoDe(s.date)
    if (turno !== 'W') { intensasEnBloque = 0; continue }
    if (!esIntenso(s)) continue

    const disc = s.discipline || ''
    if (disc !== 'Running' && disc !== 'Bici carretera') {
      bajarAZ2(s)
      continue
    }
    if (disc === 'Running' && (s.planned_duration || 0) > 45) s.planned_duration = 45
    if (disc === 'Bici carretera' && (s.planned_duration || 0) > 90) s.planned_duration = 90
    intensasEnBloque++
    if (intensasEnBloque > 2) {
      bajarAZ2(s)
      intensasEnBloque--
    }
  }

  const haySeparacion = (fecha: string) =>
    sesiones.filter(esIntenso).every(x => x.date === fecha || diasEntre(x.date, fecha) >= 3)

  const procesarBloque = (dias: any[]) => {
    let count = dias.filter(esIntenso).length
    for (const s of dias) {
      if (count >= 2) break
      if (esIntenso(s)) continue
      const disc = s.discipline || ''
      if (disc !== 'Running' && disc !== 'Bici carretera') continue
      if (!haySeparacion(s.date)) continue
      s.planned_zone = 4
      s.planned_duration = disc === 'Running' ? 45 : 90
      s.planned_load = null
      const d = construirDescripcionZona(disc, 4, perfil)
      s.title = `${d.title} (corta, día de trabajo)`
      s.description = d.description
      count++
    }
  }

  let bloque: any[] = []
  for (const s of sesiones) {
    if (turnoDe(s.date) === 'W') {
      bloque.push(s)
    } else {
      if (bloque.length) procesarBloque(bloque)
      bloque = []
    }
  }
  if (bloque.length) procesarBloque(bloque)
}

function separarDescansos(sesiones: any[], competiciones: any[], perfil: any): void {
  sesiones.sort((a, b) => a.date.localeCompare(b.date))

  const esDescanso = (s: any) => s?.day_type === 'rest'
  const lista: string[] = perfil.disciplines?.list || []
  const cardioDisponible = CARDIO_DISCS.filter(d => lista.includes(d))

  const diasEntre = (a: string, b: string) =>
    Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

  const protegeCompeticion = (fecha: string) => {
    for (const c of competiciones) {
      const off = diasEntre(c.date, fecha)
      const imp = c.competition_importance || 'B'
      const pre = imp === 'A' ? 5 : imp === 'B' ? 4 : 3
      const post = imp === 'C' ? 3 : 5
      if (off < 0 && off >= -pre) return true
      if (off > 0 && off <= post) return true
    }
    return false
  }

  const convertirEnSuave = (s: any, prevDisc?: string, nextDisc?: string) => {
    const disc = cardioDisponible.length > 0
      ? (elegirCardioDistinto(prevDisc, nextDisc, cardioDisponible) || cardioDisponible[0])
      : null
    if (!disc) return
    s.discipline = disc
    s.day_type = 'training'; s.type = 'training'
    s.planned_zone = 2
    s.planned_duration = 60
    s.planned_load = null
    const d = construirDescripcionZona(disc, 2, perfil)
    s.title = d.title
    s.description = d.description
  }

  let ultimoDescanso: string | null = null
  for (let i = 0; i < sesiones.length; i++) {
    const s = sesiones[i]
    if (!esDescanso(s)) continue

    if (ultimoDescanso && diasEntre(ultimoDescanso, s.date) < 5) {
      if (protegeCompeticion(s.date)) {
        ultimoDescanso = s.date
        continue
      }
      convertirEnSuave(s, sesiones[i - 1]?.discipline, sesiones[i + 1]?.discipline)
    } else {
      ultimoDescanso = s.date
    }
  }
}

// Validador de distribución de zonas en bloques de días Libres (≥2 consecutivos):
// primer libre → Z4 con disciplina prioritaria, último libre → mínimo Z3.
// Se salta si hay una competición en los 3 días previos al bloque.
function validarBloquesLibres(sesiones: any[], competiciones: any[], perfil: any): void {
  if (!perfil.schedule_pattern?.cycle_start || !perfil.schedule_pattern?.pattern) return
  const sp = perfil.schedule_pattern
  const patternArr: string[] = sp.pattern
  const cycleStart = new Date(sp.cycle_start + 'T12:00:00')
  const discPrioritaria = perfil.disciplines?.priority || 'Running'

  sesiones.sort((a, b) => a.date.localeCompare(b.date))

  const getTurno = (dateStr: string) => {
    const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - cycleStart.getTime()) / 86400000)
    const idx = ((diff % patternArr.length) + patternArr.length) % patternArr.length
    return patternArr[idx]
  }

  let bloqueLibres: any[] = []
  for (let i = 0; i <= sesiones.length; i++) {
    const s = sesiones[i]
    const turno = s ? getTurno(s.date) : null
    const esLibreEntrenamiento = turno === 'L' && s?.day_type === 'training'

    if (esLibreEntrenamiento) {
      bloqueLibres.push(s)
    } else {
      if (bloqueLibres.length >= 2) {
        const fechaPrimerLibre = bloqueLibres[0].date
        const hayCompReciente = competiciones.some((c: any) => {
          const diffDias = Math.round(
            (new Date(fechaPrimerLibre + 'T12:00:00').getTime() - new Date(c.date + 'T12:00:00').getTime()) / 86400000
          )
          return diffDias >= 0 && diffDias <= 3
        })

        if (!hayCompReciente) {
          const primero = bloqueLibres[0]
          if ((primero.planned_zone || 0) < 4) {
            primero.planned_zone = 4
            primero.discipline = discPrioritaria
            primero.title = `${discPrioritaria} Z4 — sesión de calidad`
            primero.description = `Sesión intensa en Z4. Usar zonas del atleta.`
            primero.planned_load = null
          }
          const ultimo = bloqueLibres[bloqueLibres.length - 1]
          if ((ultimo.planned_zone || 0) < 3) {
            ultimo.planned_zone = 3
            ultimo.discipline = discPrioritaria
            ultimo.title = `${discPrioritaria} Z3 — sweet spot`
            ultimo.description = `Sesión a ritmo de umbral aeróbico. Usar zonas del atleta.`
            ultimo.planned_load = null
          }
        }
      }
      bloqueLibres = []
    }
  }
}

// Corrige Z4/Z5 el día inmediatamente anterior a una competición (sesión corta de activación)
function corregirVisperaCompeticion(sesiones: any[], competiciones: any[]): void {
  const fechasCompeticion = new Set(competiciones.map((c: any) => c.date))
  for (const s of sesiones) {
    if ((s.planned_zone || 0) >= 4) {
      const diaSiguiente = new Date(s.date + 'T12:00:00')
      diaSiguiente.setDate(diaSiguiente.getDate() + 1)
      const diaSiguienteStr = `${diaSiguiente.getFullYear()}-${String(diaSiguiente.getMonth() + 1).padStart(2, '0')}-${String(diaSiguiente.getDate()).padStart(2, '0')}`
      if (fechasCompeticion.has(diaSiguienteStr)) {
        s.planned_zone = 2
        s.planned_duration = ['Bici carretera', 'BTT', 'Spinning'].includes(s.discipline) ? 75 : 30
        s.title = 'Activación suave pre-competición'
        s.description = 'Sesión corta de activación. Mantén las piernas sueltas, sin forzar.'
        s.planned_load = 3
      }
    }
  }
}

function rellenarDiasEnBlanco(sesiones: any[], fechaInicio: string, fechaFin: string): void {
  const fechasConSesion = new Set(sesiones.map(s => s.date))
  const cursor = new Date(fechaInicio + 'T12:00:00')
  while (true) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (dateStr > fechaFin) break
    if (!fechasConSesion.has(dateStr)) {
      sesiones.push({
        date: dateStr, discipline: 'Descanso', day_type: 'rest',
        planned_zone: null, planned_duration: null, planned_load: null,
        title: 'Descanso', description: null, type: 'rest',
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
}

async function aplicarTodosLosValidadores(
  sesiones: any[],
  competiciones: any[],
  perfil: any,
  fechaInicio: string,
  fechaFin: string,
  historialRPE?: any[],
  descansosDelAtleta?: boolean
) {
  rellenarDiasEnBlanco(sesiones, fechaInicio, fechaFin)
  corregirVisperaCompeticion(sesiones, competiciones)
  validarBloquesLibres(sesiones, competiciones, perfil)
  corregirIntensidadYDisciplina(sesiones, perfil)
  corregirFuerzaEstacional(sesiones)
  aplicarReglasDiaTrabajo(sesiones, perfil)
  forzarSeparacionIntensas(sesiones, perfil)
  aplicarPrePostCompeticion(sesiones, competiciones, perfil)

  // Los validadores de descanso imponen el patrón por defecto (1 descanso cada 8-10
  // días). Si el atleta ha dado instrucciones explícitas sobre descansos, NO se
  // ejecutan: en ese caso los descansos los deciden el atleta y la IA.
  if (!descansosDelAtleta) {
    separarDescansos(sesiones, competiciones, perfil)
    forzarDescansos(sesiones, perfil)
  }

  // Ajuste determinista por RPE: se aplica el último (sobre duraciones ya definitivas)
  // y antes del cálculo de planned_load, para que la carga refleje la duración ajustada.
  if (historialRPE && historialRPE.length > 0) {
    ajustarDuracionesPorRPE(sesiones, historialRPE, perfil)
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

  asegurarPlannedLoad(sesiones)
}

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

${instruccionesLibres ? `INSTRUCCIONES DEL ATLETA — MÁXIMA PRIORIDAD:
${instruccionesLibres}
Estas instrucciones PREVALECEN sobre cualquier regla de tu sistema que las contradiga (por ejemplo, la frecuencia de descansos o la distribución de zonas). Cúmplelas LITERALMENTE en TODO el rango de fechas del ${fechaInicio} al ${fechaFin}, todos los meses incluidos.
` : ''}
Genera el plan completo día a día del ${fechaInicio} al ${fechaFin}, cumpliendo las reglas estrictas de tu sistema:`

  const texto = await llamarClaude(SYSTEM_PLAN_CACHEADO, prompt)
  const sesiones = parsearRespuesta(texto)
  if (sesiones.length === 0) throw new Error('No se generaron sesiones válidas')

  await aplicarTodosLosValidadores(
    sesiones, competiciones, perfil, fechaInicio, fechaFin,
    undefined, atletaGestionaDescansos(instruccionesLibres)
  )

  return { sesiones }
}

export async function recalcularPlanAction(
  perfil: any,
  historial: any[],
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
  const analisisRPE = generarAnalisisRPE(historial)

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
- Si CA > 3.0 reduce carga. Si CA > 4.0 solo recuperación activa los primeros días

${analisisRPE ? `${analisisRPE}\n` : ''}
${zonasTexto}

COMPETICIONES (no las generes, solo para puestas a punto):
${competiciones.length > 0 ? competiciones.map(c => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (${c.competition_importance})`).join('\n') : 'Ninguna'}

MOTIVO: ${motivo}
${instruccionesLibres ? `INSTRUCCIONES DEL ATLETA — MÁXIMA PRIORIDAD:
${instruccionesLibres}
Estas instrucciones PREVALECEN sobre cualquier regla de tu sistema que las contradiga (por ejemplo, la frecuencia de descansos o la distribución de zonas). Cúmplelas LITERALMENTE en TODO el rango de fechas del ${hoy} al ${fechaFin}, todos los meses incluidos.
` : ''}
Genera el plan del ${hoy} al ${fechaFin}, cumpliendo las reglas estrictas de tu sistema:`

  const texto = await llamarClaude(SYSTEM_PLAN_CACHEADO, prompt)
  const nuevasSesiones = parsearRespuesta(texto)
  if (nuevasSesiones.length === 0) throw new Error('No se generaron sesiones válidas')

  await aplicarTodosLosValidadores(
    nuevasSesiones, competiciones, perfil, hoy, fechaFin,
    historial, atletaGestionaDescansos(instruccionesLibres)
  )

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
      model: MODEL_CHAT,
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

const SYSTEM_VENTANA = `Eres un entrenador experto en multideporte ajustando la puesta a punto y la recuperación alrededor de una competición.
Respondes ÚNICAMENTE con las sesiones en formato de texto plano, una por línea.
Formato estricto: YYYY-MM-DD|Disciplina|Zona|Duración_min|Carga_1-10|Descripción_corta
- Zona: Z1, Z2, Z3, Z4 o Z5 (vacío para fuerza y descanso)
- Disciplinas válidas (usa EXACTAMENTE estos nombres): Running, Bici carretera, BTT, Spinning, Fuerza tren inferior, Fuerza tren superior A, Fuerza tren superior B, Descanso
- USA ÚNICAMENTE las disciplinas del perfil del atleta
- NUNCA generes la sesión de Competición (ya existe, no la toques)
- Para Z3/Z4/Z5 incluye series y ritmos en la descripción. Para el resto: descripción de máximo 5 palabras o vacía
- Sin cabeceras, sin texto adicional, sin markdown`

export async function ajustarVentanaCompeticionAction(
  perfil: any,
  competicion: any,
  sesionesVentana: any[],
  sesionesContexto: any[],
  competiciones: any[]
): Promise<{ sesiones: any[] }> {

  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const importancia = competicion.competition_importance || 'B'
  const compDate = competicion.date

  const dPre = new Date(compDate + 'T12:00:00'); dPre.setDate(dPre.getDate() - 5)
  const dPost = new Date(compDate + 'T12:00:00'); dPost.setDate(dPost.getDate() + 5)
  const ventanaInicio = toStr(dPre)
  const ventanaFin = toStr(dPost)

  const zonasTexto = extraerZonasTexto(perfil)
  const cadencia = generarCadenciaTexto(perfil, ventanaInicio, ventanaFin)

  const fmt = (s: any) =>
    `${s.date}|${s.discipline || s.day_type}|${s.planned_zone ? 'Z' + s.planned_zone : ''}|${s.planned_duration || ''}min|${s.title || ''}`

  const reglasImportancia: Record<string, string> = {
    A: `Importancia A (objetivo del año):
- PRE: los 5 días previos solo Z2, Z1 y gym. Los 2 días inmediatamente anteriores: Z1 o descanso (en cualquier orden).
- POST: el día posterior (día +1) muy suave: descanso, Z1 o gym tren superior. Los días +2 a +5: suaves, ÚNICAMENTE descanso, gym o Z2. NUNCA Z3, Z4 ni Z5 en estos días.`,
    B: `Importancia B (importante):
- PRE: los 4 días inmediatamente anteriores: Z2, gym, Z1 o descanso. El resto de la ventana, entrenamiento normal.
- POST: el día posterior (día +1) muy suave: descanso, Z1 o gym tren superior. Los días +2 a +5: suaves, ÚNICAMENTE descanso, gym o Z2. NUNCA Z3, Z4 ni Z5 en estos días.`,
    C: `Importancia C (para coger ritmo):
- PRE: los 3 días anteriores suaves: Z1, Z2, gym o descanso.
- POST: los 3 días posteriores suaves: ÚNICAMENTE descanso, gym o Z2. NUNCA Z3, Z4 ni Z5 en estos días.`,
  }

  const otrasComp = competiciones.filter((c: any) => c.date !== compDate)

  const prompt = `Vas a ajustar SOLO los días del ${ventanaInicio} al ${ventanaFin} alrededor de una competición.

PERFIL DEL ATLETA:
Nombre: ${perfil.name}, Nivel: ${perfil.level}/5
Disciplinas (SOLO estas): ${perfil.disciplines?.list?.join(', ')}
Disciplina prioritaria: ${perfil.disciplines?.priority}
Duración máxima sesión: ${perfil.max_session_duration}min
${perfil.injuries ? `Lesiones: ${perfil.injuries}` : ''}

${cadencia}

${zonasTexto}

COMPETICIÓN:
- Fecha: ${compDate}
- Importancia: ${importancia}
- Modalidad: ${competicion.modalidad || ''} ${competicion.distancia || ''}

${otrasComp.length > 0 ? `OTRAS COMPETICIONES CERCANAS (no las generes, respétalas):
${otrasComp.map((c: any) => `- ${c.date}: ${c.modalidad || ''} (${c.competition_importance})`).join('\n')}
` : ''}
PLAN ACTUAL EN LA VENTANA (lo vas a REEMPLAZAR según las reglas de puesta a punto):
${sesionesVentana.length > 0 ? sesionesVentana.map(fmt).join('\n') : 'Sin sesiones'}

DÍAS FIJOS ALREDEDOR (NO los generes; tu ajuste debe encajar con ellos):
${sesionesContexto.length > 0 ? sesionesContexto.map(fmt).join('\n') : 'Ninguno'}

REGLAS DE PUESTA A PUNTO Y RECUPERACIÓN:
${reglasImportancia[importancia] || reglasImportancia['B']}

REGLAS GENERALES (no negociables):
- Nunca dos días Z4 o Z5 consecutivos.
- Nunca dos días seguidos de la misma disciplina de cardio (running, bici, spinning).
- El primer día YA fuera de la parte suave de recuperación debe RETOMAR la intensidad normal, conectando con los días fijos posteriores. NO encadenes más días suaves de los que marca la regla: prohibido alargar la recuperación con Z1/Z2 de más.
- Respeta la energía de cada día según el turno laboral indicado arriba (mañanas = sin intensidad).

Genera ÚNICAMENTE las sesiones del ${ventanaInicio} al ${ventanaFin}, EXCLUYENDO el día de competición ${compDate}:`

  const texto = await llamarClaude(SYSTEM_VENTANA, prompt)
  const parseadas = parsearRespuesta(texto)

  const sesiones = parseadas.filter(
    (s: any) => s.date >= ventanaInicio && s.date <= ventanaFin && s.date !== compDate
  )

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