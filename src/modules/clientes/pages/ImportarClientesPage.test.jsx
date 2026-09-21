import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImportarClientesPage from './ImportarClientesPage'
import {
  cargarReferencias,
  importarClientes,
  obtenerCatalogos,
  puedeImportarClientes,
} from '../api/importacionClientesApi'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

// Se mockea solo lo que toca la red; validarFilas, la plantilla y el resto de
// la lógica pura corren de verdad.
vi.mock('../api/importacionClientesApi', async (importOriginal) => ({
  ...(await importOriginal()),
  puedeImportarClientes: vi.fn(),
  obtenerCatalogos: vi.fn(),
  cargarReferencias: vi.fn(),
  importarClientes: vi.fn(),
}))

const ENCABEZADO =
  'tipo_persona,nombre,apellido,razon_social,tipo_documento,numero_documento,condicion_iva,tipo_cliente,email,telefono,habilita_cta_cte'

const CSV_MIXTO = [
  ENCABEZADO,
  'fisica,Ana,López,,DNI,27111001,Monotributo,Consumidor Final,ana@example.com,3874100001,no',
  'fisica,Juan,Pérez,,DNI,30111222,Consumidor Final,Consumidor Final,,3874000002,no',
  'juridica,,,Marmolería Norte SRL,CUIT,3071234,Responsable Inscripto,Empresa constructora,,3874200006,no',
].join('\n')

const referencias = {
  existentes: new Set(['DNI:30111222']),
  condicionesIva: new Set(['monotributo', 'consumidor final', 'responsable inscripto']),
  tiposCliente: new Set(['consumidor final', 'empresa constructora']),
}

const catalogos = {
  condicionesIva: ['Consumidor Final', 'Exento', 'Monotributo', 'Responsable Inscripto'],
  tiposCliente: ['Consumidor Final', 'Consumidor web', 'Empresa constructora'],
}

function subirArchivo(contenido, nombre = 'clientes.csv') {
  const input = screen.getByLabelText('Archivo CSV')
  const archivo = new File([contenido], nombre, { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [archivo] } })
}

describe('ImportarClientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeImportarClientes.mockResolvedValue(true)
    obtenerCatalogos.mockResolvedValue(catalogos)
    cargarReferencias.mockResolvedValue(referencias)
    URL.createObjectURL = vi.fn(() => 'blob:prueba')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('permiso', () => {
    it('muestra "Sin permiso" y no deja subir archivos si falta clientes.importar', async () => {
      puedeImportarClientes.mockResolvedValue(false)

      render(<ImportarClientesPage />)

      expect(await screen.findByText('Sin permiso')).toBeInTheDocument()
      expect(screen.queryByLabelText('Archivo CSV')).not.toBeInTheDocument()
      expect(screen.queryByText('Descargar plantilla Excel')).not.toBeInTheDocument()
      expect(obtenerCatalogos).not.toHaveBeenCalled()
    })

    it('también bloquea si no se pudo verificar el permiso', async () => {
      puedeImportarClientes.mockRejectedValue(new Error('sin conexión'))

      render(<ImportarClientesPage />)

      expect(await screen.findByText('Sin permiso')).toBeInTheDocument()
      expect(screen.getByText(/sin conexión/)).toBeInTheDocument()
      expect(screen.queryByLabelText('Archivo CSV')).not.toBeInTheDocument()
    })

    it('muestra la pantalla de importación si tiene el permiso', async () => {
      render(<ImportarClientesPage />)

      expect(await screen.findByLabelText('Archivo CSV')).toBeInTheDocument()
      expect(screen.queryByText('Sin permiso')).not.toBeInTheDocument()
    })
  })

  describe('plantilla y ayuda', () => {
    it('descarga la plantilla de Excel con las opciones de la base', async () => {
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      render(<ImportarClientesPage />)

      const boton = await screen.findByRole('button', { name: 'Descargar plantilla Excel' })
      await waitFor(() => expect(boton).toBeEnabled())
      fireEvent.click(boton)

      expect(clic).toHaveBeenCalledTimes(1)
      const blob = URL.createObjectURL.mock.calls[0][0]
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // "PK": es un .xlsx (zip)
      // Las opciones de IVA y tipo de cliente viajan dentro del archivo.
      expect(new TextDecoder().decode(bytes)).toContain('Responsable Inscripto')
    })

    it('el botón de Excel espera a tener las opciones cargadas', async () => {
      let resolver
      obtenerCatalogos.mockReturnValue(new Promise((resolve) => (resolver = resolve)))
      render(<ImportarClientesPage />)

      expect(await screen.findByRole('button', { name: 'Descargar plantilla Excel' })).toBeDisabled()
      resolver(catalogos)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Descargar plantilla Excel' })).toBeEnabled(),
      )
    })

    it('si no se pueden cargar las opciones, avisa y deja la plantilla CSV', async () => {
      obtenerCatalogos.mockRejectedValue(new Error('sin acceso'))
      render(<ImportarClientesPage />)

      expect(await screen.findByText(/No se pudieron cargar las opciones/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Descargar plantilla Excel' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Descargá la versión CSV' })).toBeEnabled()
    })

    it('descarga también una plantilla CSV separada por ";" con la línea sep=;', async () => {
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      render(<ImportarClientesPage />)

      fireEvent.click(await screen.findByRole('button', { name: 'Descargá la versión CSV' }))

      expect(clic).toHaveBeenCalledTimes(1)
      const contenido = await URL.createObjectURL.mock.calls[0][0].text()
      expect(contenido).toContain('sep=;')
      expect(contenido).toContain(ENCABEZADO.split(',').join(';'))
    })

    it('explica cada columna y muestra las opciones reales de IVA y tipo de cliente', async () => {
      render(<ImportarClientesPage />)

      expect(await screen.findByText(/Opciones: Consumidor Final, Exento, Monotributo, Responsable Inscripto\./)).toBeInTheDocument()
      expect(
        screen.getByText(/Opciones: Consumidor Final, Consumidor web, Empresa constructora\./),
      ).toBeInTheDocument()
      for (const columna of ENCABEZADO.split(',')) {
        expect(screen.getByText(columna, { selector: 'strong' })).toBeInTheDocument()
      }
    })

    it('ofrece el CSV como alternativa, debajo del botón principal de Excel', async () => {
      render(<ImportarClientesPage />)

      expect(await screen.findByText(/¿No podés usar Excel\?/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Descargar plantilla Excel' })).toBeInTheDocument()
      expect(screen.queryByText('Descargar plantilla CSV (vacía)')).not.toBeInTheDocument()
    })

    it('el texto largo de la ayuda baja de renglón en vez de pisar la columna vecina', async () => {
      render(<ImportarClientesPage />)

      // El CSS global de las tablas usa white-space: nowrap; estas celdas lo anulan.
      const ayuda = await screen.findByText(/Solo números, sin puntos ni guiones/)
      expect(ayuda).toHaveStyle({ whiteSpace: 'normal' })
      const opciones = screen.getByText(/Opciones: Consumidor Final, Exento/)
      expect(opciones.closest('td')).toHaveStyle({ whiteSpace: 'normal' })
    })

    it('muestra los pasos en orden', async () => {
      render(<ImportarClientesPage />)

      expect(await screen.findByText('1. Descargá la plantilla')).toBeInTheDocument()
      expect(screen.getByText('2. Completala')).toBeInTheDocument()
      expect(screen.getByText('3. Guardala como CSV')).toBeInTheDocument()
      expect(screen.getByText('4. Subí el archivo')).toBeInTheDocument()
    })
  })

  describe('validación del archivo (antes de procesar)', () => {
    it('rechaza un archivo que no es CSV sin consultar nada a la base', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo('contenido', 'clientes.xlsx')

      expect(await screen.findByRole('alert')).toHaveTextContent('no es un CSV')
      expect(cargarReferencias).not.toHaveBeenCalled()
    })

    it('rechaza un CSV al que le faltan columnas e informa cuáles', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo('tipo_persona,nombre\nfisica,Ana')

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent('faltan columnas obligatorias')
      expect(alerta).toHaveTextContent('numero_documento')
      expect(alerta).toHaveTextContent('telefono')
      expect(alerta).toHaveTextContent('Columnas encontradas: tipo_persona, nombre')
      expect(cargarReferencias).not.toHaveBeenCalled()
      expect(screen.queryByText('Vista previa')).not.toBeInTheDocument()
    })

    it('explica el caso de un archivo con todo pegado en una sola columna', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      // Lo que guarda Excel en español si se completó la plantilla vieja (con comas).
      subirArchivo(`${ENCABEZADO};;;;;;\r\nfisica;carmela;serrano;DNI;45774284;Monotributo;Consumidor Final`)

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent('una sola columna')
      expect(alerta).toHaveTextContent('plantilla de Excel')
      expect(cargarReferencias).not.toHaveBeenCalled()
    })

    it('lee un CSV separado por ";" (como lo guarda Excel en español)', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo(
        [
          ENCABEZADO.split(',').join(';'),
          'fisica;Ana;López;;DNI;27111001;Monotributo;Consumidor Final;;3874100001;no',
        ].join('\r\n'),
      )

      expect(await screen.findByText('Vista previa')).toBeInTheDocument()
      expect(screen.getByText('✔ Nueva')).toBeInTheDocument()
    })

    it('lee la plantilla CSV completada, ignorando su línea sep=;', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo(
        `sep=;\n${ENCABEZADO.split(',').join(';')}\nfisica;Ana;López;;DNI;27111001;Monotributo;Consumidor Final;;3874100001;no`,
      )

      expect(await screen.findByText('Vista previa')).toBeInTheDocument()
    })

    it('rechaza un CSV con encabezado pero sin filas', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo(`${ENCABEZADO}\n`)

      expect(await screen.findByRole('alert')).toHaveTextContent('no tiene filas')
    })
  })

  describe('vista previa', () => {
    it('marca cada fila como Nueva, Duplicada o Con error, con su motivo', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo(CSV_MIXTO)

      expect(await screen.findByText('Vista previa')).toBeInTheDocument()
      expect(screen.getByText(/3 filas/)).toBeInTheDocument()

      const filas = screen.getAllByRole('row').slice(1)
      expect(filas).toHaveLength(3)

      expect(within(filas[0]).getByText('✔ Nueva')).toBeInTheDocument()
      expect(within(filas[0]).getByText('López, Ana')).toBeInTheDocument()

      expect(within(filas[1]).getByText('⚠ Duplicada')).toBeInTheDocument()
      expect(within(filas[1]).getByText('El documento ya existe en el sistema')).toBeInTheDocument()

      expect(within(filas[2]).getByText('✖ Con error')).toBeInTheDocument()
      expect(within(filas[2]).getByText(/CUIT inválido/)).toBeInTheDocument()
    })

    it('un documento repetido en el archivo deja con error a todas sus filas', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo(
        [
          ENCABEZADO,
          'fisica,Ana,López,,DNI,27111001,Monotributo,Consumidor Final,,3874100001,no',
          'fisica,Ana,Otra,,DNI,27111001,Monotributo,Consumidor Final,,3874100002,no',
        ].join('\n'),
      )

      await screen.findByText('Vista previa')
      const filas = screen.getAllByRole('row').slice(1)
      for (const fila of filas) {
        expect(within(fila).getByText('✖ Con error')).toBeInTheDocument()
        expect(within(fila).getByText(/Documento repetido en el archivo/)).toBeInTheDocument()
      }
      expect(screen.getByRole('button', { name: /Confirmar importación/ })).toBeDisabled()
    })

    it('el motivo largo de una fila con varios errores también ajusta el texto', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')

      subirArchivo(
        [ENCABEZADO, 'fisica,,,,DNI,12,Inventada,VIP,mail-malo,,'].join('\n'),
      )

      await screen.findByText('Vista previa')
      const motivo = screen.getByText(/DNI inválido.*Falta el teléfono/)
      expect(motivo).toHaveStyle({ whiteSpace: 'normal' })
    })

    it('permite filtrar por estado', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(CSV_MIXTO)
      await screen.findByText('Vista previa')

      fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: 'duplicada' } })

      const filas = screen.getAllByRole('row').slice(1)
      expect(filas).toHaveLength(1)
      expect(within(filas[0]).getByText('⚠ Duplicada')).toBeInTheDocument()
    })

    it('cancelar vuelve a la pantalla de carga sin importar nada', async () => {
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(CSV_MIXTO)
      await screen.findByText('Vista previa')

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(await screen.findByLabelText('Archivo CSV')).toBeInTheDocument()
      expect(importarClientes).not.toHaveBeenCalled()
    })
  })

  describe('confirmación', () => {
    it('importa solo las filas nuevas y muestra el resumen', async () => {
      importarClientes.mockResolvedValue({ importadas: 1, duplicadas: 0, conError: 0 })
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(CSV_MIXTO)
      await screen.findByText('Vista previa')

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación (1)' }))

      expect(await screen.findByText('Importación finalizada')).toBeInTheDocument()

      expect(importarClientes).toHaveBeenCalledTimes(1)
      const enviadas = importarClientes.mock.calls[0][0]
      expect(enviadas).toHaveLength(1)
      expect(enviadas[0]).toMatchObject({ numero_documento: '27111001', apellido: 'López' })

      // Resumen: 1 importada + 1 duplicada + 1 con error de la vista previa.
      expect(screen.getByText('Importadas: 1')).toBeInTheDocument()
      expect(screen.getByText('Duplicadas: 1')).toBeInTheDocument()
      expect(screen.getByText('Con error: 1')).toBeInTheDocument()
    })

    it('suma al resumen lo que la base descartó al confirmar', async () => {
      importarClientes.mockResolvedValue({ importadas: 0, duplicadas: 1, conError: 0 })
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(CSV_MIXTO)
      await screen.findByText('Vista previa')

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación (1)' }))

      await screen.findByText('Importación finalizada')
      expect(screen.getByText('Importadas: 0')).toBeInTheDocument()
      expect(screen.getByText('Duplicadas: 2')).toBeInTheDocument()
    })

    it('descarga un CSV con las filas rechazadas y su motivo', async () => {
      importarClientes.mockResolvedValue({ importadas: 1, duplicadas: 0, conError: 0 })
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(CSV_MIXTO)
      await screen.findByText('Vista previa')
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación (1)' }))
      await screen.findByText('Importación finalizada')

      fireEvent.click(screen.getByRole('button', { name: 'Descargar filas rechazadas (CSV)' }))

      expect(clic).toHaveBeenCalledTimes(1)
      const contenido = await URL.createObjectURL.mock.calls[0][0].text()
      expect(contenido).toContain('fila_archivo')
      expect(contenido).toContain('El documento ya existe en el sistema')
      expect(contenido).toContain('CUIT inválido')
      expect(contenido).not.toContain('27111001') // la fila nueva no es rechazada
    })

    it('no ofrece la descarga si no hubo filas rechazadas', async () => {
      importarClientes.mockResolvedValue({ importadas: 1, duplicadas: 0, conError: 0 })
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(
        `${ENCABEZADO}\nfisica,Ana,López,,DNI,27111001,Monotributo,Consumidor Final,,3874100001,no`,
      )
      await screen.findByText('Vista previa')
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación (1)' }))
      await screen.findByText('Importación finalizada')

      expect(
        screen.queryByRole('button', { name: 'Descargar filas rechazadas (CSV)' }),
      ).not.toBeInTheDocument()
    })

    it('ante un error inesperado avisa, no muestra resumen y deja reintentar', async () => {
      importarClientes.mockRejectedValue(
        new Error('No se pudo completar la importación: boom. No se importó ninguna fila.'),
      )
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(CSV_MIXTO)
      await screen.findByText('Vista previa')

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación (1)' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('No se importó ninguna fila')
      expect(screen.queryByText('Importación finalizada')).not.toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Confirmar importación (1)' })).toBeEnabled(),
      )
    })

    it('"Importar otro archivo" vuelve a la pantalla de carga', async () => {
      importarClientes.mockResolvedValue({ importadas: 1, duplicadas: 0, conError: 0 })
      render(<ImportarClientesPage />)
      await screen.findByLabelText('Archivo CSV')
      subirArchivo(CSV_MIXTO)
      await screen.findByText('Vista previa')
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación (1)' }))
      await screen.findByText('Importación finalizada')

      fireEvent.click(screen.getByRole('button', { name: 'Importar otro archivo' }))

      expect(await screen.findByLabelText('Archivo CSV')).toBeInTheDocument()
    })
  })

  it('muestra el error si falla la carga de referencias para la vista previa', async () => {
    cargarReferencias.mockRejectedValue(new Error('sin acceso a clientes'))
    render(<ImportarClientesPage />)
    await screen.findByLabelText('Archivo CSV')

    subirArchivo(CSV_MIXTO)

    expect(await screen.findByRole('alert')).toHaveTextContent('sin acceso a clientes')
    expect(screen.queryByText('Vista previa')).not.toBeInTheDocument()
  })
})
