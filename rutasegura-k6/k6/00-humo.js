// PRUEBA DE HUMO (smoke test)
// Objetivo: verificar que el script y la API funcionan con carga mínima antes de
// lanzar pruebas más costosas. Si esta prueba falla, no tiene sentido continuar.
//
// Ejecutar:  k6 run k6/00-humo.js

import { viajero, monitorServidor, prepararPrueba, cerrarPrueba } from './lib/flujo.js';
import { SLO, ESCENARIO_MONITOR, TREND_STATS } from './lib/config.js';
import { crearResumen } from './lib/resumen.js';

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    viajeros: {
      executor: 'per-vu-iterations',
      vus: 2,
      iterations: 5,
      maxDuration: '1m',
    },
    monitor: { ...ESCENARIO_MONITOR, duration: '30s' },
  },
  thresholds: {
    ...SLO,
    // En humo exigimos cero errores: con 2 usuarios todo debe funcionar.
    'http_req_failed{scenario:viajeros}': ['rate==0'],
    'checks{scenario:viajeros}': ['rate==1'],
    'http_req_duration{scenario:viajeros}': ['p(95)<1500'],
  },
};

export function setup() {
  return prepararPrueba();
}

export default function () {
  // probReporte y probEstadisticas altas para recorrer todos los endpoints al menos una vez.
  viajero({ probReporte: 1, probEstadisticas: 1, pausa: [1, 1] });
}

export { monitorServidor };

export function teardown(datos) {
  cerrarPrueba(datos);
}

export const handleSummary = crearResumen('humo');
