export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginare">
      <button type="button" className="btn btn-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ Înapoi</button>
      <span>Pagina {page} din {totalPages}</span>
      <button type="button" className="btn btn-small" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Înainte ›</button>
    </nav>
  );
}
