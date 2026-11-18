// PRUEBA DE PICOS (spike test)
// Objetivo: simular un aumento súbito de usuarios (por ejemplo, un cierre vial anunciado
// en noticias) y medir si el sistema sobrevive al pico y cuánto tarda en recuperarse.
//
// Ejecutar:  k6 run k6/03-picos.js
// Pico distinto: k6 run -e PICO=250 k6/03-picos.js

import { viajero, monitorServidor, prepararPrueba, cerrarPrueba } from './lib/flujo.js';
import { SLO, ESCENARIO_MONITOR, TREND_STATS } from './lib/config.js';
import { crearResumen } from './lib/resumen.js';

const PICO = parseInt(__ENV.PICO || '150', 10);

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    viajeros: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '1m', target: 5 }, // línea base
        { duration: '10s', target: PICO }, // subida súbita
        { duration: '1m', target: PICO }, // pico sostenido
        { duration: '10s', target: 5 }, // caída súbita
        { duration: '2m', target: 5 }, // ¿se recupera?
      ],
      gracefulRampDown: '10s',
    },
    monitor: { ...ESCENARIO_MONITOR, duration: '4m30s' },
  },
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

export const handleSummary = crearResumen('picos');
