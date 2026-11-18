# RutaSegura · Laboratorio de pruebas de carga y estrés con k6

**Asignatura:** Aseguramiento de la Calidad del Software (ASCAS12) · Unidad 4

RutaSegura es una API que permite a los viajeros consultar rutas intermunicipales de Colombia,
revisar los incidentes reportados en cada vía (derrumbes, obras, accidentes), estimar el tiempo
de viaje y reportar nuevos incidentes.

La API tiene **defectos de rendimiento intencionales**. Su trabajo es descubrirlos con k6,
sustentarlos con evidencia y comprobar el efecto de las correcciones.

---

## 1. Estructura del proyecto

```
rutasegura-k6/
├── api/                        Sistema bajo prueba (Node.js, sin dependencias externas)
│   ├── src/server.js           Endpoints de la API
│   ├── src/pool.js             Pool de conexiones a BD simulado
│   ├── src/config.js           Parámetros ajustables por variables de entorno
│   └── Dockerfile
├── k6/                         Scripts de prueba
│   ├── 00-humo.js              Prueba de humo (smoke)
│   ├── 01-carga.js             Prueba de carga (load)
│   ├── 02-estres.js            Prueba de estrés (stress)
│   ├── 03-picos.js             Prueba de picos (spike)
│   ├── 04-resistencia.js       Prueba de resistencia (soak)
│   ├── 05-punto-quiebre.js     Prueba de punto de quiebre (breakpoint)
│   ├── 06-reto-estudiante.js   Plantilla para completar (entrega)
│   ├── lib/config.js           URL base y SLO
│   ├── lib/flujo.js            Flujo de usuario y métricas personalizadas
│   ├── lib/resumen.js          Resumen en español y exportación de evidencia
│   └── data/usuarios.json      50 usuarios de prueba
├── resultados/                 Aquí se guardan los .txt y .json de cada ejecución
├── grafana/                    Configuración opcional de Grafana
└── docker-compose.yml
```

## 2. Requisitos

Elija **una** de las dos opciones:

| Opción | Necesita |
|---|---|
| A. Local | Node.js 18 o superior y k6 1.x ([instalación](https://grafana.com/docs/k6/latest/set-up/install-k6/)) |
| B. Docker | Docker Desktop o Docker Engine con Compose v2 |

Instalación rápida de k6:

```bash
# Windows
winget install k6 --source winget
# macOS
brew install k6
# Debian / Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## 3. Puesta en marcha

### Opción A · Local

```bash
# Terminal 1: la API (no requiere npm install)
cd api
node src/server.js

# Terminal 2: las pruebas, SIEMPRE desde la raíz del proyecto
k6 run k6/00-humo.js
```

### Opción B · Docker

```bash
docker compose up -d --build api
docker compose run --rm k6 run k6/00-humo.js
```

En Docker la API tiene un límite de **1 CPU y 512 MB**, de modo que los resultados son comparables
entre equipos. En la opción local depende del computador: registre sus especificaciones en el taller.

> **Importante:** ejecute las pruebas desde la raíz del proyecto para que la evidencia quede en `resultados/`.

## 4. Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/salud` | Estado del servicio |
| POST | `/auth/login` | Inicio de sesión. Cuerpo: `{"usuario":"estudiante01","clave":"Clave123*"}` |
| GET | `/rutas?origen=&destino=&pagina=` | Búsqueda de rutas (20 por página) |
| GET | `/rutas/:id` | Detalle de una ruta |
| GET | `/rutas/:id/incidentes` | Últimos 50 incidentes de la ruta (consulta a BD) |
| GET | `/rutas/:id/eta` | Tiempo estimado de viaje (servicio externo) |
| POST | `/incidentes` | Reportar incidente. Requiere `Authorization: Bearer <token>` |
| GET | `/reportes/estadisticas` | Reporte agregado de incidentes |
| GET | `/metricas` | Memoria, cola del pool, retraso del event loop, configuración |
| POST | `/metricas/reiniciar` | Reinicia los contadores de `/metricas` |

Usuarios de prueba: `estudiante01` a `estudiante50`, clave `Clave123*`.

## 5. Tipos de prueba incluidos

| Script | Tipo | Pregunta que responde | Duración |
|---|---|---|---|
| `00-humo.js` | Humo | ¿El script y la API funcionan? | 30 s |
| `01-carga.js` | Carga | ¿Se cumplen los SLO con la carga esperada (20 usuarios)? | 4,5 min |
| `02-estres.js` | Estrés | ¿Cómo se degrada por encima de lo normal y se recupera? | 10 min |
| `03-picos.js` | Picos | ¿Sobrevive a un aumento súbito de usuarios? | 4,5 min |
| `04-resistencia.js` | Resistencia | ¿Aparecen problemas con el tiempo (memoria)? | 10 min |
| `05-punto-quiebre.js` | Punto de quiebre | ¿Cuál es la capacidad máxima? | hasta 10 min |

Todos aceptan parámetros con `-e`, por ejemplo:

```bash
k6 run -e VUS=40 -e SOSTENER=2m k6/01-carga.js
k6 run -e MAX=200 k6/02-estres.js
k6 run -e DURACION=20m k6/04-resistencia.js
k6 run -e BASE_URL=http://192.168.1.50:3000 k6/01-carga.js   # API en otro equipo
```

## 6. SLO (objetivos de nivel de servicio)

Definidos en `k6/lib/config.js`:

| Métrica | Objetivo |
|---|---|
| Tasa de error HTTP | < 1 % |
| Tiempo de respuesta global | p95 < 800 ms y p99 < 1500 ms |
| Checks funcionales | > 99 % |
| Login | p95 < 1000 ms |
| Búsqueda de rutas | p95 < 300 ms |
| Detalle de ruta | p95 < 200 ms |
| Incidentes de ruta | p95 < 500 ms |
| ETA | p95 < 1000 ms |
| Reportar incidente | p95 < 800 ms |
| Estadísticas | p95 < 1500 ms |

## 7. Evidencia y visualización

Cada ejecución deja en `resultados/` un `.txt` (resumen legible) y un `.json` (datos completos).

**Panel web de k6 (recomendado, no requiere nada adicional):**

```bash
# Local: panel en vivo en http://localhost:5665 y reporte HTML al terminar
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=resultados/carga.html k6 run k6/01-carga.js

# Windows PowerShell
$env:K6_WEB_DASHBOARD="true"; $env:K6_WEB_DASHBOARD_EXPORT="resultados/carga.html"; k6 run k6/01-carga.js

# Docker
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=resultados/carga.html docker compose run --rm --service-ports k6 run k6/01-carga.js
```

**Grafana + InfluxDB (opcional):**

```bash
docker compose --profile monitoreo up -d
docker compose run --rm -e K6_OUT=influxdb=http://influxdb:8086/k6 k6 run k6/01-carga.js
```

Abra http://localhost:3001 → *Dashboards → New → Import* → ID **2587** → fuente de datos **k6**.

**Observar el servidor durante la prueba:** abra otra terminal y consulte `/metricas`:

```bash
curl http://localhost:3000/metricas
```

## 8. Parámetros de la API (para comparar antes y después)

| Variable | Valor por defecto | Efecto |
|---|---|---|
| `POOL_SIZE` | 5 | Conexiones simultáneas a la BD simulada |
| `POOL_TIMEOUT_MS` | 2000 | Espera máxima por una conexión antes de responder 503 |
| `LOGIN_ITERACIONES` | 100000 | Costo de CPU del login |
| `FUGA_MEMORIA` | true | La caché de búsqueda nunca libera memoria |
| `CACHE_ESTADISTICAS` | false | Reutilizar el reporte de estadísticas durante 5 s |
| `TASA_FALLA_EXTERNA` | 0.02 | Probabilidad de falla del proveedor de ETA |

```bash
# Local (Linux/macOS)
POOL_SIZE=20 FUGA_MEMORIA=false CACHE_ESTADISTICAS=true node src/server.js
# Local (Windows PowerShell)
$env:POOL_SIZE="20"; $env:FUGA_MEMORIA="false"; $env:CACHE_ESTADISTICAS="true"; node src/server.js
# Docker
POOL_SIZE=20 FUGA_MEMORIA=false CACHE_ESTADISTICAS=true docker compose up -d api
```

## 9. Buenas prácticas durante el laboratorio

- Ejecute siempre la prueba de humo antes de cualquier otra.
- Reinicie la API entre pruebas para que cada una parta del mismo estado.
- No ejecute pruebas de carga contra servicios que no le pertenecen: solo contra su API local.
- Cierre aplicaciones pesadas: el generador de carga (k6) y la API compiten por la misma CPU.
- Cambie **una sola variable** a la vez cuando compare resultados.
