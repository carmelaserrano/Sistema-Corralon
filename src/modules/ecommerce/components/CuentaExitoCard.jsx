import { ArrowRight, Check } from 'lucide-react'
import Button from '../../../components/ui/Button'

export default function CuentaExitoCard({ tituloId, titulo, saludo, descripcion, acciones, beneficios }) {
  return (
    <section className="tienda-auth-card tienda-cuenta-exito" aria-labelledby={tituloId}>
      <div className="tienda-cuenta-exito-badge" aria-hidden="true">
        <Check size={38} strokeWidth={2.5} />
      </div>
      <p className="tienda-cuenta-exito-saludo">{saludo}</p>
      <h1 id={tituloId}>{titulo}</h1>
      <p className="tienda-cuenta-exito-descripcion" role="status">{descripcion}</p>
      <div className="tienda-cuenta-exito-acciones">
        {acciones.map(({ texto, onClick, principal }) => (
          <Button key={texto} type="button" variant={principal ? 'primary' : 'ghost'} onClick={onClick}>
            {texto}{principal && <> <ArrowRight size={18} aria-hidden="true" /></>}
          </Button>
        ))}
      </div>
      <div className="tienda-cuenta-exito-beneficios">
        <h2>Todo más simple con tu cuenta</h2>
        <ul>
          {beneficios.map(({ texto, icono: Icono }) => (
            <li key={texto}><Icono size={20} aria-hidden="true" /><span>{texto}</span></li>
          ))}
        </ul>
      </div>
    </section>
  )
}
