// RutaSegura API — sistema bajo prueba (SUT) para la práctica de carga y estrés con k6.
//
// La API tiene defectos de rendimiento INTENCIONALES. El objetivo del taller es
// detectarlos con k6, explicarlos con evidencia y verificar el efecto de las mejoras.
//
//   Endpoint                         Comportamiento bajo carga
//   -------------------------------  ---------------------------------------------------
//   POST /auth/login                 Hash PBKDF2 síncrono: bloquea el event loop (CPU)
//   GET  /rutas                      Rápido, pero su caché tiene una fuga de memoria
//   GET  /rutas/:id                  Rápido (lectura en memoria)
//   GET  /rutas/:id/incidentes       Usa el pool de BD (5 conexiones): se encola
//   POST /incidentes                 Usa el pool de BD; aumenta el volumen de datos
//   GET  /rutas/:id/eta              Servicio externo con latencia variable y fallas
//   GET  /reportes/estadisticas      Agregación pesada en CPU; empeora con más datos
//   GET  /salud, GET /metricas       Observabilidad del servidor

const http = require('http');
const crypto = require('crypto');
const { createHistogram, performance } = require('perf_hooks');
const config = require('./config');
const { PoolSimulado } = require('./pool');
const { Enrutador } = require('./enrutador');
const { rutas, incidentes, usuarios, cargarUsuarios, TIPOS_INCIDENTE } = require('./datos');

const app = new Enrutador();
const pool = new PoolSimulado(config.poolSize, config.poolTimeoutMs);
const sesiones = new Map(); // token -> usuario
const inicio = Date.now();
// Medición del retraso del event loop: se programa un temporizador cada 50 ms y se registra
// cuánto se atrasa. Si el hilo principal está ocupado (CPU), el atraso crece.
const lagEventLoop = createHistogram();
let ultimoTic = performance.now();
setInterval(() => {
  const ahora = performance.now();
  const atrasoUs = Math.max(1, Math.round((ahora - ultimoTic - 50) * 1000));
  lagEventLoop.record(atrasoUs);
  ultimoTic = ahora;
}, 50).unref();
let peticionesAtendidas = 0;

// ---------------------------------------------------------------- utilidades

function autenticar(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !sesiones.has(token)) {
    res.status(401).json({ error: 'Token ausente o inválido' });
    return false;
  }
  req.usuario = sesiones.get(token);
  return true;
}

function buscarRuta(req, res) {
  const id = parseInt(req.params.id, 10);
  const ruta = rutas.find((r) => r.id === id);
  if (!ruta) res.status(404).json({ error: `La ruta ${req.params.id} no existe` });
  return ruta;
}

// ---------------------------------------------------------------- endpoints

app.get('/salud', (req, res) => {
  res.json({ estado: 'ok', uptimeSeg: Math.round((Date.now() - inicio) / 1000) });
});

app.post('/auth/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  if (!usuario || !clave) {
    return res.status(400).json({ error: 'usuario y clave son obligatorios' });
  }
  const registro = usuarios.get(usuario);
  if (!registro) return res.status(401).json({ error: 'Credenciales inválidas' });

  // DEFECTO INTENCIONAL: pbkdf2Sync bloquea el hilo principal de Node.js.
  // Mientras se calcula, ninguna otra petición puede ser atendida.
  const hash = crypto
    .pbkdf2Sync(String(clave), registro.sal, config.loginIteraciones, 32, 'sha256')
    .toString('hex');

  if (hash !== registro.hash) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = crypto.randomBytes(24).toString('hex');
  sesiones.set(token, usuario);
  res.json({ token, usuario, expiraEnSeg: 3600 });
});

// Caché de búsqueda. Con FUGA_MEMORIA=true nunca se libera (fuga intencional).
const cacheBusqueda = new Map();
const LIMITE_CACHE = 200;

app.get('/rutas', (req, res) => {
  const origen = (req.query.origen || '').toLowerCase();
  const destino = (req.query.destino || '').toLowerCase();
  const clave = `${origen}|${destino}|${req.query.pagina || 1}`;

  if (cacheBusqueda.has(clave)) {
    return res.json(cacheBusqueda.get(clave).respuesta);
  }

  const pagina = Math.max(1, parseInt(req.query.pagina || '1', 10));
  const filtradas = rutas.filter(
    (r) =>
      (!origen || r.origen.toLowerCase().includes(origen)) &&
      (!destino || r.destino.toLowerCase().includes(destino))
  );
  const respuesta = {
    total: filtradas.length,
    pagina,
    resultados: filtradas.slice((pagina - 1) * 20, pagina * 20),
  };

  // Cada entrada guarda además un "historial de consulta" de ~50 KB en el heap.
  const historial = new Array(6400).fill(clave.length);
  cacheBusqueda.set(clave, { respuesta, historial });

  if (!config.fugaMemoria && cacheBusqueda.size > LIMITE_CACHE) {
    // Corrección: se elimina la entrada más antigua (política FIFO sencilla).
    cacheBusqueda.delete(cacheBusqueda.keys().next().value);
  }
  res.json(respuesta);
});

app.get('/rutas/:id', (req, res) => {
  const ruta = buscarRuta(req, res);
  if (ruta) res.json(ruta);
});

app.get('/rutas/:id/incidentes', async (req, res) => {
  {
    const ruta = buscarRuta(req, res);
    if (!ruta) return;
    const lista = await pool.consultar(() =>
      incidentes.filter((i) => i.rutaId === ruta.id).slice(-50)
    );
    res.json({ rutaId: ruta.id, total: lista.length, incidentes: lista });
  }
});

app.post('/incidentes', async (req, res) => {
  if (!autenticar(req, res)) return;
  {
    const { rutaId, tipo, severidad, descripcion } = req.body || {};
    const errores = [];
    if (!rutas.some((r) => r.id === rutaId)) errores.push('rutaId no existe');
    if (!TIPOS_INCIDENTE.includes(tipo)) errores.push(`tipo debe ser uno de: ${TIPOS_INCIDENTE.join(', ')}`);
    if (!Number.isInteger(severidad) || severidad < 1 || severidad > 5) errores.push('severidad debe ser un entero entre 1 y 5');
    if (errores.length) return res.status(422).json({ errores });

    const nuevo = await pool.consultar(
      () => {
        const registro = {
          id: incidentes.length + 1,
          rutaId,
          tipo,
          severidad,
          descripcion: String(descripcion || '').slice(0, 280),
          reportadoPor: req.usuario,
          fecha: new Date().toISOString(),
        };
        incidentes.push(registro);
        return registro;
      },
      100,
      200
    );
    res.status(201).json(nuevo);
  }
});

app.get('/rutas/:id/eta', async (req, res) => {
  const ruta = buscarRuta(req, res);
  if (!ruta) return;
  // Servicio externo de tráfico: latencia entre 100 y 400 ms, con cola larga ocasional.
  const lento = Math.random() < 0.08; // 8 % de respuestas con latencia alta (cola larga)
  const latencia = lento ? 1200 + Math.random() * 800 : 100 + Math.random() * 300;
  await new Promise((r) => setTimeout(r, latencia));
  if (Math.random() < config.tasaFallaExterna) {
    return res.status(502).json({ error: 'El proveedor de tráfico no respondió' });
  }
  const minutos = Math.round((ruta.distanciaKm / (55 + Math.random() * 20)) * 60);
  res.json({ rutaId: ruta.id, etaMinutos: minutos, fuente: 'proveedor-trafico' });
});

let ultimoReporte = null;
app.get('/reportes/estadisticas', (req, res) => {
  if (config.cacheEstadisticas && ultimoReporte && Date.now() - ultimoReporte.generado < 5000) {
    return res.json({ ...ultimoReporte.datos, desdeCache: true });
  }

  // DEFECTO INTENCIONAL: agregación ineficiente O(rutas × incidentes) en el hilo principal.
  const porRuta = rutas.map((ruta) => {
    const propios = incidentes.filter((i) => i.rutaId === ruta.id);
    const severidades = propios.map((i) => i.severidad).sort((a, b) => a - b);
    const promedio = severidades.reduce((s, v) => s + v, 0) / (severidades.length || 1);
    return {
      rutaId: ruta.id,
      total: propios.length,
      severidadPromedio: Number(promedio.toFixed(2)),
      severidadMediana: severidades[Math.floor(severidades.length / 2)] || 0,
    };
  });
  // Cruce ruta × tipo: recorre todos los incidentes por cada combinación.
  const porTipo = {};
  const matrizRutaTipo = [];
  for (const tipo of TIPOS_INCIDENTE) {
    porTipo[tipo] = incidentes.filter((i) => i.tipo === tipo).length;
    for (const ruta of rutas) {
      const n = incidentes.filter((i) => i.rutaId === ruta.id && i.tipo === tipo).length;
      if (n > 0) matrizRutaTipo.push({ rutaId: ruta.id, tipo, total: n });
    }
  }
  const datos = {
    totalIncidentes: incidentes.length,
    porTipo,
    top10Rutas: porRuta.sort((a, b) => b.total - a.total).slice(0, 10),
    top10RutaTipo: matrizRutaTipo.sort((a, b) => b.total - a.total).slice(0, 10),
  };
  ultimoReporte = { generado: Date.now(), datos };
  res.json(datos);
});

app.get('/metricas', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    peticionesAtendidas,
    memoriaMB: {
      rss: Math.round(mem.rss / 1048576),
      heapUsado: Math.round(mem.heapUsed / 1048576),
      externa: Math.round(mem.external / 1048576),
    },
    eventLoopLagMs: {
      p50: Number((lagEventLoop.percentile(50) / 1000).toFixed(1)),
      p99: Number((lagEventLoop.percentile(99) / 1000).toFixed(1)),
      max: Number((lagEventLoop.max / 1000).toFixed(1)),
    },
    poolBD: pool.estado(),
    entradasCacheBusqueda: cacheBusqueda.size,
    totalIncidentes: incidentes.length,
    sesionesActivas: sesiones.size,
    configuracion: config,
  });
});

app.post('/metricas/reiniciar', (req, res) => {
  lagEventLoop.reset();
  pool.maxCola = 0;
  pool.totalTimeouts = 0;
  res.json({ ok: true });
});

// ---------------------------------------------------------------- arranque

cargarUsuarios(config.loginIteraciones);
http
  .createServer((req, res) => {
    peticionesAtendidas++;
    app.atender(req, res);
  })
  .listen(config.puerto, () => {
    console.log(`RutaSegura API escuchando en http://localhost:${config.puerto}`);
    console.log('Configuración activa:', JSON.stringify(config));
  });
