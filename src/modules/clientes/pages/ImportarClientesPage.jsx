import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import {
  COLUMNAS_INFO,
  cargarReferencias,
  esArchivoCsv,
  generarCsvRechazadas,
  generarPlantillaCsv,
  importarClientes,
  normalizarEncabezado,
  obtenerCatalogos,
  problemaDeColumnas,
  puedeImportarClientes,
  quitarLineaSep,
  validarFilas,
} from '../api/importacionClientesApi'
import { generarPlantillaExcel } from '../api/plantillaExcel'
import Button from '../../../components/ui/Button'
import EmptyState from '../../../components/ui/EmptyState'
import Feedback from '../../../components/ui/Feedback'

// La vista previa dibuja como máximo estas filas: con una base legacy de miles
// de clientes, renderizarlas todas congelaría la pantalla. El conteo y la
// importación siempre consideran el archivo completo.
const MAX_FILAS_VISIBLES = 200

const ETIQUETAS_ESTADO = {
  nueva: '✔ Nueva',
  duplicada: '⚠ Duplicada',
  error: '✖ Con error',
}

const CUANDO_SE_COMPLETA = {
  obligatoria: 'Siempre',
  segun_persona: 'Según el tipo de persona',
  opcional: 'Opcional',
}

// El CSS global de las tablas usa white-space: nowrap y columnas fijas: un
// texto largo se sale de su celda y se pisa con la siguiente. Estas celdas
// dejan que el texto baje de renglón.
// Además renderiza thead y tbody como tablas separadas, así que el ancho de
// cada columna se define igual en el encabezado y en las celdas de cada fila
// (si no, el encabezado y los datos quedan desalineados).
const ANCHOS_AYUDA = ['18%', '18%', '46%', '18%']
const ANCHOS_PREVIA = ['7%', '14%', '17%', '24%', '38%']
const ancho = (anchos, indice) => ({ width: anchos[indice] })
const celdaAjustada = (anchos, indice) => ({ ...ancho(anchos, indice), whiteSpace: 'normal' })

function descargarCsv(nombreArchivo, contenido) {
  // El BOM hace que Excel abra el archivo en UTF-8 y respete las tildes.
  descargarArchivo(
    nombreArchivo,
    new Blob(['\uFEFF', contenido], { type: 'text/csv;charset=utf-8' }),
  )
}

function descargarArchivo(nombreArchivo, blob) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

function nombreDelCliente(datos) {
  if (datos.tipo_persona === 'juridica') return datos.razon_social
  return [datos.apellido, datos.nombre].filter(Boolean).join(', ')
}

function ImportarClientesPage() {
  // null = todavía verificando, true/false = resultado del permiso.
  const [tienePermiso, setTienePermiso] = useState(null)
  const [errorPermiso, setErrorPermiso] = useState('')

  const [paso, setPaso] = useState('subir')
  const [resultados, setResultados] = useState([])
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [resumen, setResumen] = useState(null)

  const [catalogos, setCatalogos] = useState(null)
  const [errorCatalogos, setErrorCatalogos] = useState('')

  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    let activo = true

    puedeImportarClientes()
      .then((habilitado) => {
        if (activo) setTienePermiso(habilitado)
      })
      .catch((err) => {
        if (!activo) return
        setErrorPermiso(err.message || 'error desconocido')
        setTienePermiso(false)
      })

    return () => {
      activo = false
    }
  }, [])

  // Las opciones válidas de condicion_iva y tipo_cliente salen de la base: se
  // muestran en la ayuda y alimentan los desplegables de la plantilla Excel.
  useEffect(() => {
    if (!tienePermiso) return undefined
    let activo = true

    obtenerCatalogos()
      .then((datos) => {
        if (activo) setCatalogos(datos)
      })
      .catch((err) => {
        if (activo) setErrorCatalogos(err.message || 'error desconocido')
      })

    return () => {
      activo = false
    }
  }, [tienePermiso])

  function reiniciar() {
    setPaso('subir')
    setResultados([])
    setFiltroEstado('todas')
    setResumen(null)
    setError('')
  }

  function descargarPlantillaExcel() {
    descargarArchivo('plantilla_clientes.xlsx', generarPlantillaExcel(catalogos))
  }

  function descargarPlantillaCsv() {
    descargarCsv('plantilla_clientes.csv', generarPlantillaCsv())
  }

  function descargarRechazadas() {
    descargarCsv('clientes_rechazados.csv', generarCsvRechazadas(resultados))
  }

  async function procesarArchivo(filas) {
    try {
      const referencias = await cargarReferencias(filas)
      setResultados(validarFilas(filas, referencias))
      setFiltroEstado('todas')
      setPaso('vista-previa')
    } catch (err) {
      setError(err.message || 'No se pudo preparar la vista previa')
    } finally {
      setProcesando(false)
    }
  }

  function manejarArchivo(event) {
    const archivo = event.target.files?.[0]
    // Permite volver a elegir el mismo archivo después de corregirlo.
    event.target.value = ''
    if (!archivo) return

    setError('')

    // CA-02: se rechaza antes de procesar nada.
    if (!esArchivoCsv(archivo.name)) {
      setError(
        'El archivo no es un CSV. Completá la plantilla y guardala desde Excel como «CSV UTF-8 (delimitado por comas)».',
      )
      return
    }

    setProcesando(true)
    Papa.parse(archivo, {
      header: true,
      skipEmptyLines: 'greedy',
      // Excel en español separa con ";" y las plantillas empiezan con "sep=;".
      delimitersToGuess: [';', ',', '\t'],
      beforeFirstChunk: quitarLineaSep,
      transformHeader: normalizarEncabezado,
      complete: ({ data, meta }) => {
        const problema = problemaDeColumnas(meta.fields)
        if (problema) {
          setError(problema)
          setProcesando(false)
          return
        }
        if (data.length === 0) {
          setError('El archivo no tiene filas para importar.')
          setProcesando(false)
          return
        }
        procesarArchivo(data)
      },
      error: (err) => {
        setError(`No se pudo leer el archivo: ${err.message || 'error desconocido'}.`)
        setProcesando(false)
      },
    })
  }

  const nuevas = resultados.filter((r) => r.estado === 'nueva')
  const duplicadas = resultados.filter((r) => r.estado === 'duplicada')
  const conError = resultados.filter((r) => r.estado === 'error')

  async function confirmarImportacion() {
    setImportando(true)
    setError('')

    try {
      const respuesta = await importarClientes(nuevas.map((r) => r.datos))
      // El resumen suma lo que ya se descartó en la vista previa con lo que la
      // base pudo descartar al confirmar (por ejemplo, un cliente cargado por
      // otra persona mientras se revisaba la vista previa).
      setResumen({
        importadas: respuesta.importadas,
        duplicadas: duplicadas.length + respuesta.duplicadas,
        conError: conError.length + respuesta.conError,
      })
      setPaso('resultado')
    } catch (err) {
      // CA-05: la importación es todo o nada, así que acá no se cargó nada.
      setError(err.message || 'No se pudo completar la importación. No se importó ninguna fila.')
    } finally {
      setImportando(false)
    }
  }

  const filasFiltradas =
    filtroEstado === 'todas' ? resultados : resultados.filter((r) => r.estado === filtroEstado)
  const filasVisibles = filasFiltradas.slice(0, MAX_FILAS_VISIBLES)

  if (tienePermiso === null) {
    return (
      <main>
        <h1>Importar clientes</h1>
        <p className="loading-state" role="status">
          Verificando permisos…
        </p>
      </main>
    )
  }

  // CA-07
  if (!tienePermiso) {
    return (
      <main>
        <h1>Importar clientes</h1>
        <EmptyState
          title="Sin permiso"
          description={
            errorPermiso
              ? `No se pudo verificar tu permiso (${errorPermiso}).`
              : 'Para importar clientes necesitás el permiso «clientes.importar».'
          }
        />
      </main>
    )
  }

  return (
    <main>
      <h1>Importar clientes</h1>

      {error && <Feedback tone="error">{error}</Feedback>}

      {paso === 'subir' && (
        <>
          <section>
            <h2>1. Descargá la plantilla</h2>
            <p>
              La plantilla de Excel ya viene con las columnas separadas y con listas
              desplegables: en tipo_persona, tipo_documento, condicion_iva, tipo_cliente y
              habilita_cta_cte elegís la opción de una lista, y no se puede escribir otra. Los
              encabezados azules son obligatorios, los naranjas dependen del tipo de persona
              y los grises son opcionales.
            </p>
            <div>
              <Button
                type="button"
                onClick={descargarPlantillaExcel}
                disabled={!catalogos}
              >
                Descargar plantilla Excel
              </Button>
            </div>
            <p>
              ¿No podés usar Excel?{' '}
              <Button type="button" variant="ghost" onClick={descargarPlantillaCsv}>
                Descargá la versión CSV
              </Button>
            </p>
            {!catalogos && !errorCatalogos && (
              <p className="loading-state" role="status">
                Cargando las opciones de la plantilla…
              </p>
            )}
            {errorCatalogos && (
              <Feedback tone="warning">
                No se pudieron cargar las opciones de condición de IVA y tipo de cliente (
                {errorCatalogos}). Sin ellas no se puede armar la plantilla de Excel; podés usar
                la plantilla CSV.
              </Feedback>
            )}
          </section>

          <section>
            <h2>2. Completala</h2>
            <p>Una fila por cliente. Qué poner en cada columna:</p>
            <table>
              <thead>
                <tr>
                  <th style={ancho(ANCHOS_AYUDA, 0)}>Columna</th>
                  <th style={ancho(ANCHOS_AYUDA, 1)}>Cuándo se completa</th>
                  <th style={ancho(ANCHOS_AYUDA, 2)}>Qué poner</th>
                  <th style={ancho(ANCHOS_AYUDA, 3)}>Ejemplo</th>
                </tr>
              </thead>
              <tbody>
                {COLUMNAS_INFO.map((info) => (
                  <tr key={info.nombre}>
                    <td style={celdaAjustada(ANCHOS_AYUDA, 0)}>
                      <strong>{info.nombre}</strong>
                    </td>
                    <td style={celdaAjustada(ANCHOS_AYUDA, 1)}>{CUANDO_SE_COMPLETA[info.tipo]}</td>
                    <td style={celdaAjustada(ANCHOS_AYUDA, 2)}>
                      {info.ayuda}
                      {info.lista === 'condicion_iva' && catalogos && (
                        <> Opciones: {catalogos.condicionesIva.join(', ')}.</>
                      )}
                      {info.lista === 'tipo_cliente' && catalogos && (
                        <> Opciones: {catalogos.tiposCliente.join(', ')}.</>
                      )}
                    </td>
                    <td style={celdaAjustada(ANCHOS_AYUDA, 3)}>{info.ejemplo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>3. Guardala como CSV</h2>
            <p>
              En Excel: <strong>Archivo → Guardar como</strong> y elegí{' '}
              <strong>CSV UTF-8 (delimitado por comas)</strong>. Excel avisa que solo guarda la
              primera hoja: es lo correcto.
            </p>
          </section>

          <section>
            <h2>4. Subí el archivo</h2>
            <div>
              <label htmlFor="archivo-csv">Archivo CSV</label>
              <input
                id="archivo-csv"
                type="file"
                accept=".csv,text/csv"
                onChange={manejarArchivo}
                disabled={procesando}
              />
            </div>
            {procesando && (
              <p className="loading-state" role="status">
                Procesando archivo…
              </p>
            )}
          </section>
        </>
      )}

      {paso === 'vista-previa' && (
        <section>
          <h2>Vista previa</h2>
          <p>
            {resultados.length} filas: <strong>{nuevas.length} nuevas</strong>,{' '}
            <strong>{duplicadas.length} duplicadas</strong> (el documento ya existe),{' '}
            <strong>{conError.length} con error</strong>. Al confirmar se importan solo las
            nuevas.
          </p>

          <div>
            <label htmlFor="filtro-estado">Mostrar</label>
            <select
              id="filtro-estado"
              value={filtroEstado}
              onChange={(event) => setFiltroEstado(event.target.value)}
            >
              <option value="todas">Todas</option>
              <option value="nueva">Nuevas</option>
              <option value="duplicada">Duplicadas</option>
              <option value="error">Con error</option>
            </select>
          </div>

          {filasVisibles.length === 0 ? (
            <EmptyState
              title="No hay filas para mostrar"
              description="Ninguna fila tiene ese estado."
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={ancho(ANCHOS_PREVIA, 0)}>Fila</th>
                  <th style={ancho(ANCHOS_PREVIA, 1)}>Estado</th>
                  <th style={ancho(ANCHOS_PREVIA, 2)}>Documento</th>
                  <th style={ancho(ANCHOS_PREVIA, 3)}>Cliente</th>
                  <th style={ancho(ANCHOS_PREVIA, 4)}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((r) => (
                  <tr key={r.numeroFila}>
                    <td style={celdaAjustada(ANCHOS_PREVIA, 0)}>{r.numeroFila}</td>
                    <td style={celdaAjustada(ANCHOS_PREVIA, 1)}>
                      <strong>{ETIQUETAS_ESTADO[r.estado]}</strong>
                    </td>
                    <td style={celdaAjustada(ANCHOS_PREVIA, 2)}>
                      {r.datos.tipo_documento} {r.datos.numero_documento}
                    </td>
                    <td style={celdaAjustada(ANCHOS_PREVIA, 3)}>{nombreDelCliente(r.datos)}</td>
                    <td style={celdaAjustada(ANCHOS_PREVIA, 4)}>{r.motivo ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filasFiltradas.length > MAX_FILAS_VISIBLES && (
            <p>
              Se muestran las primeras {MAX_FILAS_VISIBLES} de {filasFiltradas.length} filas.
              La importación considera todas.
            </p>
          )}

          <div>
            <Button
              type="button"
              onClick={confirmarImportacion}
              loading={importando}
              loadingLabel="Importando…"
              disabled={nuevas.length === 0}
            >
              Confirmar importación ({nuevas.length})
            </Button>
            <Button type="button" variant="ghost" onClick={reiniciar} disabled={importando}>
              Cancelar
            </Button>
          </div>
          {nuevas.length === 0 && <p>No hay filas nuevas para importar.</p>}
        </section>
      )}

      {paso === 'resultado' && resumen && (
        <section>
          <h2>Importación finalizada</h2>
          <Feedback tone="success">
            Se importaron {resumen.importadas} clientes.
          </Feedback>
          <ul>
            <li>Importadas: {resumen.importadas}</li>
            <li>Duplicadas: {resumen.duplicadas}</li>
            <li>Con error: {resumen.conError}</li>
          </ul>

          <div>
            {duplicadas.length + conError.length > 0 && (
              <Button type="button" variant="ghost" onClick={descargarRechazadas}>
                Descargar filas rechazadas (CSV)
              </Button>
            )}
            <Button type="button" onClick={reiniciar}>
              Importar otro archivo
            </Button>
          </div>
        </section>
      )}
    </main>
  )
}

export default ImportarClientesPage
