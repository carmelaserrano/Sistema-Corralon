import { useEffect, useState } from 'react'
import { MapPin, Package, ShoppingBag, UserPlus } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import CuentaExitoCard from '../components/CuentaExitoCard'
import { useClienteWeb } from '../context/ClienteWebContext'
import { LARGO_MINIMO_PASSWORD, METADATO_REGISTRO, validarRegistro } from '../api/clienteWebApi'
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
  const { cliente, registrar, pendiente, errorRegistro, salir } = useClienteWeb()
  const [form, setForm] = useState(FORM_INICIAL)
  const [erroresCampo, setErroresCampo] = useState({})
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    if (pendiente) setForm((actual) => ({ ...actual, ...pendiente.user_metadata?.[METADATO_REGISTRO], email: pendiente.email, password: '' }))
  }, [pendiente])

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
      validarRegistro(form, { requierePassword: !pendiente })
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
      setForm((actual) => ({ ...actual, password: '' }))
    } finally {
      setEnviando(false)
    }
  }

  const contenedor = { maxWidth: 560, margin: '24px auto', padding: '0 16px' }

  if (resultado?.estado === 'registrado' || (cliente && !enviando)) {
    const nombre = cliente?.nombre?.trim()
    return (
      <CuentaExitoCard
        tituloId="titulo-registro"
        titulo={resultado ? '¡Tu cuenta ya está lista!' : 'Ya tenés una cuenta'}
        saludo={nombre ? `Bienvenido, ${nombre}` : 'Bienvenido'}
        descripcion={resultado ? 'Tu cuenta fue creada correctamente y ya podés empezar a comprar.' : 'Ya ingresaste con tu cuenta: no hace falta registrarte de nuevo.'}
        acciones={[
          { texto: 'Ir al catálogo', principal: true, onClick: () => onNavigate?.('catalogo') },
          { texto: 'Ver mi cuenta', onClick: () => onNavigate?.('mis-datos') },
        ]}
        beneficios={[
          { texto: 'Guardar tus datos de entrega', icono: MapPin },
          { texto: 'Consultar tus pedidos', icono: Package },
          { texto: 'Comprar más rápido', icono: ShoppingBag },
        ]}
      />
    )
  }

  const esCuit = form.tipo_documento === 'CUIT'
  return (
    <section className="tienda-auth-card" aria-labelledby="titulo-registro" style={contenedor}>
      <h1 id="titulo-registro"><UserPlus size={26} aria-hidden="true" /> Registrarme</h1>
      <p>Creá tu cuenta para guardar tus datos de entrega y ver tus compras.</p>
      {pendiente && <Feedback>Tu cuenta ya existe. Completá o corregí tus datos para vincularla, sin registrarte otra vez.</Feedback>}
      {(error || errorRegistro) && <Feedback tone="error">{error || errorRegistro}</Feedback>}

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
            onChange={cambiar} disabled={!!pendiente} autoComplete="email" aria-invalid={!!erroresCampo.email} />
          {erroresCampo.email && <Feedback tone="error">{erroresCampo.email}</Feedback>}
        </div>

        <div>
          <label htmlFor="registro-telefono">Teléfono</label>
          <input id="registro-telefono" name="telefono" type="tel" value={form.telefono}
            onChange={cambiar} autoComplete="tel" aria-invalid={!!erroresCampo.telefono} />
          {erroresCampo.telefono && <Feedback tone="error">{erroresCampo.telefono}</Feedback>}
        </div>

        {!pendiente && <div>
          <label htmlFor="registro-password">Contraseña</label>
          <input id="registro-password" name="password" type="password" value={form.password}
            onChange={cambiar} autoComplete="new-password" minLength={LARGO_MINIMO_PASSWORD}
            aria-describedby="registro-password-ayuda" aria-invalid={!!erroresCampo.password} />
          <small id="registro-password-ayuda">Mínimo {LARGO_MINIMO_PASSWORD} caracteres.</small>
          {erroresCampo.password && <Feedback tone="error">{erroresCampo.password}</Feedback>}
        </div>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <Button type="submit" loading={enviando} loadingLabel="Registrando…">{pendiente ? 'Completar registro' : 'Crear cuenta'}</Button>
          {pendiente ? (
            <Button type="button" variant="ghost" disabled={enviando} onClick={() => salir()}>
              Usar otra cuenta
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={enviando} onClick={() => onNavigate?.('ingresar')}>
              Ya tengo cuenta
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
