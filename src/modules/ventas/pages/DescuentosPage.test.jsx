import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DescuentosPage from './DescuentosPage'
import {
  TIPOS_APLICACION,
  actualizarReglaDescuento,
  crearReglaDescuento,
  listarOpcionesReferencia,
  listarReglasDescuento,
  obtenerLimiteDescuentoManual,
  puedeGestionarDescuentos,
  setLimiteDescuentoManual,
} from '../api/descuentosApi'

vi.mock('../api/descuentosApi', () => ({
  TIPOS_APLICACION: [
    { value: 'tipo_cliente', label: 'Tipo de cliente', tabla: 'tipos_cliente' },
    { value: 'categoria', label: 'Categoría', tabla: 'categorias' },
    { value: 'producto', label: 'Producto', tabla: 'productos' },
  ],
  actualizarReglaDescuento: vi.fn(),
  crearReglaDescuento: vi.fn(),
  listarOpcionesReferencia: vi.fn(),
  listarReglasDescuento: vi.fn(),
  obtenerLimiteDescuentoManual: vi.fn(),
  puedeGestionarDescuentos: vi.fn(),
  setLimiteDescuentoManual: vi.fn(),
}))

const reglaMayorista = {
  id: 'r1', tipo_aplicacion: 'tipo_cliente', referencia_id: 't1',
  referencia_nombre: 'Mayorista', porcentaje: 10, activo: true, created_at: '2026-01-01',
}
const reglaCemento = {
  id: 'r2', tipo_aplicacion: 'categoria', referencia_id: 'c1',
  referencia_nombre: 'Cemento', porcentaje: 15, activo: false, created_at: '2026-01-02',
}
const reglaHuerfana = {
  id: 'r3', tipo_aplicacion: 'producto', referencia_id: 'p-borrado',
  referencia_nombre: null, porcentaje: 5, activo: true, created_at: '2026-01-03',
}

describe('DescuentosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    puedeGestionarDescuentos.mockResolvedValue(true)
    listarReglasDescuento.mockResolvedValue([reglaMayorista, reglaCemento])
    obtenerLimiteDescuentoManual.mockResolvedValue(15)
    listarOpcionesReferencia.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('carga inicial', () => {
    it('muestra el límite configurado', async () => {
      render(<DescuentosPage />)
      expect(await screen.findByLabelText('Porcentaje límite')).toHaveValue(15)
    })

    it('si no hay límite configurado, el campo queda vacío con un placeholder', async () => {
      obtenerLimiteDescuentoManual.mockResolvedValue(null)
      render(<DescuentosPage />)
      const campo = await screen.findByLabelText('Porcentaje límite')
      expect(campo).toHaveValue(null)
      expect(campo).toHaveAttribute('placeholder', 'Sin configurar')
    })

    it('lista las reglas con su tipo, referencia, porcentaje y estado', async () => {
      render(<DescuentosPage />)

      const filaMayorista = (await screen.findByText('Mayorista')).closest('tr')
      expect(within(filaMayorista).getByText('Tipo de cliente')).toBeInTheDocument()
      expect(within(filaMayorista).getByText('Activa')).toBeInTheDocument()

      const filaCemento = screen.getByText('Cemento').closest('tr')
      expect(within(filaCemento).getByText('Categoría')).toBeInTheDocument()
      expect(within(filaCemento).getByText('Inactiva')).toBeInTheDocument()
    })

    it('una regla cuya referencia ya no existe se marca claramente', async () => {
      listarReglasDescuento.mockResolvedValue([reglaHuerfana])
      render(<DescuentosPage />)
      expect(await screen.findByText('— (ya no existe)')).toBeInTheDocument()
    })

    it('sin reglas, muestra el estado vacío', async () => {
      listarReglasDescuento.mockResolvedValue([])
      render(<DescuentosPage />)
      expect(await screen.findByText('Todavía no hay reglas de descuento')).toBeInTheDocument()
    })

    it('si falla la carga de reglas, muestra el error', async () => {
      listarReglasDescuento.mockRejectedValue(new Error('sin conexión'))
      render(<DescuentosPage />)
      expect(await screen.findByText('sin conexión')).toBeInTheDocument()
    })
  })

  describe('permiso precios.gestionar', () => {
    it('con permiso: muestra el formulario de nueva regla y las acciones', async () => {
      render(<DescuentosPage />)
      await screen.findByText('Mayorista')
      expect(screen.getByText('Nueva regla de descuento')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Guardar' })).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument()
    })

    it('sin permiso: no hay formulario ni acciones, y se ve el aviso', async () => {
      puedeGestionarDescuentos.mockResolvedValue(false)
      render(<DescuentosPage />)
      await screen.findByText('Mayorista')

      expect(screen.queryByText('Nueva regla de descuento')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
      expect(screen.getByText(/Sólo podés consultar/)).toBeInTheDocument()
      // El porcentaje se ve como texto, no como campo editable.
      expect(screen.getByText('10%')).toBeInTheDocument()
    })

    it('sin permiso: el límite se muestra como texto, no como formulario', async () => {
      puedeGestionarDescuentos.mockResolvedValue(false)
      render(<DescuentosPage />)
      expect(await screen.findByText('Límite actual: 15%')).toBeInTheDocument()
      expect(screen.queryByLabelText('Porcentaje límite')).not.toBeInTheDocument()
    })
  })

  describe('nueva regla (CA-01)', () => {
    it('al elegir "Aplica a" carga las opciones de esa tabla y resetea la referencia', async () => {
      listarOpcionesReferencia.mockResolvedValue([{ id: 't1', nombre: 'Mayorista' }])
      render(<DescuentosPage />)
      await screen.findByText('Mayorista')

      fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'tipo_cliente' } })

      expect(listarOpcionesReferencia).toHaveBeenCalledWith('tipo_cliente')
      expect(await screen.findByRole('option', { name: 'Mayorista' })).toBeInTheDocument()
    })

    it('el desplegable de referencia arranca deshabilitado hasta elegir un tipo', async () => {
      render(<DescuentosPage />)
      await screen.findByText('Mayorista')
      expect(screen.getByLabelText('Elegí primero a qué aplica')).toBeDisabled()
    })

    it('crea la regla con los datos del formulario', async () => {
      listarOpcionesReferencia.mockResolvedValue([{ id: 'p1', nombre: 'Cemento Portland' }])
      crearReglaDescuento.mockResolvedValue({ id: 'nueva' })
      render(<DescuentosPage />)
      await screen.findByText('Mayorista')

      fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'producto' } })
      await screen.findByRole('option', { name: 'Cemento Portland' })
      fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'p1' } })
      fireEvent.change(screen.getByLabelText('Porcentaje'), { target: { value: '12' } })

      fireEvent.click(screen.getByRole('button', { name: 'Crear regla' }))

      await waitFor(() =>
        expect(crearReglaDescuento).toHaveBeenCalledWith({
          tipo_aplicacion: 'producto',
          referencia_id: 'p1',
          porcentaje: '12',
          activo: true,
        }),
      )
      expect(await screen.findByText('Regla de descuento creada')).toBeInTheDocument()
    })

    it('la casilla Activa se puede destildar para crear una regla inactiva', async () => {
      crearReglaDescuento.mockResolvedValue({ id: 'nueva' })
      render(<DescuentosPage />)
      await screen.findByText('Mayorista')

      fireEvent.click(screen.getByLabelText('Activa'))
      fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'tipo_cliente' } })
      fireEvent.change(screen.getByLabelText('Tipo de cliente'), { target: { value: 't1' } })
      fireEvent.change(screen.getByLabelText('Porcentaje'), { target: { value: '5' } })
      fireEvent.click(screen.getByRole('button', { name: 'Crear regla' }))

      await waitFor(() =>
        expect(crearReglaDescuento).toHaveBeenCalledWith(
          expect.objectContaining({ activo: false }),
        ),
      )
    })

    it('si falla la creación, muestra el error y no limpia el formulario', async () => {
      // Un valor válido para el <input min/max>: si estuviera fuera de rango,
      // el propio navegador bloquearía el submit antes de llegar a la API.
      crearReglaDescuento.mockRejectedValue(
        new Error('No se pudo guardar la regla: no existe o no tenés permiso para modificarla'),
      )
      render(<DescuentosPage />)
      await screen.findByText('Mayorista')

      fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'tipo_cliente' } })
      fireEvent.change(screen.getByLabelText('Porcentaje'), { target: { value: '50' } })
      fireEvent.click(screen.getByRole('button', { name: 'Crear regla' }))

      expect(
        await screen.findByText(/no existe o no tenés permiso para modificarla/),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Porcentaje')).toHaveValue(50)
    })
  })

  describe('editar el porcentaje de una regla existente', () => {
    it('el botón Guardar de la fila arranca deshabilitado hasta que se cambia el valor', async () => {
      render(<DescuentosPage />)
      const fila = (await screen.findByText('Mayorista')).closest('tr')

      expect(within(fila).getByRole('button', { name: 'Guardar' })).toBeDisabled()

      fireEvent.change(within(fila).getByRole('spinbutton'), { target: { value: '20' } })
      expect(within(fila).getByRole('button', { name: 'Guardar' })).toBeEnabled()
    })

    it('Guardar llama a actualizarReglaDescuento con el nuevo porcentaje', async () => {
      actualizarReglaDescuento.mockResolvedValue({ ...reglaMayorista, porcentaje: 20 })
      render(<DescuentosPage />)
      const fila = (await screen.findByText('Mayorista')).closest('tr')

      fireEvent.change(within(fila).getByRole('spinbutton'), { target: { value: '20' } })
      fireEvent.click(within(fila).getByRole('button', { name: 'Guardar' }))

      await waitFor(() =>
        expect(actualizarReglaDescuento).toHaveBeenCalledWith('r1', { porcentaje: 20 }),
      )
    })

    it('si falla, muestra el error de la API', async () => {
      actualizarReglaDescuento.mockRejectedValue(new Error('no tenés permiso'))
      render(<DescuentosPage />)
      const fila = (await screen.findByText('Mayorista')).closest('tr')

      fireEvent.change(within(fila).getByRole('spinbutton'), { target: { value: '20' } })
      fireEvent.click(within(fila).getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('no tenés permiso')).toBeInTheDocument()
    })
  })

  describe('activar / desactivar una regla', () => {
    it('Desactivar llama a actualizarReglaDescuento con activo:false', async () => {
      actualizarReglaDescuento.mockResolvedValue({ ...reglaMayorista, activo: false })
      render(<DescuentosPage />)
      const fila = (await screen.findByText('Mayorista')).closest('tr')

      fireEvent.click(within(fila).getByRole('button', { name: 'Desactivar' }))

      await waitFor(() =>
        expect(actualizarReglaDescuento).toHaveBeenCalledWith('r1', { activo: false }),
      )
    })

    it('Activar (sobre una inactiva) llama a actualizarReglaDescuento con activo:true', async () => {
      actualizarReglaDescuento.mockResolvedValue({ ...reglaCemento, activo: true })
      render(<DescuentosPage />)
      const fila = (await screen.findByText('Cemento')).closest('tr')

      fireEvent.click(within(fila).getByRole('button', { name: 'Activar' }))

      await waitFor(() =>
        expect(actualizarReglaDescuento).toHaveBeenCalledWith('r2', { activo: true }),
      )
    })
  })

  describe('límite de descuento manual (CA-04)', () => {
    it('guardarLimite llama a setLimiteDescuentoManual con el número ingresado', async () => {
      render(<DescuentosPage />)
      await screen.findByLabelText('Porcentaje límite')

      fireEvent.change(screen.getByLabelText('Porcentaje límite'), { target: { value: '25' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar límite' }))

      await waitFor(() => expect(setLimiteDescuentoManual).toHaveBeenCalledWith(25))
      expect(await screen.findByText('Límite de descuento manual actualizado')).toBeInTheDocument()
    })

    it('si falla, muestra el error', async () => {
      // Valor dentro de min/max: lo que se prueba es el error que devuelve
      // la API (ej. sin permiso), no la validación nativa del <input>.
      setLimiteDescuentoManual.mockRejectedValue(
        new Error('No tenés permiso para configurar el límite de descuento manual'),
      )
      render(<DescuentosPage />)
      await screen.findByLabelText('Porcentaje límite')

      fireEvent.change(screen.getByLabelText('Porcentaje límite'), { target: { value: '50' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar límite' }))

      expect(
        await screen.findByText(/No tenés permiso para configurar el límite/),
      ).toBeInTheDocument()
    })
  })

  it('TIPOS_APLICACION del mock coincide con lo que expone la API real (sanity check)', () => {
    expect(TIPOS_APLICACION.map((t) => t.value)).toEqual(['tipo_cliente', 'categoria', 'producto'])
  })
})
