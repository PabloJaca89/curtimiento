// Alertas de riesgo proactivas. Reglas deterministas (sin llamadas a la IA): cruzan
// la Carga Alostática, el ACR, la fatiga del sistema nervioso y la racha de RPE para
// avisar cuando conviene bajar el pistón. Todo se calcula a partir de datos ya existentes.

export type NivelAlerta = 'alto' | 'medio' | 'info'

export interface AlertaRiesgo {
  id: string
  nivel: NivelAlerta
  titulo: string
  mensaje: string
  sugerencia?: string
}

interface CargaAlostatica {
  ca: number
  estado: string
  acr: number
  componentes?: {
    snc?: number
    fmi?: number
    fms?: number
    fm?: number
    deltaRPE?: number
    energia?: number
    hrv?: number | null
  }
}

interface SesionMin {
  date: string
  day_type?: string
  discipline?: string
  planned_zone?: number | null
  planned_load?: number | null
  perceived_rpe?: number | null
  completed?: boolean | null
}

// Mínimo de sesiones completadas recientes para que el ACR sea estadísticamente fiable.
// Con menos historial, el cociente agudo/crónico se dispara artificialmente
// (p. ej. un plan recién empezado) y generaría falsas alarmas.
const MIN_SESIONES_PARA_ACR = 5

// Racha de sesiones recientes percibidas como más duras de lo previsto.
// Cuenta, desde la sesión completada más reciente hacia atrás, cuántas seguidas
// tienen una desviación (RPE percibida − carga prevista) de al menos +1.
function analizarRachaRPE(historial: SesionMin[]): { racha: number; media: number } {
  const conAmbos = historial
    .filter(s => s.day_type === 'training' && s.completed &&
      s.perceived_rpe != null && s.planned_load != null)
    .sort((a, b) => b.date.localeCompare(a.date))

  const desvs: number[] = []
  for (const s of conAmbos) {
    const d = (s.perceived_rpe as number) - (s.planned_load as number)
    if (d >= 1) desvs.push(d)
    else break
  }
  const media = desvs.length ? desvs.reduce((a, b) => a + b, 0) / desvs.length : 0
  return { racha: desvs.length, media: Math.round(media * 10) / 10 }
}

// Primera sesión intensa (Z4 o Z5) que aún está por venir, para sugerir suavizarla.
function proximaIntensa(proximas: SesionMin[]): SesionMin | null {
  const futuras = proximas
    .filter(s => s.day_type === 'training' && (s.planned_zone || 0) >= 4)
    .sort((a, b) => a.date.localeCompare(b.date))
  return futuras[0] || null
}

function fechaLegible(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

// Genera la lista de alertas ordenadas por gravedad (alto → medio → info).
// - ca: objeto devuelto por calcularCargaAlostatica
// - historial: sesiones completadas recientes (para la racha de RPE)
// - proximas: sesiones futuras (para sugerir cambios concretos)
export function generarAlertasRiesgo(
  ca: CargaAlostatica | null,
  historial: SesionMin[],
  proximas: SesionMin[]
): AlertaRiesgo[] {
  if (!ca) return []

  const alertas: AlertaRiesgo[] = []
  const intensa = proximaIntensa(proximas)
  const sugerenciaSuavizar = intensa
    ? `Considera convertir la sesión intensa del ${fechaLegible(intensa.date)} (${intensa.discipline} Z${intensa.planned_zone}) en un rodaje suave Z2.`
    : 'Sustituye la próxima sesión intensa por un rodaje suave Z2.'

  // Sesiones completadas recientes con datos: base estadística mínima para el ACR.
  const nCompletadas = historial.filter(s =>
    s.day_type === 'training' && s.completed && s.planned_load != null
  ).length

  // ─── Carga Alostática global ───────────────────────────────────────────────
  if (ca.ca >= 4.0) {
    alertas.push({
      id: 'ca-sobrecarga',
      nivel: 'alto',
      titulo: 'Sobrecarga acumulada',
      mensaje: `Tu Carga Alostática está en ${ca.ca} (zona de sobrecarga). El cuerpo lleva varios días acumulando más de lo que recupera.`,
      sugerencia: 'Prioriza recuperación activa o descanso los próximos 2 días antes de volver a la intensidad.',
    })
  } else if (ca.ca >= 3.5) {
    alertas.push({
      id: 'ca-elevada',
      nivel: 'medio',
      titulo: 'Fatiga elevada',
      mensaje: `Tu Carga Alostática está en ${ca.ca} (elevada). Aún es manejable, pero conviene no apretar más.`,
      sugerencia: sugerenciaSuavizar,
    })
  }

  // ─── ACR (ratio de carga aguda vs crónica) ────────────────────────────────
  // Solo con historial suficiente: con pocas sesiones el ratio se infla solo.
  if (nCompletadas >= MIN_SESIONES_PARA_ACR) {
    if (ca.acr >= 1.5) {
      alertas.push({
        id: 'acr-pico',
        nivel: 'alto',
        titulo: 'Pico de carga brusco',
        mensaje: `Tu carga de la última semana es muy superior a tu media reciente (ACR ${ca.acr}). Este salto es el patrón asociado a mayor riesgo de lesión.`,
        sugerencia: 'Reparte mejor la carga: baja el volumen de esta semana y evita añadir sesiones intensas nuevas.',
      })
    } else if (ca.acr >= 1.3) {
      alertas.push({
        id: 'acr-alto',
        nivel: 'medio',
        titulo: 'Carga subiendo rápido',
        mensaje: `Tu carga semanal está creciendo por encima de lo ideal (ACR ${ca.acr}). Vigila que el aumento no se dispare.`,
        sugerencia: 'Mantén la carga de esta semana sin incrementos y asegura los días suaves entre sesiones fuertes.',
      })
    } else if (ca.acr > 0 && ca.acr < 0.8) {
      alertas.push({
        id: 'acr-bajo',
        nivel: 'info',
        titulo: 'Carga por debajo de lo habitual',
        mensaje: `Tu carga reciente ha bajado bastante respecto a tu media (ACR ${ca.acr}). Puede ser recuperación buscada o pérdida de ritmo.`,
        sugerencia: 'Si no vienes de competición o parón, puedes retomar algo de intensidad con normalidad.',
      })
    }
  }

  // ─── Racha de RPE por encima de lo previsto ────────────────────────────────
  const { racha, media } = analizarRachaRPE(historial)
  if (racha >= 3) {
    const esAlto = media >= 2
    alertas.push({
      id: 'rpe-racha',
      nivel: esAlto ? 'alto' : 'medio',
      titulo: 'Sesiones más duras de lo previsto',
      mensaje: `Llevas ${racha} sesiones seguidas que has sentido más exigentes de lo planificado (desviación media +${media}). Es señal de fatiga acumulada o de un plan demasiado ambicioso ahora mismo.`,
      sugerencia: sugerenciaSuavizar,
    })
  }

  // ─── Fatiga del sistema nervioso (SNC) ─────────────────────────────────────
  const snc = ca.componentes?.snc ?? 0
  if (snc >= 4.0) {
    alertas.push({
      id: 'snc-alto',
      nivel: 'medio',
      titulo: 'Fatiga neuromuscular alta',
      mensaje: `Tu componente de fatiga del sistema nervioso está alto (${snc}/5). Es el que más tarda en recuperarse y afecta a la explosividad y la fuerza.`,
      sugerencia: 'Evita sesiones muy explosivas (Z5, series cortas máximas) y la fuerza pesada durante 1-2 días.',
    })
  }

  const orden: Record<NivelAlerta, number> = { alto: 0, medio: 1, info: 2 }
  return alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel])
}