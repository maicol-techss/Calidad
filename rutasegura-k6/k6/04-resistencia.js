// PRUEBA DE RESISTENCIA (soak / endurance test)
// Objetivo: mantener una carga moderada durante un periodo prolongado para detectar
// problemas que solo aparecen con el tiempo: fugas de memoria, crecimiento de colas,
// degradación progresiva de los tiempos de respuesta.
//
// En producción una prueba de resistencia dura horas. Para clase se usan 10 minutos.
//
// Ejecutar:               k6 run k6/04-resistencia.js
// Más tiempo:             k6 run -e DURACION=30m k6/04-resistencia.js

import { viajero, monitorServidor, prepararPrueba, cerrarPrueba } from './lib/flujo.js';
import { SLO, ESCENARIO_MONITOR, TREND_STATS } from './lib/config.js';
import { crearResumen } from './lib/resumen.js';

const DURACION = __ENV.DURACION || '10m';
const VUS = parseInt(__ENV.VUS || '30', 10);

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    viajeros: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURACION,
    },
    monitor: { ...ESCENARIO_MONITOR, duration: DURACION },
  },
  thresholds: {
    ...SLO,
    // Umbral de memoria: el heap de la aplicación no debería superar 150 MB con carga moderada.
    servidor_heap_mb: ['value<150'],
  },
};

export function setup() {
  return prepararPrueba();
}

export default function () {
  // Muchas páginas distintas = muchas claves distintas en la caché de búsqueda.
  // Así se reproduce el patrón real de usuarios que buscan combinaciones variadas.
  viajero({ paginasBusqueda: 500, pausa: [1, 2] });
}

export { monitorServidor };

export function teardown(datos) {
  cerrarPrueba(datos);
}

export const handleSummary = crearResumen('resistencia');
