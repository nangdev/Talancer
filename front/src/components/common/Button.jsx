export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  onClick,
  disabled = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-ghost'}`}
    >
      {children}
    </button>
  )
}
