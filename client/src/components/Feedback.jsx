export function Loading({ text = 'Se încarcă…' }) {
  return <p className="muted">{text}</p>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <span>{error.message ?? String(error)}</span>
      {onRetry && <button type="button" className="btn btn-small" onClick={onRetry}>Reîncearcă</button>}
    </div>
  );
}
