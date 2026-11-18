// Configuración de la API. Cada valor se puede cambiar con variables de entorno
// para comparar el comportamiento "antes" y "después" de una optimización.

const bool = (valor, porDefecto) =>
  valor === undefined ? porDefecto : ['true', '1', 'si', 'sí'].includes(String(valor).toLowerCase());

module.exports = {
  puerto: parseInt(process.env.PORT || '3000', 10),

  // Conexiones simultáneas que admite la "base de datos" simulada.
  // Con 5 conexiones, las consultas se encolan rápidamente bajo carga.
  poolSize: parseInt(process.env.POOL_SIZE || '5', 10),

  // Tiempo máximo (ms) que una petición espera por una conexión libre antes de fallar con 503.
  poolTimeoutMs: parseInt(process.env.POOL_TIMEOUT_MS || '2000', 10),

  // Iteraciones del hash de contraseñas (PBKDF2). Más iteraciones = login más costoso en CPU.
  loginIteraciones: parseInt(process.env.LOGIN_ITERACIONES || '100000', 10),

  // true: la caché de búsqueda de rutas nunca libera memoria (fuga intencional).
  fugaMemoria: bool(process.env.FUGA_MEMORIA, true),

  // true: el endpoint de estadísticas reutiliza el último cálculo durante 5 s.
  cacheEstadisticas: bool(process.env.CACHE_ESTADISTICAS, false),

  // Probabilidad (0 a 1) de que el servicio externo de ETA falle.
  tasaFallaExterna: parseFloat(process.env.TASA_FALLA_EXTERNA || '0.02'),
};
