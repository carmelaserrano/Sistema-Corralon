export default function Feedback({ children, tone = 'info' }) {
  return (
    <p
      className={`feedback feedback-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  )
}

