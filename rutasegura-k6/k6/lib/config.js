// Configuración compartida por todos los scripts de k6.

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const CIUDADES = [
  'Medellín', 'Bogotá', 'Cali', 'Palmira', 'Barranquilla', 'Cartagena', 'Bucaramanga',
  'Pereira', 'Manizales', 'Armenia', 'Ibagué', 'Tuluá', 'Buga', 'Rionegro', 'Santa Marta',
  'Montería', 'Neiva', 'Popayán', 'Pasto', 'Villavicencio',
];

export const TIPOS_INCIDENTE = ['accidente', 'derrumbe', 'obra', 'manifestación', 'neblina', 'vía cerrada'];

// Objetivos de nivel de servicio (SLO) acordados con el "cliente" de RutaSegura.
// Se aplican solo al escenario "viajeros" para no mezclar el tráfico del monitor.
export const SLO = {
  // Globales
  'http_req_failed{scenario:viajeros}': ['rate<0.01'], // menos del 1 % de errores
  'http_req_duration{scenario:viajeros}': ['p(95)<800', 'p(99)<1500'],
  'checks{scenario:viajeros}': ['rate>0.99'],

  // Por endpoint (la etiqueta "endpoint" se asigna en lib/flujo.js)
  'http_req_duration{endpoint:login}': ['p(95)<1000'],
  'http_req_duration{endpoint:buscar_rutas}': ['p(95)<300'],
  'http_req_duration{endpoint:detalle_ruta}': ['p(95)<200'],
  'http_req_duration{endpoint:incidentes_ruta}': ['p(95)<500'],
  'http_req_duration{endpoint:eta}': ['p(95)<1000'],
  'http_req_duration{endpoint:reportar_incidente}': ['p(95)<800'],
  'http_req_duration{endpoint:estadisticas}': ['p(95)<1500'],
};

// Escenario auxiliar que consulta /metricas cada 5 s para registrar el estado del servidor
// (memoria, cola del pool, retraso del event loop) junto a los resultados de k6.
export const ESCENARIO_MONITOR = {
  executor: 'constant-arrival-rate',
  exec: 'monitorServidor',
  rate: 1,
  timeUnit: '5s',
  preAllocatedVUs: 1,
  maxVUs: 2,
};

// Estadísticas que se calculan para cada métrica de tiempo (incluye p99).
export const TREND_STATS = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];

// Convierte una duración de k6 ('90s', '3m', '1h') a segundos.
export function aSegundos(duracion) {
  const m = String(duracion).match(/^(\d+)(s|m|h)$/);
  if (!m) throw new Error(`Duración no válida: ${duracion}. Use, por ejemplo, 90s, 3m o 1h`);
  return parseInt(m[1], 10) * { s: 1, m: 60, h: 3600 }[m[2]];
}
