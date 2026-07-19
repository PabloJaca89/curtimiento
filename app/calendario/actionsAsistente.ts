'use server'

// Asistente con capacidad de ACTUAR sobre el plan:
// - asistenteChatAction (Haiku): conversa, propone cambios estructurados y detecta
//   preferencias duraderas del atleta.
// - aplicarCambioPlanAction (Sonnet): regenera únicamente el rango de días del cambio
//   propuesto, siguiendo la instrucción del asistente.
// Archivo autocontenido: duplica unos pocos helpers de actions.ts a propósito.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL_CAMBIOS = 'claude-sonnet-4-5'
const MODEL_CHAT = 'claude-haiku-4-5'
// Cada tramo de cambio es de rango corto (máx. 21 días): no necesita continuaciones.
const MAX_TOKENS_CAMBIO = 8000

async function llamarClaude(model: string, maxTokens: number, system: string, messages: any[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('API key no configurada')

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  })

  if (!response.ok) {
    const err = await response.text()
    if (err.includes('credit') || err.includes('billing') || err.includes('insufficient')) {
      throw new Error('SALDO_INSUFICIENTE')
    }
    throw new Error(err)
  }
  const data = await response.json()
  if (data.stop_reason === 'max_tokens') throw new Error('RESPUESTA_TRUNCADA')
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
    if (discipline !== 'Descanso' && !DISCIPLINAS_VALIDAS.has(discipline)) continue

    const dayType = discipline === 'Descanso' ? 'rest' : 'training'

    // Solo las sesiones de entrenamiento llevan zona, duración y carga.
    // Los descansos van siempre a null, aunque la IA rellene esos campos.
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

function calcularZonaFTP(ftp: number, zona: string): string {
  const rangos: Record<string, [number, number]> = {
    z1: [0.55, 0.65], z2: [0.65, 0.75], z3: [0.75, 0.87],
    z4: [0.87, 1.00], z5: [1.00, 1.15],
  }
  const r = rangos[zona]
  if (!r) return ''
  return `Potencia ${Math.round(ftp * r[0])}-${Math.round(ftp * r[1])}w`
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


// Saneador anti-invenciones (versión asistente): descarta fechas duplicadas y acota
// los datos numéricos que la IA pueda inventar: zonas 1-5 (cardio sin zona → Z2,
// fuerza sin zona), duración garantizada en todo entreno y acotada a [20, máx perfil].
function sanearNumeros(sesiones: any[], perfil: any): any[] {
  const maxDur = perfil.max_session_duration || 240
  const vistas = new Set<string>()
  const resultado: any[] = []
  sesiones.sort((a: any, b: any) => a.date.localeCompare(b.date))
  for (const s of sesiones) {
    if (vistas.has(s.date)) continue
    vistas.add(s.date)
    if (s.day_type === 'training') {
      const esFuerza = typeof s.discipline === 'string' && s.discipline.startsWith('Fuerza')
      if (esFuerza) {
        s.planned_zone = null
      } else {
        let z = parseInt(s.planned_zone) || 0
        if (z < 1) z = 2
        if (z > 5) z = 5
        s.planned_zone = z
      }
      let dur = parseInt(s.planned_duration) || 0
      if (!dur) dur = esFuerza ? 50 : 60
      dur = Math.max(20, Math.min(dur, maxDur))
      s.planned_duration = dur
    }
    resultado.push(s)
  }
  return resultado
}

// Carga fija determinista para gimnasio (ver actions.ts): inferior 5, superior 4.
function fijarCargaGimnasio(sesiones: any[]): void {
  for (const s of sesiones) {
    if (s.day_type !== 'training') continue
    if (s.discipline === 'Fuerza tren inferior') s.planned_load = 5
    else if (s.discipline === 'Fuerza tren superior A' || s.discipline === 'Fuerza tren superior B') s.planned_load = 4
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

// Extrae de las instrucciones libres un objetivo cuantitativo de descansos semanales
// ("dos días de descanso a la semana", "3 descansos por semana"...) y, si se nombran
// meses concretos ("en julio y agosto"), el ámbito de meses al que aplicarlo.
function extraerObjetivoDescansos(texto?: string): { n: number; meses: number[] } | null {
  if (!texto) return null
  const t = texto.toLowerCase()
  if (!/descans/.test(t) || !/seman/.test(t)) return null
  const palabras: Record<string, number> = { 'un': 1, 'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4 }
  const m = t.match(/(\d+|un|uno|una|dos|tres|cuatro)\s+d[ií]as?\s+de\s+descanso/)
    || t.match(/descans\w*\s+(\d+|un|uno|una|dos|tres|cuatro)\s+d[ií]as?/)
    || t.match(/(\d+|un|uno|una|dos|tres|cuatro)\s+descansos?/)
  if (!m) return null
  const n = palabras[m[1]] ?? parseInt(m[1], 10)
  if (!n || n < 1 || n > 4) return null

  const MESES_NOMBRE: Record<string, number> = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10,
    'noviembre': 11, 'diciembre': 12,
  }
  const meses: number[] = []
  for (const [nombre, num] of Object.entries(MESES_NOMBRE)) {
    if (t.includes(nombre) && !meses.includes(num)) meses.push(num)
  }
  return { n, meses }
}

function lunesDe(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const diff = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// GARANTÍA DETERMINISTA DE DESCANSOS: la IA no es fiable manteniendo un recuento
// semanal a lo largo de meses, así que el objetivo de descansos pedido por el atleta
// se impone por código, semana a semana (lunes-domingo), tras la respuesta de la IA.
// - Garantiza el MÍNIMO de descansos pedido (no elimina descansos sobrantes).
// - En semanas parciales el objetivo se prorratea.
// - Si el atleta nombró meses, solo actúa en esos meses.
// - Convierte en Descanso las sesiones más prescindibles: primero las más suaves,
//   en días de menor energía, y separadas de otros descansos. Nunca toca
//   competiciones ni compromisos.
function imponerDescansosSemanales(sesiones: any[], objetivo: { n: number; meses: number[] }, perfil: any): void {
  sesiones.sort((a, b) => a.date.localeCompare(b.date))

  const enAmbito = (s: any) =>
    objetivo.meses.length === 0 || objetivo.meses.includes(parseInt(s.date.slice(5, 7), 10))

  const semanas: Record<string, any[]> = {}
  for (const s of sesiones) {
    if (!enAmbito(s)) continue
    const k = lunesDe(s.date)
    if (!semanas[k]) semanas[k] = []
    semanas[k].push(s)
  }

  const fechasDescanso = new Set(
    sesiones.filter((s: any) => s.day_type === 'rest').map((s: any) => s.date)
  )
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const adyacenteADescanso = (fecha: string) => {
    const prev = new Date(fecha + 'T12:00:00'); prev.setDate(prev.getDate() - 1)
    const next = new Date(fecha + 'T12:00:00'); next.setDate(next.getDate() + 1)
    return fechasDescanso.has(toStr(prev)) || fechasDescanso.has(toStr(next))
  }

  for (const dias of Object.values(semanas)) {
    const requerido = Math.min(
      objetivo.n,
      Math.max(dias.length >= 3 ? 1 : 0, Math.round((dias.length * objetivo.n) / 7))
    )
    let actuales = dias.filter((s: any) => s.day_type === 'rest').length

    while (actuales < requerido) {
      const candidatos = dias.filter((s: any) => s.day_type === 'training')
      if (candidatos.length === 0) break
      const puntuar = (s: any) =>
        ((s.planned_zone ?? 2) * 10) + energiaDelDia(s.date, perfil) + (adyacenteADescanso(s.date) ? 100 : 0)
      candidatos.sort((a: any, b: any) => puntuar(a) - puntuar(b))
      const elegido = candidatos[0]
      elegido.discipline = 'Descanso'; elegido.day_type = 'rest'; elegido.type = 'rest'
      elegido.planned_zone = null; elegido.planned_duration = null; elegido.planned_load = null
      elegido.title = 'Descanso'; elegido.description = null
      fechasDescanso.add(elegido.date)
      actuales++
    }
  }
}

const fmtSesion = (s: any) =>
  `${s.date}|${s.discipline || s.day_type}|${s.planned_zone ? 'Z' + s.planned_zone : ''}|${s.planned_duration || ''}min|${s.title || ''}`

// ─────────────────────────────────────────────────────────────────────────────
// CHAT (Haiku): conversa, propone cambios (<accion>) y aprende preferencias (<nota>)
// ─────────────────────────────────────────────────────────────────────────────

export async function asistenteChatAction(mensajes: any[], contexto: any): Promise<string> {
  const notas: string[] = contexto.notas || []
  const proximas: any[] = contexto.sesionesProximas || []

  const system = `Eres el asistente de CURTIMIENTO, la app de planificación multideporte del atleta. Respondes SIEMPRE en español y de forma concisa (2-5 frases).

DATOS ACTUALES:
- Hoy es ${contexto.hoy}
- Carga Alostática: ${contexto.ca?.ca ?? '?'} (${contexto.ca?.estado ?? '?'}) | ACR: ${contexto.ca?.acr ?? '?'}
${notas.length > 0 ? `- Preferencias duraderas ya aprendidas del atleta:\n${notas.map(n => `  · ${n}`).join('\n')}` : ''}
- Plan de los próximos días (fecha|disciplina|zona|duración|título):
${proximas.length > 0 ? proximas.map(fmtSesion).join('\n') : 'Sin sesiones planificadas'}

CAPACIDAD 1 — PROPONER CAMBIOS EN EL PLAN:
Cuando el atleta pida modificar su plan (mover, quitar, suavizar, sustituir o adaptar sesiones por lesión, clima, tiempo, imprevistos...), explica tu propuesta en lenguaje natural y añade AL FINAL una o varias líneas exactas, cada una en su propia línea:
<accion>{"desde":"YYYY-MM-DD","hasta":"YYYY-MM-DD","instruccion":"instrucción concreta y autosuficiente para regenerar esos días"}</accion>
Reglas:
- LÍMITE TÉCNICO: cada <accion> cubre COMO MÁXIMO 21 días. Si el cambio pedido abarca más de 21 días, NO lo recortes: divídelo en varias <accion> con tramos CONSECUTIVOS, sin huecos ni solapes (ej.: primera del 2026-07-11 al 2026-07-31 y segunda del 2026-08-01 al 2026-08-15). Cada tramo lleva su propia "instruccion" autosuficiente. Máximo 4 tramos; si el cambio abarca más de ~80 días, recomienda en su lugar el botón "Recalcular plan".
- OBLIGATORIO VERBALIZAR EL ALCANCE: en tu texto di siempre qué fechas exactas cubre el cambio. Si lo has dividido en tramos, enuméralos y explica que es por el límite técnico de 21 días por aplicación. Si por cualquier motivo el rango que propones es menor que el pedido por el atleta, dilo explícitamente y explica por qué.
- COPIA LITERALMENTE en cada "instruccion" los requisitos cuantitativos y condiciones exactas del atleta, sin resumirlos ni suavizarlos. Ej.: si pide "dos días de descanso por semana", la instruccion debe decir "OBLIGATORIO: exactamente dos días de descanso por semana"; si pide "reduce un 30-40% el número de sesiones", la instruccion debe incluir "reduce un 30-40% el número de sesiones".
- Usa el rango MÍNIMO de días necesario, siempre desde hoy o después.
- La "instruccion" debe entenderse sin leer esta conversación: incluye el motivo (lesión, clima, falta de tiempo...) y qué hacer (p. ej. "El atleta tiene molestias en la planta del pie: sustituye todo el running por bici o natación de zona equivalente, manteniendo la estructura del resto").
- SOLO emite <accion> si el atleta pide un cambio. Nunca para preguntas informativas.
- No puedes tocar competiciones ni sesiones pasadas.
- Deja claro que el cambio no se aplica hasta que pulse el botón de confirmación que verá en el chat (un solo botón aplica todos los tramos en orden).

CAPACIDAD 2 — APRENDER PREFERENCIAS DURADERAS:
Si el atleta expresa una preferencia o condición ESTABLE (no un imprevisto puntual), p. ej. "el asfalto me castiga la rodilla" o "los lunes nunca puedo nadar", añade al final:
<nota>la preferencia resumida en una frase corta</nota>
Solo para información duradera útil en futuros planes. No la repitas si ya está en la lista de preferencias aprendidas.`

  return await llamarClaude(MODEL_CHAT, 2048, system, mensajes)
}

// ─────────────────────────────────────────────────────────────────────────────
// APLICAR CAMBIO (Sonnet): regenera solo el rango de días con la instrucción
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_CAMBIO = `Eres un entrenador experto en multideporte modificando un rango corto de días del plan de un atleta según una instrucción concreta.
Respondes ÚNICAMENTE con las sesiones en formato de texto plano, una por línea.
Formato estricto: YYYY-MM-DD|Disciplina|Zona|Duración_min|Carga_1-10|Descripción_corta
- Zona: Z1, Z2, Z3, Z4 o Z5 (vacío para fuerza y descanso)
- Disciplinas válidas (usa EXACTAMENTE estos nombres): Running, Bici carretera, BTT, Spinning, Fuerza tren inferior, Fuerza tren superior A, Fuerza tren superior B, Descanso
- USA ÚNICAMENTE las disciplinas del perfil del atleta
- NUNCA generes sesiones de tipo Competición
- Para Z3/Z4/Z5 incluye series y ritmos en la descripción. Para el resto: descripción de máximo 5 palabras o vacía
- Sin cabeceras, sin texto adicional, sin markdown

CRITERIO:
- LA INSTRUCCIÓN DEL ATLETA ES LA MÁXIMA PRIORIDAD Y PREVALECE sobre cualquier otro criterio de esta lista si entran en conflicto (incluidos la frecuencia de descansos, el número de sesiones y la conservación del estímulo). Cúmplela LITERALMENTE en todo el rango, incluidos los requisitos cuantitativos (p. ej. "dos días de descanso por semana" = exactamente dos Descanso en cada semana del rango).
- Fuera de lo que pida la instrucción, pierde lo mínimo posible del estímulo planificado: adapta o mueve las sesiones clave antes que eliminarlas.
- Los días NO afectados por la instrucción se mantienen lo más parecidos posible al plan actual.
- Nunca dos días Z4 o Z5 consecutivos. Nunca dos días seguidos de la misma disciplina de cardio.
- Día antes y después de Z4/Z5: suave (Z1, Z2 de otra disciplina o fuerza tren superior).
- Respeta la energía de cada día según el turno laboral. Sin Z3/Z4/Z5 los días de turno de Mañanas.
- Tu rango debe ENCAJAR con los días fijos anteriores y posteriores (sin choques de intensidad ni disciplina).
- Respeta las puestas a punto de las competiciones cercanas según su importancia.`

export async function aplicarCambioPlanAction(
  perfil: any,
  instruccion: string,
  sesionesRango: any[],
  sesionesContexto: any[],
  competiciones: any[],
  fechaInicio: string,
  fechaFin: string
): Promise<{ sesiones: any[] }> {

  const zonasTexto = extraerZonasTexto(perfil)
  const cadencia = generarCadenciaTexto(perfil, fechaInicio, fechaFin)

  const compCercanas = competiciones.filter((c: any) => {
    const diff = Math.abs(
      (new Date(c.date + 'T12:00:00').getTime() - new Date(fechaInicio + 'T12:00:00').getTime()) / 86400000
    )
    return diff <= 21
  })

  const prompt = `Modifica SOLO los días del ${fechaInicio} al ${fechaFin} según la instrucción del atleta.

PERFIL DEL ATLETA:
Nombre: ${perfil.name}, Nivel: ${perfil.level}/5
Disciplinas (SOLO estas): ${perfil.disciplines?.list?.join(', ')}
Disciplina prioritaria: ${perfil.disciplines?.priority}
Duración máxima sesión: ${perfil.max_session_duration}min
${perfil.injuries ? `Lesiones: ${perfil.injuries}` : ''}

${cadencia}

${zonasTexto}

INSTRUCCIÓN DEL ATLETA (aplícala LITERALMENTE en todo el rango; es la máxima prioridad y prevalece sobre cualquier otro criterio):
${instruccion}

PLAN ACTUAL DEL RANGO (lo vas a REEMPLAZAR adaptándolo a la instrucción):
${sesionesRango.length > 0 ? sesionesRango.map(fmtSesion).join('\n') : 'Sin sesiones'}

DÍAS FIJOS ALREDEDOR (NO los generes; tu rango debe encajar con ellos):
${sesionesContexto.length > 0 ? sesionesContexto.map(fmtSesion).join('\n') : 'Ninguno'}

${compCercanas.length > 0 ? `COMPETICIONES CERCANAS (no las generes, respeta sus puestas a punto):
${compCercanas.map((c: any) => `- ${c.date}: ${c.modalidad || ''} ${c.distancia || ''} (${c.competition_importance})`).join('\n')}
` : ''}
Genera ÚNICAMENTE las sesiones del ${fechaInicio} al ${fechaFin}, un día por línea, EXCLUYENDO los días de competición:`

  const texto = await llamarClaude(MODEL_CAMBIOS, MAX_TOKENS_CAMBIO, SYSTEM_CAMBIO, [{ role: 'user', content: prompt }])
  const parseadas = parsearRespuesta(texto)

  const fechasComp = new Set(competiciones.map((c: any) => c.date))
  const sesiones = sanearNumeros(
    parseadas.filter(
      (s: any) => s.date >= fechaInicio && s.date <= fechaFin && !fechasComp.has(s.date)
    ),
    perfil
  )

  // Garantía determinista: si la instrucción pide N descansos por semana,
  // se impone por código sobre el tramo, sin fiarlo al recuento de la IA.
  const objetivoDescansos = extraerObjetivoDescansos(instruccion)
  if (objetivoDescansos) imponerDescansosSemanales(sesiones, objetivoDescansos, perfil)

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

  fijarCargaGimnasio(sesiones)

  return { sesiones }
}