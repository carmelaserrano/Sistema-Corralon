import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import Button from '../../../components/ui/Button'

/**
 * Modal de autorización de descuento manual. Firma de props congelada desde
 * S3-00 (la usa S3-09 por import); la implementación real —autenticar al
 * supervisor con un cliente Supabase sin persistir sesión— es de S3-06.
 *
 * Versión base: no pide credenciales, autoriza siempre llamando a
 * `autorizar_descuento` con el token de quien tiene la sesión abierta.
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
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  if (!abierto) return null

  async function autorizar() {
    setCargando(true)
    setError('')
    const { data, error: errorRpc } = await supabase.rpc('autorizar_descuento', {
      p_porcentaje: porcentaje,
    })
    setCargando(false)

    if (errorRpc) {
      setError('No se pudo autorizar el descuento')
      return
    }
    onAutorizado(data)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Autorización de descuento</h2>
        <p>
          Descuento del {porcentaje}% — versión base: autoriza siempre
          (S3-06 agrega la validación real contra el supervisor).
        </p>
        {error && <p className="feedback feedback-error">{error}</p>}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="button" onClick={autorizar} disabled={cargando}>
            {cargando ? 'Autorizando…' : 'Autorizar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
