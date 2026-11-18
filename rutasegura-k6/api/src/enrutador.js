// Enrutador mínimo sobre el módulo nativo `http` de Node.js.
// Evita dependencias externas: el proyecto corre con `node src/server.js` sin `npm install`.
// Ofrece una interfaz parecida a Express: app.get(ruta, manejador), req.params, req.query,
// req.body, res.status(...).json(...).

const LIMITE_CUERPO = 50 * 1024; // 50 KB

class Enrutador {
  constructor() {
    this.rutas = [];
  }

  registrar(metodo, patron, manejador) {
    const nombres = [];
    const regex = new RegExp(
      '^' +
        patron.replace(/:([a-zA-Z]+)/g, (_, nombre) => {
          nombres.push(nombre);
          return '([^/]+)';
        }) +
        '/?$'
    );
    this.rutas.push({ metodo, regex, nombres, manejador });
  }

  get(patron, manejador) {
    this.registrar('GET', patron, manejador);
  }

  post(patron, manejador) {
    this.registrar('POST', patron, manejador);
  }

  async atender(req, res) {
    extenderRespuesta(res);
    const url = new URL(req.url, 'http://localhost');
    req.query = Object.fromEntries(url.searchParams);

    for (const ruta of this.rutas) {
      if (ruta.metodo !== req.method) continue;
      const coincidencia = url.pathname.match(ruta.regex);
      if (!coincidencia) continue;
      req.params = {};
      ruta.nombres.forEach((n, i) => (req.params[n] = decodeURIComponent(coincidencia[i + 1])));
      try {
        req.body = req.method === 'POST' ? await leerCuerpo(req) : {};
        await ruta.manejador(req, res);
      } catch (err) {
        if (!res.headersSent) res.status(err.status || 500).json({ error: err.message || 'Error interno' });
      }
      return;
    }
    res.status(404).json({ error: 'Recurso no encontrado' });
  }
}

function extenderRespuesta(res) {
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (objeto) => {
    const cuerpo = JSON.stringify(objeto);
    res.writeHead(res.statusCode || 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(cuerpo),
    });
    res.end(cuerpo);
  };
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (fragmento) => {
      datos += fragmento;
      if (datos.length > LIMITE_CUERPO) {
        const err = new Error('El cuerpo de la petición supera 50 KB');
        err.status = 413;
        reject(err);
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!datos) return resolve({});
      try {
        resolve(JSON.parse(datos));
      } catch {
        const err = new Error('El cuerpo no es un JSON válido');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = { Enrutador };
