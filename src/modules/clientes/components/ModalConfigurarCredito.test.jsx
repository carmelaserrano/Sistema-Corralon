import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModalConfigurarCredito from './ModalConfigurarCredito'
import { actualizarCondicionesCredito } from '../api/cuentaCorrienteClienteApi'

vi.mock('../api/cuentaCorrienteClienteApi', () => ({
  actualizarCondicionesCredito: vi.fn(),
}))

const clienteMock = {
  id: 'c1',
  numero: 10,
  tipo_persona: 'juridica',
  razon_social: 'Constructora del Norte S.A.',
  habilita_cta_cte: false,
  limite_credito: 0,
  plazo_credito_dias: 30,
}

describe('ModalConfigurarCredito', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no renderiza nada si abierto es false', () => {
    const { container } = render(
      <ModalConfigurarCredito
        abierto={false}
        cliente={clienteMock}
        onGuardado={vi.fn()}
        onCerrar={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('permite modificar la habilitación, límite y plazo de pago y guardar', async () => {
    const onGuardado = vi.fn()
    const onCerrar = vi.fn()
    actualizarCondicionesCredito.mockResolvedValueOnce({
      id: 'c1',
      habilita_cta_cte: true,
      limite_credito: 5000000,
      plazo_credito_dias: 60,
    })

    render(
      <ModalConfigurarCredito
        abierto
        cliente={clienteMock}
        onGuardado={onGuardado}
        onCerrar={onCerrar}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Condiciones de Crédito' })).toBeInTheDocument()
    expect(screen.getByText(/Constructora del Norte S\.A\./)).toBeInTheDocument()

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    const inputLimite = screen.getByLabelText(/Límite de crédito/)
    fireEvent.change(inputLimite, { target: { value: '5000000' } })

    const inputPlazo = screen.getByLabelText(/Plazo de crédito acordado/)
    fireEvent.change(inputPlazo, { target: { value: '60' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar condiciones' }))

    await waitFor(() => {
      expect(actualizarCondicionesCredito).toHaveBeenCalledWith('c1', {
        habilita_cta_cte: true,
        limite_credito: 5000000,
        plazo_credito_dias: 60,
      })
      expect(onGuardado).toHaveBeenCalled()
      expect(onCerrar).toHaveBeenCalled()
    })
  })

  it('valida que el límite no sea negativo', async () => {
    render(
      <ModalConfigurarCredito
        abierto
        cliente={{ ...clienteMock, habilita_cta_cte: true }}
        onGuardado={vi.fn()}
        onCerrar={vi.fn()}
      />,
    )

    const inputLimite = screen.getByLabelText(/Límite de crédito/)
    fireEvent.change(inputLimite, { target: { value: '-100' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar condiciones' }))

    expect(
      await screen.findByText('El límite de crédito debe ser un número igual o mayor a 0'),
    ).toBeInTheDocument()
    expect(actualizarCondicionesCredito).not.toHaveBeenCalled()
  })
})
