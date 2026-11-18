// Datos semilla en memoria para RutaSegura.
// Se generan de forma determinista para que todos los equipos tengan el mismo punto de partida.

const crypto = require('crypto');

const CIUDADES = [
  'Medellín', 'Bogotá', 'Cali', 'Palmira', 'Barranquilla', 'Cartagena', 'Bucaramanga',
  'Pereira', 'Manizales', 'Armenia', 'Ibagué', 'Tuluá', 'Buga', 'Rionegro', 'Santa Marta',
  'Montería', 'Neiva', 'Popayán', 'Pasto', 'Villavicencio',
];
const TIPOS_INCIDENTE = ['accidente', 'derrumbe', 'obra', 'manifestación', 'neblina', 'vía cerrada'];

// Generador pseudoaleatorio con semilla (mulberry32) para datos reproducibles.
function generador(semilla) {
  return function () {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = generador(2026);
const elegir = (arr) => arr[Math.floor(azar() * arr.length)];

const rutas = [];
for (let id = 1; id <= 200; id++) {
  let origen = elegir(CIUDADES);
  let destino = elegir(CIUDADES);
  while (destino === origen) destino = elegir(CIUDADES);
  rutas.push({
    id,
    origen,
    destino,
    distanciaKm: Math.round(40 + azar() * 900),
    peajes: Math.floor(azar() * 9),
    nivelRiesgo: elegir(['bajo', 'medio', 'alto']),
  });
}

const incidentes = [];
for (let id = 1; id <= 5000; id++) {
  incidentes.push({
    id,
    rutaId: 1 + Math.floor(azar() * rutas.length),
    tipo: elegir(TIPOS_INCIDENTE),
    severidad: 1 + Math.floor(azar() * 5),
    descripcion: 'Incidente reportado por la comunidad',
    fecha: new Date(Date.UTC(2026, 0, 1) + Math.floor(azar() * 300) * 86400000).toISOString(),
  });
}

// 50 usuarios de prueba: estudiante01 ... estudiante50, contraseña Clave123*
const usuarios = new Map();
function cargarUsuarios(iteraciones) {
  for (let i = 1; i <= 50; i++) {
    const usuario = `estudiante${String(i).padStart(2, '0')}`;
    const sal = crypto.createHash('sha256').update(usuario).digest('hex').slice(0, 16);
    const hash = crypto.pbkdf2Sync('Clave123*', sal, iteraciones, 32, 'sha256').toString('hex');
    usuarios.set(usuario, { usuario, sal, hash });
  }
}

module.exports = { rutas, incidentes, usuarios, cargarUsuarios, CIUDADES, TIPOS_INCIDENTE };
