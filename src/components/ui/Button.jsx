export default function Button({
  children,
  className = '',
  icon: Icon,
  loading = false,
  loadingLabel = 'Procesando…',
  variant = 'primary',
  ...props
}) {
  return (
    <button
      className={`button button-${variant} ${className}`.trim()}
      {...props}
      disabled={loading || props.disabled}
    >
      {Icon && <Icon size={17} aria-hidden="true" />}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  )
}
