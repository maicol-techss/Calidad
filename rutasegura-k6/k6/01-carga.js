// PRUEBA DE CARGA (load test)
// Objetivo: verificar que el sistema cumple los SLO con la carga ESPERADA en un día normal.
// Escenario: rampa hasta 20 usuarios concurrentes, sostenidos durante 3 minutos.
//
// Ejecutar:               k6 run k6/01-carga.js
// Cambiar usuarios/tiempo: k6 run -e VUS=30 -e SOSTENER=5m k6/01-carga.js

import { viajero, monitorServidor, prepararPrueba, cerrarPrueba } from './lib/flujo.js';
import { SLO, ESCENARIO_MONITOR, TREND_STATS, aSegundos } from './lib/config.js';
import { crearResumen } from './lib/resumen.js';

const VUS = parseInt(__ENV.VUS || '20', 10);
const SOSTENER = __ENV.SOSTENER || '3m';

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    viajeros: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: VUS }, // calentamiento
        { duration: SOSTENER, target: VUS }, // carga sostenida
        { duration: '30s', target: 0 }, // enfriamiento
      ],
      gracefulRampDown: '10s',
    },
    // El monitor dura lo mismo que las etapas: 1m + SOSTENER + 30s
    monitor: { ...ESCENARIO_MONITOR, duration: `${60 + aSegundos(SOSTENER) + 30}s` },
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

export const handleSummary = crearResumen('carga');
