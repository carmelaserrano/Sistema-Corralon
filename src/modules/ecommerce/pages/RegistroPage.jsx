import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import { useClienteWeb } from '../context/ClienteWebContext'
import { LARGO_MINIMO_PASSWORD, registrar, validarRegistro } from '../api/clienteWebApi'
import { formatearCuit } from '../../proveedores/cuit'

const FORM_INICIAL = {
  nombre: '',
  apellido: '',
  tipo_documento: 'DNI',
  numero_documento: '',
  email: '',
  telefono: '',
  password: '',
}

const CAMPOS_TEXTO = [
  { name: 'nombre', label: 'Nombre', autoComplete: 'given-name' },
  { name: 'apellido', label: 'Apellido', autoComplete: 'family-name' },
]

export default function RegistroPage({ onNavigate }) {
  const { cliente } = useClienteWeb()
  const [form, setForm] = useState(FORM_INICIAL)
  const [erroresCampo, setErroresCampo] = useState({})
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)

  function cambiar(event) {
    const { name, value } = event.target
    const valor = name === 'numero_documento' && form.tipo_documento === 'CUIT' ? formatearCuit(value) : value
    setForm((actual) => ({ ...actual, [name]: valor }))
    setErroresCampo((actual) => ({ ...actual, [name]: '' }))
  }

  function cambiarTipoDocumento(event) {
    setForm((actual) => ({ ...actual, tipo_documento: event.target.value, numero_documento: '' }))
    setErroresCampo((actual) => ({ ...actual, numero_documento: '' }))
  }

  async function enviar(event) {
    event.preventDefault()
    setError('')
    try {
      validarRegistro(form)
    } catch (err) {
      setErroresCampo({ [err.campo]: err.message })
      return
    }
    setEnviando(true)
    try {
      setResultado(await registrar(form))
      setForm(FORM_INICIAL)
    } catch (err) {
      if (err.campo) setErroresCampo({ [err.campo]: err.message })
      else setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const contenedor = { maxWidth: 560, margin: '24px auto', padding: '0 16px' }

  if (resultado?.estado === 'confirmar_email') {
    return (
      <section className="tienda-auth-card" aria-labelledby="titulo-registro" style={contenedor}>
        <h1 id="titulo-registro">Revisá tu correo</h1>
        <Feedback tone="success">
          Si el email no estaba registrado, te enviamos un enlace para confirmar tu cuenta.
          Después de confirmarla, ingresá con tu email y contraseña.
        </Feedback>
        <Button type="button" onClick={() => onNavigate?.('ingresar')}>Ir a Ingresar</Button>
      </section>
    )
  }

  if (resultado?.estado === 'registrado' || cliente) {
    return (
      <section className="tienda-auth-card" aria-labelledby="titulo-registro" style={contenedor}>
        <h1 id="titulo-registro">¡Listo!</h1>
        <Feedback tone="success">Tu cuenta ya está activa.</Feedback>
        <Button type="button" onClick={() => onNavigate?.('catalogo')}>Ir al catálogo</Button>
      </section>
    )
  }

  const esCuit = form.tipo_documento === 'CUIT'
  return (
    <section className="tienda-auth-card" aria-labelledby="titulo-registro" style={contenedor}>
      <h1 id="titulo-registro"><UserPlus size={26} aria-hidden="true" /> Registrarme</h1>
      <p>Creá tu cuenta para guardar tus datos de entrega y ver tus compras.</p>
      {error && <Feedback tone="error">{error}</Feedback>}

      <form onSubmit={enviar} noValidate aria-busy={enviando}>
        {CAMPOS_TEXTO.map((campo) => (
          <div key={campo.name}>
            <label htmlFor={`registro-${campo.name}`}>{campo.label}</label>
            <input id={`registro-${campo.name}`} name={campo.name} value={form[campo.name]}
              onChange={cambiar} autoComplete={campo.autoComplete} aria-invalid={!!erroresCampo[campo.name]} />
            {erroresCampo[campo.name] && <Feedback tone="error">{erroresCampo[campo.name]}</Feedback>}
          </div>
        ))}

        <div>
          <label htmlFor="registro-tipo_documento">Tipo de documento</label>
          <select id="registro-tipo_documento" name="tipo_documento" value={form.tipo_documento} onChange={cambiarTipoDocumento}>
            <option value="DNI">DNI</option>
            <option value="CUIT">CUIT</option>
          </select>
        </div>

        <div>
          <label htmlFor="registro-numero_documento">{esCuit ? 'CUIT' : 'DNI'}</label>
          <input id="registro-numero_documento" name="numero_documento" value={form.numero_documento}
            onChange={cambiar} inputMode="numeric" autoComplete="off"
            placeholder={esCuit ? '20-12345678-6' : '30111222'} aria-invalid={!!erroresCampo.numero_documento} />
          {erroresCampo.numero_documento && <Feedback tone="error">{erroresCampo.numero_documento}</Feedback>}
        </div>

        <div>
          <label htmlFor="registro-email">Email</label>
          <input id="registro-email" name="email" type="email" value={form.email}
            onChange={cambiar} autoComplete="email" aria-invalid={!!erroresCampo.email} />
          {erroresCampo.email && <Feedback tone="error">{erroresCampo.email}</Feedback>}
        </div>

        <div>
          <label htmlFor="registro-telefono">Teléfono</label>
          <input id="registro-telefono" name="telefono" type="tel" value={form.telefono}
            onChange={cambiar} autoComplete="tel" aria-invalid={!!erroresCampo.telefono} />
          {erroresCampo.telefono && <Feedback tone="error">{erroresCampo.telefono}</Feedback>}
        </div>

        <div>
          <label htmlFor="registro-password">Contraseña</label>
          <input id="registro-password" name="password" type="password" value={form.password}
            onChange={cambiar} autoComplete="new-password" minLength={LARGO_MINIMO_PASSWORD}
            aria-describedby="registro-password-ayuda" aria-invalid={!!erroresCampo.password} />
          <small id="registro-password-ayuda">Mínimo {LARGO_MINIMO_PASSWORD} caracteres.</small>
          {erroresCampo.password && <Feedback tone="error">{erroresCampo.password}</Feedback>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <Button type="submit" loading={enviando} loadingLabel="Registrando…">Crear cuenta</Button>
          <Button type="button" variant="ghost" disabled={enviando} onClick={() => onNavigate?.('ingresar')}>
            Ya tengo cuenta
          </Button>
        </div>
      </form>
    </section>
  )
}
