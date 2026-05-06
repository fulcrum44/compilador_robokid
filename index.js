import express from 'express'
import cors from 'cors'
import { execFile } from 'child_process'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import rateLimit from 'express-rate-limit'

const app = express()
app.use(cors())
app.use(express.json({ limit: '500kb' }))

// por temas de seguridad, limitamos la frecuencia de peticiones a 10 por minuto desde una misma IP
const compileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas peticiones, espera un momento' },
})

// Lista de placas permitidas
const PLACAS_PERMITIDAS = [
  'esp8266:esp8266:d1',
  'esp8266:esp8266:d1_mini',
  'esp8266:esp8266:nodemcuv2',
]

// definimos un token de autenticación para el servidor, de esta manera nadie sin el token podrá acceder a este indebidamente
const API_TOKEN = process.env.API_TOKEN || 'robokid-token-2026'

function autenticar(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (token !== API_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  next()
}

function sanitizarError(stderr) {
  if (typeof stderr !== 'string') stderr = String(stderr)
  return stderr
    .replace(/\/tmp\/[a-f0-9-]+\/sketch\//g, '')
    .replace(/\/tmp\/[a-f0-9-]+\//g, '')
    .replace(/\/root\/.arduino15\//g, '')
    .replace(/\/home\/[^/]+\//g, '')
    .replace(/\/usr\/local\/[^\s]+/g, '[ruta-servidor]')
}

app.post('/compile', compileLimiter, autenticar, async (req, res) => {
  const { codigo, placa } = req.body

  // validamos que se ha enviado código al servidor
  if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
    return res.status(400).json({ error: 'No se envió código' })
  }

  // validamos que la placa especificada está entre las permitidas
  if (!PLACAS_PERMITIDAS.includes(placa)) {
    return res.status(400).json({
      error: 'Placa no permitida',
      permitidas: PLACAS_PERMITIDAS,
    })
  }

  const id = uuid()
  const carpeta = `/tmp/${id}/sketch`

  try {
    // creamos una carpeta temporal para guardar el .ino (binario para arduino)
    // hacemos la carpeta temporal para que al terminar no ocupe espacio innecesario
    fs.mkdirSync(carpeta, { recursive: true })
    fs.writeFileSync(`${carpeta}/sketch.ino`, codigo)

    // llamamos a Arduino CLI y compilamos el código recibido
    await new Promise((resolve, reject) => {
      execFile(
        'arduino-cli',
        ['compile', '--fqbn', placa, carpeta, '--output-dir', `/tmp/${id}/output`],
        { timeout: 120000 },
        (error, stdout, stderr) => {
          if (error) reject(stderr)
          else resolve(stdout)
        }
      )
    })

    // leemos el .bin (binario arduino para nuestra placa) generado y lo devolvemos al origen de la petición (app flutter)
    const bin = fs.readFileSync(`/tmp/${id}/output/sketch.ino.bin`)
    res.send(bin)
  } catch (error) {
    res.status(500).json({
      error: 'Error de compilación',
      detalle: sanitizarError(error),
    })
  } finally {
    // hacemos limpieza de ficheros temporales al terminar
    fs.rmSync(`/tmp/${id}`, { recursive: true, force: true })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`))