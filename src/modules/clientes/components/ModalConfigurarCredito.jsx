import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { actualizarCondicionesCredito } from '../api/cuentaCorrienteClienteApi'

export default function ModalConfigurarCredito({
  abierto,
  cliente,
  onGuardado,
  onCerrar,
}) {
  const [habilitaCtaCte, setHabilitaCtaCte] = useState(() => Boolean(cliente?.habilita_cta_cte))
  const [limiteCredito, setLimiteCredito] = useState(() => String(cliente?.limite_credito ?? 0))
  const [plazoDias, setPlazoDias] = useState(() => String(cliente?.plazo_credito_dias ?? 30))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cerrarRef = useRef(null)

  useEffect(() => {
    if (abierto && cliente) {
      setHabilitaCtaCte(Boolean(cliente.habilita_cta_cte))
      setLimiteCredito(String(cliente.limite_credito ?? 0))
      setPlazoDias(String(cliente.plazo_credito_dias ?? 30))
      setError('')
      setGuardando(false)
      cerrarRef.current?.focus()
    }
  }, [abierto, cliente])

  useEffect(() => {
    if (!abierto) return undefined
    function manejarTecla(event) {
      if (event.key === 'Escape' && !guardando) onCerrar()
    }
    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [abierto, guardando, onCerrar])

  if (!abierto || !cliente) return null

  const nombreCliente =
    cliente.tipo_persona === 'juridica'
      ? cliente.razon_social
      : [cliente.apellido, cliente.nombre].filter(Boolean).join(', ')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const limiteNum = Number(limiteCredito)
    if (Number.isNaN(limiteNum) || limiteNum < 0) {
      setError('El límite de crédito debe ser un número igual o mayor a 0')
      return
    }

    const plazoNum = parseInt(plazoDias, 10)
    if (Number.isNaN(plazoNum) || plazoNum < 0) {
      setError('El plazo de pago debe ser un número de días entero mayor o igual a 0')
      return
    }

    try {
      setGuardando(true)
      const actualizado = await actualizarCondicionesCredito(cliente.id, {
        habilita_cta_cte: habilitaCtaCte,
        limite_credito: limiteNum,
        plazo_credito_dias: plazoNum,
      })
      onGuardado(actualizado)
      onCerrar()
    } catch (err) {
      setError(err.message || 'No se pudieron actualizar las condiciones de crédito')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar()
      }}
    >
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-config-credito"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Cuenta Corriente</p>
            <h2 id="titulo-config-credito">Condiciones de Crédito</h2>
            <p>
              #{cliente.numero} · {nombreCliente}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onCerrar}
            disabled={guardando}
            ref={cerrarRef}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={habilitaCtaCte}
                onChange={(e) => setHabilitaCtaCte(e.target.checked)}
                disabled={guardando}
              />
              <span style={{ fontWeight: 500 }}>
                Habilitar operaciones en Cuenta Corriente
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '0.25rem', color: 'var(--color-text-secondary, #6b7280)' }}>
              Permite diferir pagos en mostrador hasta el límite asignado.
            </small>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="limite-credito-input">
              Límite de crédito ($ ARS)
            </label>
            <input
              id="limite-credito-input"
              type="number"
              min="0"
              step="100"
              value={limiteCredito}
              onChange={(e) => setLimiteCredito(e.target.value)}
              disabled={guardando || !habilitaCtaCte}
              placeholder="0 = sin límite o sin crédito"
            />
            <small style={{ display: 'block', marginTop: '0.25rem', color: 'var(--color-text-secondary, #6b7280)' }}>
              Monto máximo adeudable acumulado. Si es 0, no se aplica tope de crédito.
            </small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="plazo-credito-input">
              Plazo de crédito acordado (días)
            </label>
            <input
              id="plazo-credito-input"
              type="number"
              min="0"
              step="1"
              value={plazoDias}
              onChange={(e) => setPlazoDias(e.target.value)}
              disabled={guardando || !habilitaCtaCte}
              placeholder="Ej. 30 o 60 días"
            />
            <small style={{ display: 'block', marginTop: '0.25rem', color: 'var(--color-text-secondary, #6b7280)' }}>
              Plazo habitual pactado con constructoras o arquitectos (ej. 30, 60 días).
            </small>
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={onCerrar}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={guardando}
              loadingLabel="Guardando…"
            >
              Guardar condiciones
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
