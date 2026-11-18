// RETO: diseñe su propia prueba
// Complete los espacios marcados con TODO. Este archivo es parte de la entrega del taller.
//
// Contexto: el área de analítica de RutaSegura publica el reporte de estadísticas en una
// pantalla del centro de control que se actualiza constantemente. Se espera que unas
// 15 pantallas consulten /reportes/estadisticas cada 2 segundos, al mismo tiempo que
// 20 viajeros usan la aplicación de forma normal.
//
// Preguntas que debe responder la prueba:
//   1. ¿El reporte cumple su SLO (p95 < 1500 ms) con esa concurrencia?
//   2. ¿Las consultas al reporte afectan el tiempo de respuesta de los viajeros? ¿Por qué?
//
// Ejecutar:  k6 run k6/06-reto-estudiante.js

import http from 'k6/http';
import { check } from 'k6';
import { viajero, monitorServidor, prepararPrueba, cerrarPrueba } from './lib/flujo.js';
import { BASE_URL, SLO, ESCENARIO_MONITOR, TREND_STATS } from './lib/config.js';
import { crearResumen } from './lib/resumen.js';

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    viajeros: {
      executor: 'constant-vus',
      vus: 20,
      duration: '3m',
    },

    // TODO 1: agregue un escenario llamado "pantallas" que:
    //   - use el executor 'constant-arrival-rate'
    //   - ejecute la función exportada 'pantallaControl' (propiedad exec)
    //   - genere 15 consultas cada 2 segundos (rate y timeUnit)
    //   - dure 3 minutos y preasigne VUs suficientes
    pantallas: {
      executor: 'constant-arrival-rate',
      exec: 'pantallaControl',
      rate: 15,
      timeUnit: '2s',
      duration: '3m',
      preAllocatedVUs: 15,
      maxVUs: 30,
    },
    monitor: { ...ESCENARIO_MONITOR, duration: '3m' },
  },
  thresholds: {
    ...SLO,
    // TODO 2: agregue un umbral exclusivo para el escenario "pantallas":
    //   p95 del tiempo de respuesta menor a 1500 ms y tasa de error menor al 1 %.
    //   Pista: 'http_req_duration{scenario:pantallas}'
    'http_req_duration{scenario:pantallas}': ['p(95)<1500'],
    'http_req_failed{scenario:pantallas}': ['rate<0.01'],
    'checks{scenario:pantallas}': ['rate>0.99'],
  },
};

export function setup() {
  return prepararPrueba();
}

export default function () {
  viajero();
}

export function pantallaControl() {
  // TODO 3: haga un GET a `${BASE_URL}/reportes/estadisticas` con la etiqueta
  //   { endpoint: 'estadisticas' } y verifique con check() que:
  //   - el status sea 200
  //   - el cuerpo tenga la propiedad totalIncidentes
  const res = http.get(`${BASE_URL}/reportes/estadisticas`, {
    tags: { endpoint: 'estadisticas' },
  });

  check(res, {
    'estadisticas: status 200': (r) => r.status === 200,
    'estadisticas: totalIncidentes válido': (r) => {
      try {
        const totalIncidentes = r.json('totalIncidentes');
        return Number.isInteger(totalIncidentes) && totalIncidentes >= 0;
      } catch (e) {
        return false;
      }
    },
  });
}

export { monitorServidor };

export function teardown(datos) {
  cerrarPrueba(datos);
}

export const handleSummary = crearResumen('reto');

// TODO 4 (análisis): ejecute la prueba dos veces, la segunda con la API iniciada con
// CACHE_ESTADISTICAS=true. Registre los resultados en la tabla del taller y explique la diferencia.
