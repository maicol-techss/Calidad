// Simulación de un pool de conexiones a base de datos.
// Solo hay `tamano` conexiones; las demás peticiones esperan en cola.
// Si la espera supera `timeoutMs`, la consulta falla (como ocurre en un motor real).

class PoolSimulado {
  constructor(tamano, timeoutMs) {
    this.tamano = tamano;
    this.timeoutMs = timeoutMs;
    this.enUso = 0;
    this.cola = [];
    this.totalTimeouts = 0;
    this.maxCola = 0;
  }

  adquirir() {
    if (this.enUso < this.tamano) {
      this.enUso++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const espera = { resolve, reject };
      espera.timer = setTimeout(() => {
        const i = this.cola.indexOf(espera);
        if (i >= 0) this.cola.splice(i, 1);
        this.totalTimeouts++;
        const err = new Error('Tiempo agotado esperando una conexión a la base de datos');
        err.status = 503;
        reject(err);
      }, this.timeoutMs);
      this.cola.push(espera);
      this.maxCola = Math.max(this.maxCola, this.cola.length);
    });
  }

  liberar() {
    const siguiente = this.cola.shift();
    if (siguiente) {
      clearTimeout(siguiente.timer);
      siguiente.resolve(); // la conexión pasa directamente al siguiente en cola
    } else {
      this.enUso--;
    }
  }

  // Ejecuta una "consulta" que tarda entre minMs y maxMs.
  async consultar(fn, minMs = 80, maxMs = 160) {
    await this.adquirir();
    try {
      const duracion = minMs + Math.random() * (maxMs - minMs);
      await new Promise((r) => setTimeout(r, duracion));
      return fn();
    } finally {
      this.liberar();
    }
  }

  estado() {
    return {
      tamano: this.tamano,
      enUso: this.enUso,
      enCola: this.cola.length,
      maxColaObservada: this.maxCola,
      timeoutsAcumulados: this.totalTimeouts,
    };
  }
}

module.exports = { PoolSimulado };
