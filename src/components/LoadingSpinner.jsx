/**
 * LoadingSpinner — shared loading indicator
 *
 * Usage:
 *   <LoadingSpinner />                  // full-page centred (default)
 *   <LoadingSpinner size="sm" />        // small inline spinner
 *   <LoadingSpinner label="Saving…" />  // custom label
 *   <LoadingSpinner fullPage={false} /> // inline, no full-page wrapper
 */
export default function LoadingSpinner({
  size = 'md',
  label = 'Loading…',
  fullPage = true,
}) {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-4',
  }

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`${sizeClasses[size]} rounded-full border-brand-200 border-t-brand-600 animate-spin`}
        role="status"
        aria-label={label}
      />
      {label && (
        <p className="text-sm text-brand-400 font-body">{label}</p>
      )}
    </div>
  )

  if (!fullPage) return spinner

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      {spinner}
    </div>
  )
}
