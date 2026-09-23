import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { autorizarDescuentoComoSupervisor } from '../api/descuentosApi'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'

/**
 * Modal de autorización de descuento manual (S3-06, CA-05/CA-06). Firma de
 * props congelada desde S3-00 (la usa S3-09 por import).
 *
 * El propio componente decide cuándo mostrarse (`if (!abierto) return null`,
 * no un `{abierto && <Modal/>}` del que lo usa), así que queda montado todo
 * el tiempo: el formulario se limpia solo cada vez que `abierto` pasa a
 * true, para no arrastrar el email o un error de la vez anterior.
 *
 * Decidir CUÁNDO mostrarlo (si el descuento pedido supera el límite) es
 * responsabilidad de quien lo usa, con `validarDescuentoManual` de
 * descuentosApi — este componente solo sabe pedir credenciales y autorizar.
 *
 * @param {boolean} abierto Si el modal está visible.
 * @param {number} porcentaje Porcentaje de descuento a autorizar.
 * @param {(autorizacionId: string) => void} onAutorizado Se llama con el id
 *   de la autorización creada.
 * @param {() => void} onCancelar Se llama si el usuario cierra sin autorizar.
 */
export default function ModalAutorizacionDescuento({
  abierto,
  porcentaje,
  onAutorizado,
  onCancelar,
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [autorizando, setAutorizando] = useState(false)
  const emailRef = useRef(null)

  useEffect(() => {
    if (!abierto) return
    setEmail('')
    setPassword('')
    setError('')
    setAutorizando(false)
    emailRef.current?.focus()
  }, [abierto])

  useEffect(() => {
    if (!abierto) return undefined

    function manejarTecla(event) {
      if (event.key === 'Escape') onCancelar()
    }

    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [abierto, onCancelar])

  if (!abierto) return null

  async function autorizar(event) {
    event.preventDefault()

    if (!email.trim() || !password) {
      setError('Completá el email y la contraseña del supervisor')
      return
    }

    try {
      setAutorizando(true)
      setError('')

      const autorizacionId = await autorizarDescuentoComoSupervisor({
        email: email.trim(),
        password,
        porcentaje,
      })

      onAutorizado(autorizacionId)
    } catch (err) {
      setError(err.message || 'No se pudo autorizar el descuento')
    } finally {
      setAutorizando(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancelar}>
      <section
        aria-labelledby="autorizar-descuento-title"
        aria-modal="true"
        className="modal-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Autorización requerida</p>
            <h2 id="autorizar-descuento-title">Descuento del {porcentaje}%</h2>
            <p>
              Este descuento supera el límite permitido. Un supervisor tiene
              que autorizarlo con su email y contraseña.
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="icon-button"
            onClick={onCancelar}
            title="Cerrar"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {error && <Feedback tone="error">{error}</Feedback>}

        <form onSubmit={autorizar}>
          <div>
            <label htmlFor="supervisor-email">Email del supervisor</label>
            <input
              id="supervisor-email"
              ref={emailRef}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              disabled={autorizando}
            />
          </div>

          <div>
            <label htmlFor="supervisor-password">Contraseña</label>
            <input
              id="supervisor-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              disabled={autorizando}
            />
          </div>

          <div>
            <Button type="submit" loading={autorizando} loadingLabel="Autorizando…">
              Autorizar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancelar}
              disabled={autorizando}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
