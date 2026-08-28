import { PackageOpen } from 'lucide-react'

export default function EmptyState({
  description = 'Ajustá los filtros o creá el primer registro.',
  title = 'Todavía no hay registros',
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <PackageOpen size={22} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

