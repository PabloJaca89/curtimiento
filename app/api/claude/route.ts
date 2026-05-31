import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

export async function POST(req: NextRequest) {
  console.log('🟢 API claude recibida')
  try {
    const body = await req.json()
    const { tipo, prompt, mensajes, contexto } = body

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })
    }

    let messages: any[] = []
    let system = ''

    if (tipo === 'generar_plan' || tipo === 'recalcular_plan') {
      system = 'Eres un entrenador experto en multideporte. Respondes SIEMPRE en JSON válido, sin texto adicional, sin bloques de código markdown.'
      messages = [{ role: 'user', content: prompt }]
    }

    if (tipo === 'chat') {
      system = `Eres el asistente de entrenamiento de CURTIMIENTO. Tienes acceso al perfil completo del atleta y su plan.
Contexto actual del atleta:
${JSON.stringify(contexto, null, 2)}

Cuando el atleta pida cambios en el plan:
1. Propón el cambio concreto de forma clara y breve
2. Pregunta siempre confirmación antes de aplicar
3. Indica qué fechas se verían afectadas
4. Responde siempre en español`
      messages = mensajes
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: response.status })
    }

    const data = await response.json()
    const texto = data.content?.[0]?.text || ''

    // Para planes: parsear JSON
    if (tipo === 'generar_plan' || tipo === 'recalcular_plan') {
      try {
        const clean = texto.replace(/```json|```/g, '').trim()
        const plan = JSON.parse(clean)
        return NextResponse.json({ ok: true, plan })
      } catch {
        return NextResponse.json({ error: 'Error parseando JSON del plan', raw: texto }, { status: 500 })
      }
    }

    // Para chat: devolver texto
    return NextResponse.json({ ok: true, mensaje: texto })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}