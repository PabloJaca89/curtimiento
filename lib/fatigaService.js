import { supabase } from './supabase'

// ─── CONSTANTES DE DECAIMIENTO ───────────────────────────────────────────────
const LAMBDA = {
  metabolica:     0.693,  // semivida 24h
  muscular_inf:   0.347,  // semivida 48h
  muscular_sup:   0.347,  // semivida 48h (× 1.2 en natación)
  snc:            0.231,  // semivida 72h
}

// ─── DECAIMIENTO EXPONENCIAL ─────────────────────────────────────────────────
function decaimiento(fatigaInicial, lambda, dias) {
  return fatigaInicial * Math.exp(-lambda * dias)
}

// ─── DÍAS ENTRE DOS FECHAS ───────────────────────────────────────────────────
function diasEntre(fechaAntigua, fechaReciente) {
  const ms = new Date(fechaReciente) - new Date(fechaAntigua)
  return ms / (1000 * 60 * 60 * 24)
}

// ─── BUSCAR BAREMO PARA UNA SESIÓN ───────────────────────────────────────────
function buscarBaremo(baremos, disciplina, condicion) {
  return baremos.find(b => {
    if (b.disciplina !== disciplina) return false
    const c = b.condicion

    if (disciplina === 'running') {
      return c.zona === condicion.zona &&
        condicion.km >= c.km_min && condicion.km < c.km_max
    }
    if (disciplina === 'bicicleta') {
      return c.zona === condicion.zona &&
        condicion.minutos >= c.min_min && condicion.minutos < c.min_max
    }
    if (disciplina === 'natacion' || disciplina === 'paddle_surf') {
      return c.intensidad === condicion.intensidad &&
        condicion.minutos >= c.min_min && condicion.minutos < c.min_max
    }
    if (disciplina === 'gimnasio') {
      return c.tipo === condicion.tipo
    }
    if (disciplina === 'ocr') {
      return c.tipo === condicion.tipo
    }
    return false
  })
}

// ─── CALCULAR FATIGA ACUMULADA DE LAS SESIONES ───────────────────────────────
function calcularFatigaAcumulada(sesiones, baremos, hoy) {
  let totalSNC = 0, totalFMI = 0, totalFMS = 0, totalFM = 0

  for (const s of sesiones) {
    const dias = diasEntre(s.date, hoy)
    if (dias < 0 || dias > 28) continue

    // Usar valores guardados en la sesión si existen
    const snc = s.snc_generado || 0
    const fmi = s.fmi_generado || 0
    const fms = s.fms_generado || 0
    const fm  = s.fm_generado  || 0

    const esNatacion = s.discipline === 'Natación'
    const lambdaSupAdj = esNatacion ? LAMBDA.muscular_sup * 1.2 : LAMBDA.muscular_sup

    totalSNC += decaimiento(snc, LAMBDA.snc,          dias)
    totalFMI += decaimiento(fmi, LAMBDA.muscular_inf,  dias)
    totalFMS += decaimiento(fms, lambdaSupAdj,         dias)
    totalFM  += decaimiento(fm,  LAMBDA.metabolica,    dias)
  }

  // Normalizar a escala 1-5
  const norm = v => Math.min(5, Math.max(1, v))
  return {
    snc: norm(totalSNC),
    fmi: norm(totalFMI),
    fms: norm(totalFMS),
    fm:  norm(totalFM),
  }
}

// ─── CALCULAR ΔRPE ───────────────────────────────────────────────────────────
function calcularDeltaRPE(sesionesHoy) {
  const sesionesConRPE = sesionesHoy.filter(
    s => s.perceived_rpe && s.planned_load
  )
  if (sesionesConRPE.length === 0) return 3 // valor neutro si no hay datos

  const deltas = sesionesConRPE.map(s => {
    const delta = s.perceived_rpe - s.planned_load
    // Normalizar delta a escala 1-5
    if (delta <= -2) return 1
    if (delta === -1) return 2
    if (delta === 0)  return 3
    if (delta === 1)  return 4
    return 5
  })
  return deltas.reduce((a, b) => a + b, 0) / deltas.length
}

// ─── CALCULAR ACR ────────────────────────────────────────────────────────────
function calcularACR(sesiones, hoy) {
  const hoyDate = new Date(hoy)

  const carga7  = sesiones
    .filter(s => diasEntre(s.date, hoy) <= 7)
    .reduce((acc, s) => acc + (s.planned_load || 0), 0)

  const carga28 = sesiones
    .filter(s => diasEntre(s.date, hoy) <= 28)
    .reduce((acc, s) => acc + (s.planned_load || 0), 0)

  const media28 = carga28 / 28
  if (media28 === 0) return 1
  return carga7 / 7 / media28
}

// ─── FUNCIÓN PRINCIPAL ───────────────────────────────────────────────────────
export async function calcularCargaAlostatica(userId, fecha) {
  const hoy = fecha || new Date().toISOString().split('T')[0]

  // Fecha inicio ventana 28 días
  const inicio = new Date(hoy)
  inicio.setDate(inicio.getDate() - 28)
  const inicioStr = inicio.toISOString().split('T')[0]

  // Cargar sesiones de los últimos 28 días
  const { data: sesiones, error: errSesiones } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', inicioStr)
    .lte('date', hoy)

  if (errSesiones || !sesiones) return null

  // Cargar baremos del usuario
  const { data: baremos } = await supabase
    .from('baremos_usuario')
    .select('*')
    .eq('user_id', userId)

  // Sesiones de hoy para energía y RPE
  const sesionesHoy = sesiones.filter(s => s.date === hoy)

  // Energía percibida hoy (de 1 a 5, invertida: MUY ALTA=1, MUY BAJA=5)
  const energiaHoy = sesionesHoy[0]?.energy_level
    ? Math.ceil(sesionesHoy[0].energy_level / 2) // convierte 1-10 a 1-5
    : 3 // valor neutro

  // Componentes de fatiga acumulada
  const fatiga = calcularFatigaAcumulada(sesiones, baremos || [], hoy)

  // ΔRPE
  const deltaRPE = calcularDeltaRPE(sesionesHoy)

  // HRV (opcional)
  const hrv = sesionesHoy[0]?.hrv || null

  // ─── FÓRMULA CA ──────────────────────────────────────────────────────────
  let ca
  if (hrv !== null) {
    ca = (energiaHoy * 0.28) +
         (deltaRPE   * 0.18) +
         (fatiga.snc * 0.17) +
         (fatiga.fmi * 0.12) +
         (fatiga.fms * 0.08) +
         (fatiga.fm  * 0.10) +
         (hrv        * 0.07)
  } else {
    // Sin HRV: el peso de E pasa a 0.35
    ca = (energiaHoy * 0.35) +
         (deltaRPE   * 0.18) +
         (fatiga.snc * 0.17) +
         (fatiga.fmi * 0.12) +
         (fatiga.fms * 0.08) +
         (fatiga.fm  * 0.10)
  }

  // ACR
  const acr = calcularACR(sesiones, hoy)
  if (acr > 1.3) ca = Math.min(5, ca * 1.1) // modificador de riesgo

  // ─── INTERPRETACIÓN ──────────────────────────────────────────────────────
  let estado, recomendacion
  if (ca <= 2.0) {
    estado = 'Fresco'
    recomendacion = 'Puede asumir carga alta'
  } else if (ca <= 3.0) {
    estado = 'Moderado'
    recomendacion = 'Entrenamiento según plan'
  } else if (ca <= 3.9) {
    estado = 'Elevado'
    recomendacion = 'Reducir intensidad o volumen'
  } else {
    estado = 'Sobrecarga'
    recomendacion = 'Recuperación activa o descanso'
  }

  return {
    ca: Math.round(ca * 100) / 100,
    estado,
    recomendacion,
    acr: Math.round(acr * 100) / 100,
    componentes: {
      energia:  energiaHoy,
      deltaRPE: Math.round(deltaRPE * 100) / 100,
      snc:      Math.round(fatiga.snc * 100) / 100,
      fmi:      Math.round(fatiga.fmi * 100) / 100,
      fms:      Math.round(fatiga.fms * 100) / 100,
      fm:       Math.round(fatiga.fm  * 100) / 100,
      hrv:      hrv,
    }
  }
}

// ─── OBTENER BAREMO PARA UNA SESIÓN ──────────────────────────────────────────
export async function obtenerBaremoSesion(userId, disciplina, condicion) {
  const { data } = await supabase
    .from('baremos_usuario')
    .select('*')
    .eq('user_id', userId)
    .eq('disciplina', disciplina)

  if (!data || data.length === 0) return null
  return buscarBaremo(data, disciplina, condicion)
}

// ─── ACTUALIZAR BAREMO (usado por el agente IA) ───────────────────────────────
export async function updateBaremo(userId, disciplina, condicion, campo, nuevoValor) {
  // Buscar el baremo a modificar
  const { data: baremos } = await supabase
    .from('baremos_usuario')
    .select('*')
    .eq('user_id', userId)
    .eq('disciplina', disciplina)

  const baremo = buscarBaremo(baremos || [], disciplina, condicion)
  if (!baremo) return { error: 'Baremo no encontrado' }

  const valorAnterior = baremo[campo]

  // Actualizar
  const { error } = await supabase
    .from('baremos_usuario')
    .update({ [campo]: nuevoValor, updated_at: new Date().toISOString() })
    .eq('id', baremo.id)

  if (error) return { error }

  // Guardar historial
  await supabase.from('baremos_historial').insert({
    user_id: userId,
    disciplina,
    campo,
    valor_anterior: valorAnterior,
    valor_nuevo: nuevoValor,
    motivo: `Modificado via agente IA`,
  })

  return { ok: true, valorAnterior, nuevoValor }
}

// ─── COPIAR BAREMOS DEFAULT AL USUARIO (al registrarse) ───────────────────────
export async function inicializarBaremosUsuario(userId) {
  // Comprobar si ya tiene baremos
  const { data: existing } = await supabase
    .from('baremos_usuario')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (existing && existing.length > 0) return { ok: true, msg: 'Ya inicializado' }

  // Copiar desde baremos_default
  const { data: defaults } = await supabase
    .from('baremos_default')
    .select('*')

  if (!defaults || defaults.length === 0) return { error: 'No hay baremos default' }

  const nuevos = defaults.map(({ id, created_at, ...rest }) => ({
    ...rest,
    user_id: userId,
  }))

  const { error } = await supabase.from('baremos_usuario').insert(nuevos)
  if (error) return { error }

  return { ok: true, msg: `${nuevos.length} baremos inicializados` }
  }

// ─── CALCULAR PLANNED LOAD DESDE BAREMOS ─────────────────────────────────────
export async function calcularPlannedLoad(userId, discipline, zona, duracionMin) {
  // Mapear nombre de disciplina al nombre en baremos_usuario
  const disciplinaMap = {
    'Running':                'running',
    'Bici carretera':         'bicicleta',
    'BTT':                    'bicicleta',
    'Spinning':               'bicicleta',
    'Natación':               'natacion',
    'Paddle surf':            'paddle_surf',
    'Fuerza tren superior A': 'gimnasio',
    'Fuerza tren superior B': 'gimnasio',
    'Fuerza tren inferior':   'gimnasio',
  }

  const tipoGimnasioMap = {
    'Fuerza tren superior A': 'dorsal_triceps',
    'Fuerza tren superior B': 'hombro_pecho',
    'Fuerza tren inferior':   'tren_inferior',
  }

  const disciplinaDB = disciplinaMap[discipline]
  if (!disciplinaDB) return null

  // Construir condición según disciplina
  let condicion = {}

  if (disciplinaDB === 'running') {
    // Estimar km desde duración y zona
    const ritmoEstimado = { 1: 7.5, 2: 6.5, 3: 5.5, 4: 4.5, 5: 3.8 }
    const minKm = ritmoEstimado[zona] || 6
    const km = Math.round(duracionMin / minKm)
    condicion = { zona, km }
  } else if (disciplinaDB === 'bicicleta') {
    condicion = { zona, minutos: duracionMin }
  } else if (disciplinaDB === 'natacion' || disciplinaDB === 'paddle_surf') {
    // Mapear zona a intensidad
    const intensidadMap = { 1: 'suave', 2: 'suave', 3: 'media', 4: 'alta', 5: 'alta' }
    condicion = { intensidad: intensidadMap[zona] || 'media', minutos: duracionMin }
  } else if (disciplinaDB === 'gimnasio') {
    condicion = { tipo: tipoGimnasioMap[discipline] }
  }

  const baremo = await obtenerBaremoSesion(userId, disciplinaDB, condicion)
  if (!baremo) return null

  const fms = baremo.fms || 0
  const fmi = baremo.fmi || 0
  const fm = baremo.fm || 0
  const snc = baremo.snc || 0

  const valores = [snc, fmi, fms, fm].filter(v => v > 0)
  if (valores.length === 0) return null

  const maximo = Math.max(...valores)
  const promedio = valores.reduce((a, b) => a + b, 0) / valores.length

  // Escalar de 1-5 a 1-10
  const raw = (maximo * 0.5 + promedio * 0.5)
  return Math.round(raw * 2)
}