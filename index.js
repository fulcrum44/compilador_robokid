import express from 'express'
import cors from 'cors'
import { exec } from 'child_process'
import { v4 as uuid } from 'uuid'
import fs from 'fs'

const app = express()
app.use(cors())
app.use(express.json())

app.post('/compile', async (req, res) => {
  const { codigo, placa } = req.body
  const id = uuid()
  const carpeta = `/tmp/${id}/sketch`

  try {
    // creamos una carpeta temporal para guardar el .ino (binario para arduino)
    // hacemos la carpeta temporal para que al terminar no ocupe espacio innecesario
    fs.mkdirSync(carpeta, { recursive: true })
    fs.writeFileSync(`${carpeta}/sketch.ino`, codigo)

    // llamamos a Arduino CLI y compilamos el 
    await new Promise((resolve, reject) => {
      exec(
        `arduino-cli compile --fqbn ${placa} ${carpeta} --output-dir /tmp/${id}/output`,
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
    res.status(500).json({ error: 'Error de compilación', detalle: error })

  } finally {
    // hacemos limpieza de ficheros temporales al terminar
    fs.rmSync(`/tmp/${id}`, { recursive: true, force: true })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`))