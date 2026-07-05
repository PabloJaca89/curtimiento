'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { SUPLEMENTOS, getRelacion, type Suplemento, type NivelRelacion } from '@/lib/suplementosData';

function simboloNivel(nivel: NivelRelacion): string {
  if (nivel === 'positiva') return '✅';
  if (nivel === 'precaucion') return '⚠️';
  return '⚪';
}

function claseNivel(nivel: NivelRelacion): string {
  if (nivel === 'positiva') return 'bg-green-50 border-green-200 text-green-800';
  if (nivel === 'precaucion') return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-gray-50 border-gray-200 text-gray-600';
}

interface ParInteraccion {
  a: Suplemento;
  b: Suplemento;
  nivel: NivelRelacion;
  evidencia?: string;
  nota?: string;
}

export default function SuplementacionPage() {
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [mostrarMatriz, setMostrarMatriz] = useState(false);

  const toggleSuplemento = (id: number) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const pares: ParInteraccion[] = useMemo(() => {
    const resultado: ParInteraccion[] = [];
    for (let i = 0; i < seleccionados.length; i++) {
      for (let j = i + 1; j < seleccionados.length; j++) {
        const idA = seleccionados[i];
        const idB = seleccionados[j];
        const a = SUPLEMENTOS.find((s) => s.id === idA);
        const b = SUPLEMENTOS.find((s) => s.id === idB);
        const relacion = getRelacion(idA, idB);
        if (a && b && relacion) {
          resultado.push({
            a,
            b,
            nivel: relacion.nivel,
            evidencia: relacion.evidencia,
            nota: relacion.nota,
          });
        }
      }
    }
    const orden: Record<NivelRelacion, number> = { precaucion: 0, positiva: 1, neutra: 2 };
    return resultado.sort((x, y) => orden[x.nivel] - orden[y.nivel]);
  }, [seleccionados]);

  const seleccionadosData = SUPLEMENTOS.filter((s) => seleccionados.includes(s.id));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suplementación</h1>
        <Link href="/calendario" className="text-sm text-blue-600 hover:underline">
          ← Volver al calendario
        </Link>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        No cubre dosis, embarazo, menores ni medicación crónica. Las precauciones no son
        contraindicaciones absolutas a dosis de suplemento habitual: son puntos donde conviene
        prestar atención, sobre todo si hay medicación de por medio.
      </p>

      {/* Selector */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">¿Qué tomas?</h2>
        <div className="flex flex-wrap gap-2">
          {SUPLEMENTOS.map((s) => {
            const activo = seleccionados.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSuplemento(s.id)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  activo
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                }`}
              >
                {s.nombre}
              </button>
            );
          })}
        </div>
      </section>

      {/* Comprobación de combinaciones */}
      {seleccionados.length >= 2 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Combinaciones ({pares.length})
          </h2>
          <div className="space-y-2">
            {pares.map((par, idx) => (
              <div
                key={idx}
                className={`border rounded-lg p-3 ${claseNivel(par.nivel)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {simboloNivel(par.nivel)} {par.a.nombre} + {par.b.nombre}
                  </span>
                  {par.evidencia && (
                    <span className="text-xs px-2 py-0.5 rounded bg-white/60 border border-current">
                      {par.evidencia}
                    </span>
                  )}
                </div>
                {par.nota && <p className="text-sm mt-1 opacity-90">{par.nota}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Café / alcohol / carbonatadas de los seleccionados */}
      {seleccionadosData.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Café, alcohol y carbonatadas
          </h2>
          <div className="space-y-3">
            {seleccionadosData.map((s) => (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                <p className="font-medium text-gray-900 mb-1">{s.nombre}</p>
                <p className="text-sm text-gray-600"><span className="font-medium">Café:</span> {s.cafeina}</p>
                <p className="text-sm text-gray-600"><span className="font-medium">Alcohol:</span> {s.alcohol}</p>
                <p className="text-sm text-gray-600"><span className="font-medium">Carbonatadas:</span> {s.carbonatadas}</p>
                {s.advertenciaMedica && (
                  <p className="text-sm text-amber-700 mt-1">⚠️ {s.advertenciaMedica}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ficha completa */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Ficha completa</h2>
        <div className="space-y-2">
          {SUPLEMENTOS.map((s) => (
            <details key={s.id} className="border border-gray-200 rounded-lg p-3">
              <summary className="font-medium text-gray-900 cursor-pointer">
                {s.nombre}
              </summary>
              <div className="mt-2 space-y-1">
                <p className="text-sm text-gray-700">{s.mecanismo}</p>
                <p className="text-sm text-gray-600"><span className="font-medium">Café:</span> {s.cafeina}</p>
                <p className="text-sm text-gray-600"><span className="font-medium">Alcohol:</span> {s.alcohol}</p>
                <p className="text-sm text-gray-600"><span className="font-medium">Carbonatadas:</span> {s.carbonatadas}</p>
                {s.advertenciaMedica && (
                  <p className="text-sm text-amber-700">⚠️ {s.advertenciaMedica}</p>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Matriz completa */}
      <section>
        <button
          onClick={() => setMostrarMatriz((v) => !v)}
          className="text-sm text-blue-600 hover:underline mb-3"
        >
          {mostrarMatriz ? 'Ocultar' : 'Mostrar'} matriz completa (11×11)
        </button>
        {mostrarMatriz && (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-200 p-1"></th>
                  {SUPLEMENTOS.map((s) => (
                    <th key={s.id} className="border border-gray-200 p-1 font-medium">
                      {s.nombre.slice(0, 4)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SUPLEMENTOS.map((fila) => (
                  <tr key={fila.id}>
                    <td className="border border-gray-200 p-1 font-medium whitespace-nowrap">
                      {fila.nombre}
                    </td>
                    {SUPLEMENTOS.map((columna) => {
                      if (columna.id === fila.id) {
                        return (
                          <td key={columna.id} className="border border-gray-200 p-1 text-center text-gray-300">
                            —
                          </td>
                        );
                      }
                      const relacion = getRelacion(fila.id, columna.id);
                      return (
                        <td key={columna.id} className="border border-gray-200 p-1 text-center">
                          {relacion ? simboloNivel(relacion.nivel) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}