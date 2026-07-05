export type NivelRelacion = 'positiva' | 'neutra' | 'precaucion';
export type NivelEvidencia = 'E' | 'M' | 'T' | 'E/T';

export interface RelacionSuplemento {
  id: number;
  nivel: NivelRelacion;
  evidencia?: NivelEvidencia;
  nota?: string;
}

export interface Suplemento {
  id: number;
  nombre: string;
  mecanismo: string;
  relaciones: RelacionSuplemento[];
  cafeina: string;
  alcohol: string;
  carbonatadas: string;
  advertenciaMedica?: string;
}

export const SUPLEMENTOS: Suplemento[] = [
  {
    id: 1,
    nombre: 'Citrulina',
    mecanismo:
      'Precursora de arginina → óxido nítrico (NO), vasodilatación; también reduce el amonio del ciclo de la urea, retrasando la fatiga percibida.',
    relaciones: [
      { id: 2, nivel: 'positiva', evidencia: 'M', nota: 'Sistemas energéticos que no se solapan (fosfocreatina vs óxido nítrico).' },
      { id: 3, nivel: 'neutra', nota: 'Comparten parcialmente transportadores intestinales; a dosis muy altas podría haber competencia leve por absorción, sin relevancia clínica documentada.' },
      { id: 4, nivel: 'positiva', evidencia: 'M', nota: 'Dos vías distintas hacia el NO: citrulina-arginina-NO-sintasa frente a nitrato-nitrito-NO no enzimático.' },
      { id: 5, nivel: 'neutra' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'neutra' },
      { id: 8, nivel: 'positiva', evidencia: 'T', nota: 'Ambos orientados al aporte de oxígeno, aunque la evidencia humana del cordyceps en rendimiento es modesta.' },
      { id: 9, nivel: 'neutra' },
      { id: 10, nivel: 'positiva', evidencia: 'M', nota: 'Apoyo complementario a la función endotelial.' },
      { id: 11, nivel: 'positiva', evidencia: 'M', nota: 'Sistemas energéticos que no se solapan.' },
    ],
    cafeina: 'Sin bloqueo químico. La cafeína produce vasoconstricción aguda que en teoría contrapesa el efecto vasodilatador, pero en la práctica se combinan sin problema en pre-entrenos.',
    alcohol: 'Sin antagonismo químico, pero contraproducente: deshidrata y perjudica la recuperación que la citrulina busca favorecer.',
    carbonatadas: 'Neutras; pueden sumar molestia gástrica si la citrulina malato ya sienta pesada a dosis altas.',
  },
  {
    id: 2,
    nombre: 'Creatina',
    mecanismo:
      'Aumenta las reservas de fosfocreatina muscular, acelerando la resíntesis de ATP en esfuerzos cortos e intensos.',
    relaciones: [
      { id: 1, nivel: 'positiva', evidencia: 'M', nota: 'Sistemas energéticos que no se solapan.' },
      { id: 3, nivel: 'neutra', nota: 'Se cofórmulan a menudo sin interferencia, aunque el beneficio añadido de la glutamina en deportistas sanos y bien nutridos es discutible.' },
      { id: 4, nivel: 'positiva', evidencia: 'M', nota: 'Energía muscular y vasodilatación son ejes distintos.' },
      { id: 5, nivel: 'positiva', evidencia: 'M', nota: 'El magnesio es cofactor de la creatina-quinasa.' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'neutra' },
      { id: 8, nivel: 'neutra' },
      { id: 9, nivel: 'positiva', evidencia: 'E/T', nota: 'Algún ensayo con entrenamiento de fuerza muestra mejoras superiores combinando ashwagandha, vía reducción de cortisol.' },
      { id: 10, nivel: 'neutra' },
      { id: 11, nivel: 'positiva', evidencia: 'E', nota: 'La combinación mejor documentada de toda la lista: sistema fosfágeno + tamponamiento de carnosina, con estudios específicos mostrando mejoras en potencia y composición corporal.' },
    ],
    cafeina: 'El mito de que la cafeína anula la creatina viene de un estudio antiguo (Vandenberghe, 1996) no confirmado después. La precaución real es la hidratación: la creatina retiene agua intracelular y la cafeína es diurética leve.',
    alcohol: 'No la neutraliza químicamente, pero perjudica la síntesis proteica, la recuperación y la hidratación.',
    carbonatadas: "Si llevan azúcar, el pico de insulina puede facilitar la captación muscular de creatina (estrategia de 'carga'); sin azúcar son neutras.",
  },
  {
    id: 3,
    nombre: 'Glutamina',
    mecanismo:
      'Aminoácido condicionalmente esencial. Evidencia sólida en contextos catabólicos (quemados, cirugía, enfermedad crítica); en deportistas sanos y bien alimentados el respaldo de beneficio directo es más débil de lo que sugiere el marketing.',
    relaciones: [
      { id: 1, nivel: 'neutra', nota: 'Comparten parcialmente transportadores intestinales; a dosis muy altas podría haber competencia leve por absorción, sin relevancia clínica documentada.' },
      { id: 2, nivel: 'neutra', nota: 'Se cofórmulan a menudo sin interferencia, aunque el beneficio añadido en deportistas sanos y bien nutridos es discutible.' },
      { id: 4, nivel: 'neutra' },
      { id: 5, nivel: 'neutra' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'neutra' },
      { id: 8, nivel: 'neutra' },
      { id: 9, nivel: 'neutra' },
      { id: 10, nivel: 'positiva', evidencia: 'M', nota: 'Ambos con papel en salud intestinal y modulación de la inflamación, aunque buena parte de la evidencia se extrapola de contextos clínicos.' },
      { id: 11, nivel: 'neutra' },
    ],
    cafeina: 'Sin interacción relevante conocida.',
    alcohol: 'Deteriora la barrera intestinal y deplecióna reservas de glutamina — contrario al motivo por el que se toma.',
    carbonatadas: 'Neutras, salvo que sean irritantes para quien busca el beneficio digestivo.',
  },
  {
    id: 4,
    nombre: 'Nitratos (remolacha)',
    mecanismo:
      'Nitrato dietético → nitrito (bacterias de la lengua) → NO en el medio ácido gástrico y en los tejidos; mejora la economía de oxígeno durante el ejercicio.',
    relaciones: [
      { id: 1, nivel: 'positiva', evidencia: 'M', nota: 'Dos vías distintas hacia el NO.' },
      { id: 2, nivel: 'positiva', evidencia: 'M', nota: 'Energía muscular y vasodilatación son ejes distintos.' },
      { id: 3, nivel: 'neutra' },
      { id: 5, nivel: 'neutra', nota: 'La vitamina C puede favorecer la reducción de nitrito a NO en el estómago, pero la suplementación antioxidante crónica a dosis altas también se ha vinculado a cierta atenuación de las adaptaciones al ejercicio. Evidencia mixta.' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'neutra' },
      { id: 8, nivel: 'precaucion', nota: 'Ambos pueden potenciar fármacos antihipertensivos; riesgo aditivo (modesto a dosis dietéticas) de hipotensión o mareo en personas sensibles.' },
      { id: 9, nivel: 'precaucion', nota: 'Mismo motivo que con cordyceps: riesgo aditivo de hipotensión.' },
      { id: 10, nivel: 'positiva', evidencia: 'M', nota: 'Ambos convergen en la función endotelial.' },
      { id: 11, nivel: 'positiva', evidencia: 'M', nota: 'Vasodilatación y tamponamiento muscular son ejes independientes.' },
    ],
    cafeina: 'Sin bloqueo químico; algunos estudios apuntan a efecto ergogénico aditivo.',
    alcohol: 'El alcohol también vasodilata por otra vía; la suma puede producir rubor, mareo o hipotensión en personas sensibles.',
    carbonatadas: 'Neutras; la conversión nitrato-nitrito-NO depende de bacterias orales y acidez gástrica, no de la carbonatación.',
  },
  {
    id: 5,
    nombre: 'Supradyn Activo',
    mecanismo:
      "Multivitamínico/mineral: 13 vitaminas, 9 minerales y coenzima Q10 (incluye hierro, magnesio, calcio, zinc, selenio...). No lleva cafeína, guaraná ni excitantes pese al nombre 'Activo'.",
    relaciones: [
      { id: 1, nivel: 'neutra' },
      { id: 2, nivel: 'positiva', evidencia: 'M', nota: 'El magnesio es cofactor de la creatina-quinasa.' },
      { id: 3, nivel: 'neutra' },
      { id: 4, nivel: 'neutra', nota: 'Ver matiz de la vitamina C / antioxidantes crónicos en la ficha de nitratos.' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'neutra', nota: 'Redundancia de antioxidantes (vitamina C y E en ambos) — no es negativo, pero tampoco multiplica el beneficio proporcionalmente.' },
      { id: 8, nivel: 'neutra' },
      { id: 9, nivel: 'positiva', nota: 'El magnesio y las vitaminas del grupo B sostienen la función nerviosa que la ashwagandha modula.' },
      { id: 10, nivel: 'positiva', nota: 'La vitamina E protege de la oxidación a los ácidos grasos poliinsaturados.' },
      { id: 11, nivel: 'neutra' },
    ],
    cafeina: 'Interacción real: los taninos y polifenoles del café inhiben la absorción del hierro no hemo. Separar la toma 1-2 horas.',
    alcohol: 'El consumo repetido interfiere con la absorción y metabolismo de varias vitaminas del grupo B (B1, B6, B12, fólico).',
    carbonatadas: 'Las de cola llevan ácido fosfórico, que con consumo habitual puede interferir modestamente con el calcio; en una toma puntual es irrelevante.',
  },
  {
    id: 6,
    nombre: 'DMAE',
    mecanismo:
      'Precursor teórico de colina/acetilcolina; la evidencia de beneficio cognitivo por vía oral es débil y discutida — su uso mejor respaldado es tópico (firmeza cutánea), no el nootrópico oral.',
    relaciones: [
      { id: 1, nivel: 'neutra' },
      { id: 2, nivel: 'neutra' },
      { id: 3, nivel: 'neutra' },
      { id: 4, nivel: 'neutra' },
      { id: 5, nivel: 'neutra' },
      { id: 7, nivel: 'neutra' },
      { id: 8, nivel: 'neutra', nota: "En personas sensibles la suma de 'activadores' podría notarse subjetivamente, sin ser una interacción real." },
      { id: 9, nivel: 'precaucion', nota: 'No hay antagonismo químico, pero persiguen objetivos funcionalmente opuestos (activación/cognición frente a calma y reducción de cortisol); combinarlos tiende a diluir el efecto subjetivo buscado de cada uno.' },
      { id: 10, nivel: 'neutra' },
      { id: 11, nivel: 'neutra' },
    ],
    cafeina: 'Ambos levemente estimulantes; combinados aumentan el riesgo de sobreestimulación, nerviosismo o insomnio por la tarde.',
    alcohol: 'Sin interacción química mayor, pero al ser depresor del SNC contrarresta cualquier efecto del DMAE.',
    carbonatadas: 'Neutras.',
  },
  {
    id: 7,
    nombre: 'Heliocare',
    mecanismo:
      'Extracto de Polypodium leucotomos (Fernblock), fotoprotector oral. La marca tiene varias versiones (Oral clásico, 360, Ultra D, Bronze) con distintos extras — conviene revisar el envase concreto.',
    relaciones: [
      { id: 1, nivel: 'neutra' },
      { id: 2, nivel: 'neutra' },
      { id: 3, nivel: 'neutra' },
      { id: 4, nivel: 'neutra' },
      { id: 5, nivel: 'neutra', nota: 'Redundancia de antioxidantes (vitamina C y E en ambos).' },
      { id: 6, nivel: 'neutra' },
      { id: 8, nivel: 'neutra' },
      { id: 9, nivel: 'neutra' },
      { id: 10, nivel: 'positiva', nota: 'El papel antiinflamatorio del omega-3 complementa el efecto fotoprotector/antioxidante cutáneo.' },
      { id: 11, nivel: 'neutra' },
    ],
    cafeina: 'Sin interacción conocida.',
    alcohol: 'Sin antagonismo químico directo, pero deshidrata y no ayuda al objetivo de fotoprotección/salud cutánea.',
    carbonatadas: 'Neutras.',
    advertenciaMedica: 'El fabricante indica ausencia de interacciones farmacológicas relevantes, con la salvedad genérica de espaciar el consumo respecto a suplementos de fibra.',
  },
  {
    id: 8,
    nombre: 'Cordyceps',
    mecanismo:
      'Mejora teórica de la utilización de oxígeno y del ATP celular; efecto inmunomodulador y posible efecto leve antiagregante/hipotensor. Evidencia humana en rendimiento deportivo modesta y mixta.',
    relaciones: [
      { id: 1, nivel: 'positiva', evidencia: 'T', nota: 'Ambos orientados al aporte de oxígeno.' },
      { id: 2, nivel: 'neutra' },
      { id: 3, nivel: 'neutra' },
      { id: 4, nivel: 'precaucion', nota: 'Ambos pueden potenciar antihipertensivos; riesgo aditivo de hipotensión.' },
      { id: 5, nivel: 'neutra' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'neutra' },
      { id: 9, nivel: 'positiva', evidencia: 'T', nota: "Combinación popular entre adaptógenos: energía sin sobreestimulación, el cordyceps aporta 'combustible' y la ashwagandha modula el cortisol." },
      { id: 10, nivel: 'precaucion', nota: 'Ambos con posible efecto leve antiagregante/anticoagulante; combinados podrían sumar, de forma modesta, el riesgo de sangrado — relevante sobre todo con medicación anticoagulante o cirugía próxima.' },
      { id: 11, nivel: 'positiva', nota: 'Ejes de rendimiento distintos.' },
    ],
    cafeina: "Sin interacción farmacológica establecida; en personas sensibles, la suma de 'energizantes' puede notarse como activación nerviosa.",
    alcohol: 'Sin interacción química relevante, pero contradice el objetivo de rendimiento/recuperación.',
    carbonatadas: 'Neutras.',
    advertenciaMedica: 'A nivel médico general, también interactúa con inmunosupresores y antihipertensivos, aunque no estén en esta lista.',
  },
  {
    id: 9,
    nombre: 'Ashwagandha',
    mecanismo:
      'Adaptógeno; reduce el cortisol (su efecto mejor documentado) y tiene una leve acción GABAérgica/sedante (witaférina A); puede modificar las hormonas tiroideas.',
    relaciones: [
      { id: 1, nivel: 'neutra' },
      { id: 2, nivel: 'positiva', evidencia: 'E/T', nota: 'Algún ensayo con entrenamiento de fuerza muestra mejoras superiores, vía reducción de cortisol.' },
      { id: 3, nivel: 'neutra' },
      { id: 4, nivel: 'precaucion', nota: 'Riesgo aditivo de hipotensión.' },
      { id: 5, nivel: 'positiva', nota: 'El magnesio y las vitaminas del grupo B sostienen la función nerviosa que la ashwagandha modula.' },
      { id: 6, nivel: 'precaucion', nota: 'Objetivos funcionalmente opuestos (activación frente a calma); combinarlos diluye el efecto subjetivo de cada uno.' },
      { id: 7, nivel: 'neutra' },
      { id: 8, nivel: 'positiva', evidencia: 'T', nota: 'Combinación popular entre adaptógenos.' },
      { id: 10, nivel: 'positiva', nota: 'Perfil antiinflamatorio/de bienestar general compatible.' },
      { id: 11, nivel: 'neutra' },
    ],
    cafeina: 'Objetivo funcionalmente contrario: la ashwagandha busca bajar cortisol/activación y la cafeína lo sube. Se recomienda moderar la cafeína.',
    alcohol: 'Se recomienda evitarlo — ambos son depresores leves del SNC (riesgo de somnolencia excesiva) y el alcohol contradice el efecto ansiolítico buscado.',
    carbonatadas: 'Neutras; se tolera mejor con comida.',
    advertenciaMedica: 'A nivel médico general: potencia sedantes, antihipertensivos y antidiabéticos, e interfiere con medicación tiroidea e inmunosupresora.',
  },
  {
    id: 10,
    nombre: 'Omega 3',
    mecanismo:
      'EPA/DHA. Antiinflamatorio, apoyo cardiovascular y cognitivo; efecto antiagregante leve a dosis altas (>3 g/día).',
    relaciones: [
      { id: 1, nivel: 'positiva', evidencia: 'M', nota: 'Apoyo complementario a la función endotelial.' },
      { id: 2, nivel: 'neutra' },
      { id: 3, nivel: 'positiva', evidencia: 'M', nota: 'Ambos con papel en salud intestinal y modulación de la inflamación.' },
      { id: 4, nivel: 'positiva', evidencia: 'M', nota: 'Ambos convergen en la función endotelial.' },
      { id: 5, nivel: 'positiva', nota: 'La vitamina E protege de la oxidación a los ácidos grasos poliinsaturados.' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'positiva', nota: 'El papel antiinflamatorio complementa el efecto fotoprotector/antioxidante cutáneo.' },
      { id: 8, nivel: 'precaucion', nota: 'Riesgo aditivo, modesto, de sangrado — relevante con medicación anticoagulante o cirugía próxima.' },
      { id: 9, nivel: 'positiva', nota: 'Perfil antiinflamatorio/de bienestar general compatible.' },
      { id: 11, nivel: 'neutra' },
    ],
    cafeina: 'Sin interacción química; su absorción depende de la grasa de la comida, tomarlo solo con café sin grasa reduce el aprovechamiento.',
    alcohol: 'Sin bloqueo agudo, pero el consumo crónico eleva triglicéridos y contrarresta el beneficio cardiovascular buscado.',
    carbonatadas: 'Neutras; mismo matiz — necesita algo de grasa en la comida para absorberse bien.',
  },
  {
    id: 11,
    nombre: 'Beta-Alanina',
    mecanismo:
      'Aumenta la carnosina muscular, tamponando el ácido láctico/H+ en esfuerzos de alta intensidad de 1 a 4 minutos.',
    relaciones: [
      { id: 1, nivel: 'positiva', evidencia: 'M', nota: 'Sistemas energéticos que no se solapan.' },
      { id: 2, nivel: 'positiva', evidencia: 'E', nota: 'Combinación mejor documentada de la lista: sistema fosfágeno + tamponamiento de carnosina.' },
      { id: 3, nivel: 'neutra' },
      { id: 4, nivel: 'positiva', evidencia: 'M', nota: 'Vasodilatación y tamponamiento muscular son ejes independientes.' },
      { id: 5, nivel: 'neutra' },
      { id: 6, nivel: 'neutra' },
      { id: 7, nivel: 'neutra' },
      { id: 8, nivel: 'positiva', nota: 'Ejes de rendimiento distintos.' },
      { id: 9, nivel: 'neutra' },
      { id: 10, nivel: 'neutra' },
    ],
    cafeina: 'Combinación clásica y bien tolerada en pre-entrenos; mecanismos independientes (tamponamiento muscular frente a sistema nervioso central).',
    alcohol: 'Sin interacción química, pero contraproducente para el objetivo de rendimiento.',
    carbonatadas: 'Neutras; la parestesia (hormigueo) típica de la beta-alanina no cambia con la carbonatación.',
  },
];

export function getSuplemento(id: number): Suplemento | undefined {
  return SUPLEMENTOS.find((s) => s.id === id);
}

export function getRelacion(idA: number, idB: number): RelacionSuplemento | undefined {
  const suplementoA = getSuplemento(idA);
  if (!suplementoA) return undefined;
  return suplementoA.relaciones.find((r) => r.id === idB);
}