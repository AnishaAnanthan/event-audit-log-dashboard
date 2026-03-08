function LoadingSpinner({ label = "Loading", className = "" }) {
  return (
    <div className={`global-loading ${className}`.trim()} role="status" aria-live="polite" aria-label={label}>
      <span className="global-spinner" />
    </div>
  );
}

export default LoadingSpinner;
