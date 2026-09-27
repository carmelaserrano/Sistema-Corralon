export function Skeleton({
  borderRadius = 'var(--radius-sm)',
  className = '',
  height = '1rem',
  width = '100%',
}) {
  return (
    <span
      className={`skeleton-line ${className}`.trim()}
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  )
}

export function SkeletonTable({
  columns = 5,
  rows = 5,
  className = '',
}) {
  return (
    <div className={`skeleton-table-wrapper ${className}`.trim()} aria-hidden="true">
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <span key={i} className="skeleton-line" style={{ height: '14px', width: '80%' }} />
        ))}
      </div>
      <div className="skeleton-table-body">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="skeleton-table-row">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <span
                key={cIdx}
                className="skeleton-line"
                style={{
                  height: '16px',
                  width: cIdx === 0 ? '45%' : cIdx === 1 ? '90%' : '65%',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Skeleton
