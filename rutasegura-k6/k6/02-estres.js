// PRUEBA DE ESTRÉS (stress test)
// Objetivo: llevar el sistema MÁS ALLÁ de la carga esperada, por escalones, para observar
// cómo se degrada, qué componente falla primero y si se recupera al bajar la carga.
//
// Escalones: 20 → 50 → 100 → 150 usuarios y luego recuperación a 10.
//
// Ejecutar:  k6 run k6/02-estres.js
// Escalón máximo distinto: k6 run -e MAX=200 k6/02-estres.js

import { viajero, monitorServidor, prepararPrueba, cerrarPrueba } from './lib/flujo.js';
import { SLO, ESCENARIO_MONITOR, TREND_STATS } from './lib/config.js';
import { crearResumen } from './lib/resumen.js';

const MAX = parseInt(__ENV.MAX || '150', 10);

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    viajeros: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 }, // nivel normal
        { duration: '1m', target: 20 },
        { duration: '1m', target: 50 }, // por encima de lo normal
        { duration: '1m', target: 50 },
        { duration: '1m', target: 100 }, // estrés
        { duration: '1m', target: 100 },
        { duration: '1m', target: MAX }, // estrés severo
        { duration: '1m', target: MAX },
        { duration: '1m', target: 10 }, // recuperación: ¿vuelve a la normalidad?
        { duration: '1m', target: 10 },
      ],
      gracefulRampDown: '10s',
    },
    monitor: { ...ESCENARIO_MONITOR, duration: '10m' },
  },
  // En estrés se ESPERA incumplir los SLO. Los umbrales sirven para documentar el quiebre,
  // no para detener la prueba.
  thresholds: SLO,
};

export function setup() {
  return prepararPrueba();
}

export default function () {
  viajero();
}

export { monitorServidor };

export function teardown(datos) {
  cerrarPrueba(datos);
}

export const handleSummary = crearResumen('estres');
