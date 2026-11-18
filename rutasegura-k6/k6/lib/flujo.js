// Flujo de usuario realista de RutaSegura y funciones auxiliares compartidas.

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { BASE_URL, CIUDADES, TIPOS_INCIDENTE } from './config.js';

// ---------------------------------------------------------------- datos de prueba

// SharedArray carga el archivo una sola vez y lo comparte entre todos los VUs (ahorra memoria).
const usuarios = new SharedArray('usuarios', () => JSON.parse(open('../data/usuarios.json')));

// ---------------------------------------------------------------- métricas personalizadas

export const duracionFlujo = new Trend('rs_duracion_flujo', true);
export const erroresNegocio = new Rate('rs_errores_negocio');
export const incidentesCreados = new Counter('rs_incidentes_creados');

const memoriaServidor = new Gauge('servidor_memoria_rss_mb');
const heapServidor = new Gauge('servidor_heap_mb');
const colaPool = new Gauge('servidor_cola_pool');
const timeoutsPool = new Gauge('servidor_timeouts_pool');
const lagEventLoop = new Gauge('servidor_lag_event_loop_p99_ms');
const cacheBusqueda = new Gauge('servidor_entradas_cache');

// ---------------------------------------------------------------- utilidades

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const azar = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const elegir = (arr) => arr[Math.floor(Math.random() * arr.length)];

function jsonSeguro(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

// Cada VU inicia sesión una sola vez y reutiliza su token (variable a nivel de módulo = por VU).
let token = null;

export function iniciarSesion() {
  const u = usuarios[(exec.vu.idInTest - 1) % usuarios.length];
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ usuario: u.usuario, clave: u.clave }), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'login', name: 'POST /auth/login' },
  });
  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: devuelve token': (r) => !!(jsonSeguro(r) || {}).token,
  });
  erroresNegocio.add(!ok);
  token = ok ? res.json('token') : null;
  return token;
}

// ---------------------------------------------------------------- flujo principal

/**
 * Simula a un viajero que busca una ruta, revisa sus incidentes, consulta el tiempo
 * estimado y, en ocasiones, reporta un incidente.
 *
 * @param {object} opciones
 *   paginasBusqueda: rango de páginas a consultar (más páginas = más claves distintas en caché)
 *   probReporte:     probabilidad de reportar un incidente
 *   probEstadisticas probabilidad de consultar el reporte de estadísticas
 *   pausa:           [min, max] segundos de "tiempo de lectura" entre pasos
 */
export function viajero(opciones = {}) {
  const {
    paginasBusqueda = 3,
    probReporte = 0.2,
    probEstadisticas = 0.05,
    pausa = [1, 2],
  } = opciones;
  const inicio = Date.now();

  if (!token) iniciarSesion();

  let rutaId = azar(1, 200);

  group('01 Buscar rutas', () => {
    const origen = elegir(CIUDADES).slice(0, 4);
    const destino = Math.random() < 0.5 ? elegir(CIUDADES).slice(0, 4) : '';
    const pagina = azar(1, paginasBusqueda);
    const res = http.get(
      `${BASE_URL}/rutas?origen=${encodeURIComponent(origen)}&destino=${encodeURIComponent(destino)}&pagina=${pagina}`,
      { tags: { endpoint: 'buscar_rutas', name: 'GET /rutas' } }
    );
    const ok = check(res, {
      'buscar: status 200': (r) => r.status === 200,
      'buscar: trae lista de resultados': (r) => Array.isArray((jsonSeguro(r) || {}).resultados),
    });
    erroresNegocio.add(!ok);
    const cuerpo = jsonSeguro(res);
    if (cuerpo && cuerpo.resultados && cuerpo.resultados.length) rutaId = elegir(cuerpo.resultados).id;
  });
  sleep(azar(pausa[0], pausa[1]) / 2);

  group('02 Consultar ruta', () => {
    const detalle = http.get(`${BASE_URL}/rutas/${rutaId}`, {
      tags: { endpoint: 'detalle_ruta', name: 'GET /rutas/:id' },
    });
    const inc = http.get(`${BASE_URL}/rutas/${rutaId}/incidentes`, {
      tags: { endpoint: 'incidentes_ruta', name: 'GET /rutas/:id/incidentes' },
    });
    const ok = check(detalle, { 'detalle: status 200': (r) => r.status === 200 }) &&
      check(inc, {
        'incidentes: status 200': (r) => r.status === 200,
        'incidentes: trae arreglo': (r) => Array.isArray((jsonSeguro(r) || {}).incidentes),
      });
    erroresNegocio.add(!ok);
  });
  sleep(azar(pausa[0], pausa[1]) / 2);

  group('03 Tiempo estimado (ETA)', () => {
    const res = http.get(`${BASE_URL}/rutas/${rutaId}/eta`, {
      tags: { endpoint: 'eta', name: 'GET /rutas/:id/eta' },
    });
    const ok = check(res, { 'eta: status 200': (r) => r.status === 200 });
    erroresNegocio.add(!ok);
  });

  if (Math.random() < probReporte) {
    group('04 Reportar incidente', () => {
      const cuerpo = {
        rutaId,
        tipo: elegir(TIPOS_INCIDENTE),
        severidad: azar(1, 5),
        descripcion: `Reporte automático k6 - VU ${exec.vu.idInTest}`,
      };
      const res = http.post(`${BASE_URL}/incidentes`, JSON.stringify(cuerpo), {
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        tags: { endpoint: 'reportar_incidente', name: 'POST /incidentes' },
      });
      if (res.status === 401) token = null; // la sesión se perdió: volver a iniciar
      const ok = check(res, { 'reportar: status 201': (r) => r.status === 201 });
      if (ok) incidentesCreados.add(1);
      erroresNegocio.add(!ok);
    });
  }

  if (Math.random() < probEstadisticas) {
    group('05 Estadísticas', () => {
      const res = http.get(`${BASE_URL}/reportes/estadisticas`, {
        tags: { endpoint: 'estadisticas', name: 'GET /reportes/estadisticas' },
      });
      const ok = check(res, { 'estadisticas: status 200': (r) => r.status === 200 });
      erroresNegocio.add(!ok);
    });
  }

  duracionFlujo.add(Date.now() - inicio);
  sleep(azar(pausa[0], pausa[1]));
}

// ---------------------------------------------------------------- monitor y ciclo de vida

export function monitorServidor() {
  const res = http.get(`${BASE_URL}/metricas`, { tags: { endpoint: 'metricas', name: 'GET /metricas' } });
  const m = jsonSeguro(res);
  if (!m) return;
  memoriaServidor.add(m.memoriaMB.rss);
  heapServidor.add(m.memoriaMB.heapUsado);
  colaPool.add(m.poolBD.enCola);
  timeoutsPool.add(m.poolBD.timeoutsAcumulados);
  lagEventLoop.add(m.eventLoopLagMs.p99);
  cacheBusqueda.add(m.entradasCacheBusqueda);
}

export function prepararPrueba() {
  const res = http.get(`${BASE_URL}/salud`);
  if (res.status !== 200) {
    fail(`La API no responde en ${BASE_URL}. ¿Está en ejecución? (status ${res.status})`);
  }
  http.post(`${BASE_URL}/metricas/reiniciar`);
  const m = http.get(`${BASE_URL}/metricas`).json();
  console.log(`Configuración del servidor: ${JSON.stringify(m.configuracion)}`);
  return { memoriaInicialMB: m.memoriaMB.rss, incidentesIniciales: m.totalIncidentes };
}

export function cerrarPrueba(datos) {
  const m = http.get(`${BASE_URL}/metricas`).json();
  console.log(
    `Memoria RSS: ${datos.memoriaInicialMB} MB -> ${m.memoriaMB.rss} MB | ` +
      `Cola máx. pool: ${m.poolBD.maxColaObservada} | Timeouts pool: ${m.poolBD.timeoutsAcumulados} | ` +
      `Lag event loop p99: ${m.eventLoopLagMs.p99} ms | Incidentes: ${datos.incidentesIniciales} -> ${m.totalIncidentes}`
  );
}
