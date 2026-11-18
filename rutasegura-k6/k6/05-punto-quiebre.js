// PRUEBA DE PUNTO DE QUIEBRE (breakpoint test)
// Objetivo: encontrar la CAPACIDAD MÁXIMA del sistema. Se incrementa la tasa de llegada
// de usuarios de forma continua y la prueba se detiene automáticamente cuando se
// incumple un SLO crítico (abortOnFail).
//
// A diferencia de las demás pruebas, aquí se usa un modelo ABIERTO (arrival-rate):
// llegan N iteraciones por segundo sin importar si el sistema ya está saturado.
//
// Ejecutar:  k6 run k6/05-punto-quiebre.js

import { viajero, monitorServidor, prepararPrueba, cerrarPrueba } from './lib/flujo.js';
import { ESCENARIO_MONITOR, TREND_STATS } from './lib/config.js';
import { crearResumen } from './lib/resumen.js';

const TASA_MAX = parseInt(__ENV.TASA_MAX || '60', 10); // iteraciones (flujos) por segundo

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    viajeros: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 1000,
      stages: [{ duration: '10m', target: TASA_MAX }],
    },
    monitor: { ...ESCENARIO_MONITOR, duration: '10m' },
  },
  thresholds: {
    // Al incumplir cualquiera de estos umbrales la prueba se detiene: ese es el punto de quiebre.
    // delayAbortEval evita abortar por ruido en los primeros segundos.
    'http_req_failed{scenario:viajeros}': [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_duration{scenario:viajeros}': [{ threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

export function setup() {
  return prepararPrueba();
}

export default function () {
  // Sin pausas: en el modelo abierto el ritmo lo controla la tasa de llegada.
  viajero({ pausa: [0, 0] });
}

export { monitorServidor };

export function teardown(datos) {
  cerrarPrueba(datos);
}

export const handleSummary = crearResumen('punto-quiebre');
