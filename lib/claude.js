// ─── LLAMADAS A LA API DE ANTHROPIC ──────────────────────────────────────────
// Este módulo gestiona toda la comunicación con Claude.
// Las llamadas van siempre a través de /api/claude (servidor),
// nunca desde el cliente directamente, para proteger la API key.

// ─── GENERAR PLAN INICIAL ─────────────────────────────────────────────────────
export async function generarPlan(perfil, competiciones, fechaInicio, fechaFin) {
  const prompt = construirPromptPlan(perfil, competiciones, fechaInicio, fechaFin)

const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'generar_plan', prompt })
  })

  const data = await res.json()
  return data
}

// ─── RECALCULAR PLAN ──────────────────────────────────────────────────────────
export async function recalcularPlan(perfil, sesionesExistentes, competiciones, cargaAlostatica, motivo) {
  const prompt = construirPromptRecalculo(perfil, sesionesExistentes, competiciones, cargaAlostatica, motivo)

 const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'recalcular_plan', prompt })
  })

  const data = await res.json()
  return data
}

// ─── CHAT CON EL ASISTENTE ────────────────────────────────────────────────────
export async function chatAsistente(mensajes, contexto) {
 const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'chat', mensajes, contexto })
  })

  const data = await res.json()
  return data
}

// ─── PROMPT: GENERAR PLAN ─────────────────────────────────────────────────────
function construirPromptPlan(perfil, competiciones, fechaInicio, fechaFin) {
  return `Eres un entrenador experto en multideporte. Genera un plan de entrenamiento personalizado en formato JSON.

PERFIL DEL ATLETA:
${JSON.stringify(perfil, null, 2)}

COMPETICIONES PREVISTAS:
${JSON.stringify(competiciones, null, 2)}

PERÍODO: desde ${fechaInicio} hasta ${fechaFin}

INSTRUCCIONES:
- Respeta la cadencia laboral del atleta y su disponibilidad energética por tipo de jornada (1=descanso, 2=sesión corta suave, 3=sesión suave larga o intensa breve, 4=sesión intensa media, 5=sesión intensa larga)
- Distribuye las disciplinas según sus preferencias y disciplina prioritaria
- Para competiciones tipo A: puesta a punto de 10 días antes
- Para competiciones tipo B: puesta a punto de 3-4 días antes
- Para competiciones tipo C: sin puesta a punto específica
- Respeta el máximo de horas semanales y duración máxima por sesión
- Incluye los días de descanso necesarios
- Progresión de carga coherente: no aumentes más de un 10% semanal
- Ten en cuenta el nivel del atleta (1=principiante, 5=profesional)
- Si viene de un parón, empieza con carga reducida las primeras semanas

FORMATO DE RESPUESTA (JSON estricto, sin texto adicional):
{
  "sesiones": [
    {
      "date": "YYYY-MM-DD",
      "discipline": "nombre disciplina",
      "title": "descripción breve",
      "day_type": "training|rest|competition",
      "planned_duration": minutos,
      "planned_zone": 1-5,
      "planned_load": 1-10,
      "description": "detalles del entrenamiento"
    }
  ]
}`
}

// ─── PROMPT: RECALCULAR PLAN ──────────────────────────────────────────────────
function construirPromptRecalculo(perfil, sesiones, competiciones, ca, motivo) {
  const hoy = new Date().toISOString().split('T')[0]

  return `Eres un entrenador experto en multideporte. Debes recalcular el plan de entrenamiento a partir de hoy.

PERFIL DEL ATLETA:
${JSON.stringify(perfil, null, 2)}

ESTADO DE FATIGA ACTUAL (Carga Alostática):
- CA: ${ca.ca} (${ca.estado})
- Recomendación: ${ca.recomendacion}
- ACR: ${ca.acr}
- Componentes: ${JSON.stringify(ca.componentes)}

SESIONES FUTURAS ACTUALES (a partir de ${hoy}):
${JSON.stringify(sesiones.filter(s => s.date >= hoy), null, 2)}

COMPETICIONES:
${JSON.stringify(competiciones, null, 2)}

MOTIVO DEL RECÁLCULO: ${motivo}

INSTRUCCIONES:
- NO modifiques ninguna sesión anterior a hoy (${hoy})
- Ajusta el plan futuro teniendo en cuenta el estado de fatiga actual
- Si CA > 3.0, reduce la carga de las próximas sesiones
- Si CA > 4.0, prioriza recuperación los próximos días
- Respeta siempre las competiciones y sus puestas a punto
- Mantén la coherencia con el perfil del atleta

FORMATO DE RESPUESTA (JSON estricto, sin texto adicional):
{
  "sesiones": [
    {
      "date": "YYYY-MM-DD",
      "discipline": "nombre disciplina",
      "title": "descripción breve",
      "day_type": "training|rest|competition",
      "planned_duration": minutos,
      "planned_zone": 1-5,
      "planned_load": 1-10,
      "description": "detalles del entrenamiento"
    }
  ]
}`
}