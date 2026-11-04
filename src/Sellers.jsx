import { useEffect, useMemo, useState } from 'react';

function formatLabel(value) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStatus(status) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status) {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus.includes('pending')) return 'pending';
  if (normalizedStatus.includes('review')) return 'review';
  if (normalizedStatus.includes('flagged')) return 'flagged';
  if (normalizedStatus.includes('approved')) return 'approved';
  return 'normal';
}

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value === null || value === undefined || value === '') return 'Not provided';
  return String(value);
}

function Sellers({ token }) {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!token) return undefined;

    const controller = new AbortController();
    const loadSellers = async () => {
      setLoading(true);
      setError('');

      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
        const endpoint = import.meta.env.DEV || !apiBaseUrl
          ? '/api/admin/queue'
          : `${apiBaseUrl}/api/admin/queue`;
        const query = new URLSearchParams({
          page: String(page),
          limit: '20',
          status: 'pending'
        });
        const response = await fetch(`${endpoint}?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });

        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) {
          throw new Error(`Sellers API returned a non-JSON response (HTTP ${response.status}).`);
        }

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || `Unable to load sellers (HTTP ${response.status}).`);
        }

        if (!Array.isArray(result?.items)) {
          throw new Error('Queue API response is missing its items list.');
        }
        if (
          !Number.isInteger(result.total) ||
          result.total < 0 ||
          !Number.isInteger(result.pages) ||
          result.pages < 0 ||
          !Number.isInteger(result.current_page) ||
          result.current_page < 1 ||
          (result.pages > 0 && result.current_page > result.pages)
        ) {
          throw new Error('Queue API response is missing valid pagination details.');
        }

        const validSellers = result.items.map((seller) => {
          if (
            !seller ||
            (typeof seller.business_id !== 'string' && typeof seller.business_id !== 'number') ||
            typeof seller.name !== 'string' ||
            typeof seller.verification_status !== 'string'
          ) {
            throw new Error('Queue API returned a seller with missing or invalid business_id, name, or verification_status.');
          }
          return seller;
        });

        setSellers(validSellers);
        setPagination({
          total: result.total,
          pages: result.pages,
          currentPage: result.current_page
        });
        if (result.current_page !== page) setPage(result.current_page);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load the seller queue.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadSellers();
    return () => controller.abort();
  }, [token, page, refreshCount]);

  const visibleSellers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sellers;
    return sellers.filter((seller) =>
      Object.values(seller).some((value) => formatValue(value).toLowerCase().includes(query))
    );
  }, [search, sellers]);

  return (
    <section id="sellers" aria-labelledby="sellers-title">
      <div className="page-heading">
        <div>
          <p className="meta">Search applies to the current page of queue results.</p>
        </div>
        <button
          className="pill"
          type="button"
          onClick={() => setRefreshCount((count) => count + 1)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <label className="seller-search">
        <span className="visually-hidden">Search sellers</span>
        <input
          type="search"
          placeholder="Search seller details"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {loading && <p className="meta" role="status">Loading sellers…</p>}
      {pagination && (
        <p className="queue-summary">
          {pagination.total} sellers
          {pagination.pages > 0 && ` · page ${pagination.currentPage} of ${pagination.pages}`}
        </p>
      )}
      {!loading && !error && visibleSellers.length === 0 && (
        <div className="panel empty-state">
          <p>{search
            ? 'No sellers on this page match your search.'
            : 'The API returned no sellers with pending verification.'}</p>
        </div>
      )}

      <div className="seller-directory" aria-busy={loading}>
        {visibleSellers.map((seller) => {
          const sellerId = String(seller.business_id);
          const details = Object.entries(seller).filter(([key, value]) =>
            !['business_id', 'name', 'verification_status', 'verified', 'documents'].includes(key) &&
            value !== null &&
            value !== undefined &&
            value !== ''
          );
          const documents = seller.documents &&
            typeof seller.documents === 'object' &&
            !Array.isArray(seller.documents)
            ? Object.entries(seller.documents).filter(([, url]) => typeof url === 'string' && url)
            : [];

          return (
            <article className="panel seller-card" key={sellerId}>
              <div className="review-header">
                <div>
                  <h3>{seller.name}</h3>
                  <div className="meta">Business #{sellerId}</div>
                </div>
                <span className={`chip ${statusClass(seller.verification_status)}`}>
                  {formatStatus(seller.verification_status)}
                </span>
              </div>
              <div className="seller-facts">
                <div className="info-block">
                  <span className="info-label">Business ID</span>
                  <p className="info-value">{sellerId}</p>
                </div>
                <div className="info-block">
                  <span className="info-label">Verified</span>
                  <p className="info-value">{formatValue(seller.verified)}</p>
                </div>
                {details.map(([key, value]) => (
                  <div className="info-block" key={key}>
                    <span className="info-label">{formatLabel(key)}</span>
                    <p className="info-value">{formatValue(value)}</p>
                  </div>
                ))}
              </div>
              {documents.length > 0 && (
                <section className="seller-documents" aria-label={`Documents for ${seller.name}`}>
                  <h4>Documents</h4>
                  <div className="doc-grid">
                    {documents.map(([key, url]) => {
                      const label = formatLabel(key);
                      return (
                        <article className="doc-card" key={key}>
                          <a className="doc-preview" href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={label} />
                          </a>
                          <div className="doc-meta">
                            <span>{label}</span>
                            <a href={url} target="_blank" rel="noreferrer">Open</a>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </article>
          );
        })}
      </div>
      {pagination && pagination.pages > 1 && (
        <div className="pagination">
          <button
            className="pill"
            type="button"
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={loading || pagination.currentPage <= 1}
          >
            Previous
          </button>
          <span className="meta">Page {pagination.currentPage} of {pagination.pages}</span>
          <button
            className="pill"
            type="button"
            onClick={() => setPage((currentPage) => Math.min(pagination.pages, currentPage + 1))}
            disabled={loading || pagination.currentPage >= pagination.pages}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

export default Sellers;
