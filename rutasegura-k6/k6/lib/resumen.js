// Genera un resumen en español al finalizar cada prueba y guarda la evidencia en /resultados.
// k6 llama a handleSummary(data) al final; aquí construimos la función para cada script.

const ENDPOINTS = [
  'login',
  'buscar_rutas',
  'detalle_ruta',
  'incidentes_ruta',
  'eta',
  'reportar_incidente',
  'estadisticas',
];

const ms = (v) => (v === undefined || v === null ? '   -   ' : `${v.toFixed(0).padStart(6)} ms`);
const pct = (v) => (v === undefined ? '-' : `${(v * 100).toFixed(2)} %`);

function fila(nombre, valores) {
  return `  ${nombre.padEnd(22)} ${ms(valores['p(50)'] ?? valores.med)} ${ms(valores['p(90)'])} ${ms(valores['p(95)'])} ${ms(valores['p(99)'])} ${ms(valores.max)}`;
}

function umbrales(data) {
  const lineas = [];
  for (const [nombre, metrica] of Object.entries(data.metrics)) {
    if (!metrica.thresholds) continue;
    for (const [expresion, resultado] of Object.entries(metrica.thresholds)) {
      lineas.push(`  ${resultado.ok ? '✔ CUMPLE   ' : '✘ NO CUMPLE'}  ${nombre}  ${expresion}`);
    }
  }
  return lineas.sort();
}

function gauge(data, nombre) {
  const m = data.metrics[nombre];
  if (!m) return '-';
  return `último ${m.values.value}  (mín ${m.values.min}, máx ${m.values.max})`;
}

export function crearResumen(nombrePrueba) {
  return function handleSummary(data) {
    const m = data.metrics;
    const duracionSeg = data.state.testRunDurationMs / 1000;
    const general = m['http_req_duration{scenario:viajeros}'] || m.http_req_duration;
    const fallas = m['http_req_failed{scenario:viajeros}'] || m.http_req_failed;

    const lineas = [];
    lineas.push('');
    lineas.push('═'.repeat(78));
    lineas.push(`  RutaSegura · Resultado de la prueba: ${nombrePrueba.toUpperCase()}`);
    lineas.push('═'.repeat(78));
    lineas.push(`  Duración total:          ${duracionSeg.toFixed(0)} s`);
    lineas.push(`  VUs máximos:             ${m.vus_max ? m.vus_max.values.max : '-'}`);
    lineas.push(`  Peticiones HTTP:         ${m.http_reqs.values.count}  (${m.http_reqs.values.rate.toFixed(1)} req/s)`);
    lineas.push(`  Iteraciones (+monitor):  ${m.iterations ? m.iterations.values.count : 0}`);
    lineas.push(`  Tasa de error HTTP:      ${pct(fallas && fallas.values.rate)}`);
    lineas.push(`  Checks exitosos:         ${pct(m.checks && m.checks.values.rate)}`);
    if (m.rs_incidentes_creados) lineas.push(`  Incidentes creados:      ${m.rs_incidentes_creados.values.count}`);
    lineas.push('');
    lineas.push('  Tiempos de respuesta        p50       p90       p95       p99       máx');
    lineas.push('  ' + '─'.repeat(74));
    if (general) lineas.push(fila('TODOS (viajeros)', general.values));
    for (const ep of ENDPOINTS) {
      const sub = m[`http_req_duration{endpoint:${ep}}`];
      if (sub && sub.values.max > 0) lineas.push(fila(ep, sub.values));
    }
    if (m.rs_duracion_flujo) lineas.push(fila('flujo (con pausas)', m.rs_duracion_flujo.values));
    lineas.push('');
    lineas.push('  Estado del servidor (muestreado por el monitor)');
    lineas.push('  ' + '─'.repeat(74));
    lineas.push(`  Memoria RSS (MB):        ${gauge(data, 'servidor_memoria_rss_mb')}`);
    lineas.push(`  Heap usado (MB):         ${gauge(data, 'servidor_heap_mb')}`);
    lineas.push(`  Cola del pool BD:        ${gauge(data, 'servidor_cola_pool')}`);
    lineas.push(`  Timeouts del pool:       ${gauge(data, 'servidor_timeouts_pool')}`);
    lineas.push(`  Lag event loop p99 (ms): ${gauge(data, 'servidor_lag_event_loop_p99_ms')}`);
    lineas.push(`  Entradas en caché:       ${gauge(data, 'servidor_entradas_cache')}`);
    lineas.push('');
    lineas.push('  Umbrales (SLO)');
    lineas.push('  ' + '─'.repeat(74));
    lineas.push(...umbrales(data));
    lineas.push('═'.repeat(78));
    lineas.push('');

    const texto = lineas.join('\n');
    const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = `resultados/${nombrePrueba}-${marca}`;
    return {
      stdout: texto,
      [`${base}.txt`]: texto,
      [`${base}.json`]: JSON.stringify(data, null, 2),
    };
  };
}
