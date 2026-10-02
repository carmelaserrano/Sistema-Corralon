export default function KpiCard({
  className = '',
  helperText,
  icon: Icon,
  label,
  loading = false,
  tone = 'default',
  value,
}) {
  return (
    <div className={`kpi-card kpi-card-${tone} ${className}`.trim()}>
      <div className="kpi-card-header">
        <span className="kpi-card-label">{label}</span>
        {Icon && (
          <span className="kpi-card-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
      </div>

      <div className="kpi-card-body">
        {loading ? (
          <span className="skeleton-line skeleton-value" aria-hidden="true" />
        ) : (
          <strong className="kpi-card-value">{value ?? '—'}</strong>
        )}
        {helperText && <p className="kpi-card-helper">{helperText}</p>}
      </div>
    </div>
  )
}
