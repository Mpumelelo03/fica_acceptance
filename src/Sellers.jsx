import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from './api';
import AuditLogs from './AuditLogs';

const pageSize = 20;
const allStatuses = ['pending', 'pending_merchant', 'pending_business', 'approved', 'rejected', 'not_submitted'];

function formatLabel(value) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStatus(status) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status) {
  const normalizedStatus = status.toLowerCase().replace(/_/g, ' ');
  if (normalizedStatus.includes('pending')) return 'pending';
  if (normalizedStatus.includes('review')) return 'review';
  if (normalizedStatus.includes('flagged')) return 'flagged';
  if (normalizedStatus.includes('rejected')) return 'high';
  if (normalizedStatus.includes('approved')) return 'approved';
  if (normalizedStatus.includes('not submitted')) return 'low';
  return 'normal';
}

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value === null || value === undefined || value === '') return 'Not provided';
  return String(value);
}

function formatVerified(value) {
  if (value === 'merchant') return 'Tier 1 · Merchant';
  if (value === 'business') return 'Tier 2 · Business';
  return formatValue(value);
}

async function loadQueuePage({ token, status, tier, page, limit, signal }) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit), status });
  if (tier) query.set('tier', tier);
  const response = await fetch(`${apiUrl('/api/admin/queue')}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });

  const contentType = response.headers.get('content-type') || '';
  if (!/\bjson\b/i.test(contentType)) {
    throw new Error(`Sellers API returned a non-JSON response (HTTP ${response.status}).`);
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.message || `Unable to load sellers (HTTP ${response.status}).`);
  }
  if (
    !Array.isArray(result?.items) ||
    !Number.isInteger(result.total) || result.total < 0 ||
    !Number.isInteger(result.pages) || result.pages < 0 ||
    !Number.isInteger(result.current_page) || result.current_page < 1 ||
    (result.pages > 0 && result.current_page > result.pages)
  ) {
    throw new Error('Queue API response is missing valid items or pagination details.');
  }

  const items = result.items.map((seller) => {
    if (
      !seller ||
      (typeof seller.business_id !== 'string' && typeof seller.business_id !== 'number') ||
      typeof seller.name !== 'string' ||
      typeof seller.verification_status !== 'string'
    ) {
      throw new Error('Queue API returned a seller with missing or invalid business_id, name, or verification_status.');
    }

    return {
      ...seller,
      tier: seller.tier || (
        seller.verification_status.includes('business') || seller.verified === 'business'
          ? 'business'
          : 'merchant'
      )
    };
  });

  return { ...result, items };
}

function SellerDetails({ token, sellerId }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const loadDetails = async () => {
      setLoading(true);
      setError('');
      setDetails(null);
      try {
        const response = await fetch(
          apiUrl(`/api/admin/verification/${encodeURIComponent(sellerId)}`),
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal
          }
        );
        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) {
          throw new Error(`Business details API returned a non-JSON response (HTTP ${response.status}).`);
        }
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || `Unable to load business details (HTTP ${response.status}).`);
        }
        if (
          !result ||
          String(result.business_id) !== sellerId ||
          typeof result.name !== 'string' ||
          typeof result.verification_status !== 'string' ||
          !['merchant', 'business'].includes(result.current_tier)
        ) {
          throw new Error('Business details API returned missing or invalid business details or current_tier.');
        }
        setDetails(result);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load business details.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadDetails();
    return () => controller.abort();
  }, [sellerId, token]);

  if (loading) return <p className="meta" role="status">Loading full business details…</p>;
  if (error) return <p className="dashboard-error" role="alert">{error}</p>;
  if (!details) return null;

  const documentEntries = details.documents &&
    typeof details.documents === 'object' &&
    !Array.isArray(details.documents)
    ? Object.entries(details.documents).filter(([, url]) => typeof url === 'string' && url)
    : [];
  const detailEntries = Object.entries(details).filter(([key, value]) =>
    !['business_id', 'name', 'verification_status', 'verified', 'current_tier', 'rejection_reason', 'documents'].includes(key) &&
    value !== null &&
    value !== undefined &&
    value !== ''
  );

  return (
    <div className="seller-full-details">
      <div className="seller-facts">
        <div className="info-block">
          <span className="info-label">Current tier</span>
          <p className="info-value">{details.current_tier}</p>
        </div>
        <div className="info-block">
          <span className="info-label">Verified</span>
          <p className="info-value">{formatVerified(details.verified)}</p>
        </div>
        {detailEntries.map(([key, value]) => (
          <div className="info-block" key={key}>
            <span className="info-label">{formatLabel(key)}</span>
            <p className="info-value">{formatValue(value)}</p>
          </div>
        ))}
      </div>
      {details.rejection_reason && (
        <div className="info-block seller-description">
          <span className="info-label">Latest rejection reason</span>
          <p className="info-value">{details.rejection_reason}</p>
        </div>
      )}
      {documentEntries.length > 0 && (
        <section className="seller-documents" aria-label={`Documents for ${details.name}`}>
          <h4>Documents</h4>
          <div className="doc-grid">
            {documentEntries.map(([key, url]) => {
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
      <AuditLogs token={token} businessId={sellerId} embedded />
    </div>
  );
}

function Sellers({ token }) {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [tier, setTier] = useState('');
  const [pagination, setPagination] = useState(null);
  const [expandedSellerId, setExpandedSellerId] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!token || status !== 'all') return undefined;

    const controller = new AbortController();
    const loadAllSellers = async () => {
      setLoading(true);
      setError('');

      try {
        const statusResults = await Promise.all(allStatuses.map(async (queueStatus) => {
          const firstPage = await loadQueuePage({
            token,
            status: queueStatus,
            tier,
            page: 1,
            limit: 100,
            signal: controller.signal
          });
          const items = [...firstPage.items];
          for (let currentPage = 2; currentPage <= firstPage.pages; currentPage += 1) {
            const result = await loadQueuePage({
              token,
              status: queueStatus,
              tier,
              page: currentPage,
              limit: 100,
              signal: controller.signal
            });
            items.push(...result.items);
          }
          return items;
        }));

        const uniqueSellers = new Map();
        statusResults.flat().forEach((seller) => {
          const sellerId = String(seller.business_id);
          const previous = uniqueSellers.get(sellerId);
          if (
            !previous ||
            (previous.verification_status === 'pending' && seller.verification_status !== 'pending')
          ) {
            uniqueSellers.set(sellerId, seller);
          }
        });
        const allSellers = [...uniqueSellers.values()].sort((first, second) =>
          first.name.localeCompare(second.name)
        );
        setSellers(allSellers);
        setPagination({
          total: allSellers.length,
          pages: Math.ceil(allSellers.length / pageSize),
          currentPage: 1
        });
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load businesses and sellers.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadAllSellers();
    return () => controller.abort();
  }, [token, status, tier, refreshCount]);

  useEffect(() => {
    if (!token || status === 'all') return undefined;

    const controller = new AbortController();
    const loadSellers = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await loadQueuePage({
          token,
          status,
          tier,
          page,
          limit: pageSize,
          signal: controller.signal
        });
        setSellers(result.items);
        setPagination({
          total: result.total,
          pages: result.pages,
          currentPage: result.current_page
        });
        if (result.current_page !== page) setPage(result.current_page);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load sellers.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadSellers();
    return () => controller.abort();
  }, [token, status, tier, page, refreshCount]);

  useEffect(() => {
    const refresh = () => setRefreshCount((count) => count + 1);
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const filteredSellers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sellers;
    return sellers.filter((seller) =>
      Object.values(seller).some((value) => formatValue(value).toLowerCase().includes(query))
    );
  }, [search, sellers]);

  useEffect(() => {
    if (status !== 'all') return;
    const lastPage = Math.max(1, Math.ceil(filteredSellers.length / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [filteredSellers.length, page, status]);

  const visibleSellers = status === 'all'
    ? filteredSellers.slice((page - 1) * pageSize, page * pageSize)
    : filteredSellers;
  const visiblePagination = status === 'all'
    ? {
        total: filteredSellers.length,
        pages: Math.ceil(filteredSellers.length / pageSize),
        currentPage: page
      }
    : pagination;

  return (
    <section id="sellers" aria-label="Businesses and sellers">
      <div className="page-heading seller-directory-heading">
        <p className="meta">Browse all businesses and sellers by verification status and tier.</p>
        <button
          className="pill"
          type="button"
          onClick={() => setRefreshCount((count) => count + 1)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="seller-filters">
        <label>
          <span>Verification status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
              setExpandedSellerId(null);
            }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="pending_merchant">Pending merchant tier</option>
            <option value="pending_business">Pending business tier</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="not_submitted">Not submitted</option>
          </select>
        </label>
        <label>
          <span>Verification tier</span>
          <select
            value={tier}
            onChange={(event) => {
              setTier(event.target.value);
              setPage(1);
              setExpandedSellerId(null);
            }}
          >
            <option value="">All tiers</option>
            <option value="merchant">Tier 1 · Merchant</option>
            <option value="business">Tier 2 · Business</option>
          </select>
        </label>
        <label className="seller-search">
          <span>Search businesses and sellers</span>
          <input
            type="search"
            placeholder="Search name or business details"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {loading && <p className="meta" role="status">Loading businesses and sellers…</p>}
      {visiblePagination && (
        <p className="queue-summary">
          {visiblePagination.total} businesses and sellers
          {visiblePagination.pages > 0 && ` · page ${visiblePagination.currentPage} of ${visiblePagination.pages}`}
        </p>
      )}
      {!loading && !error && visibleSellers.length === 0 && (
        <div className="panel empty-state">
          <p>{search
            ? 'No businesses or sellers match your search.'
            : 'No businesses or sellers found for these filters.'}</p>
        </div>
      )}

      <div className="seller-directory" aria-busy={loading}>
        {visibleSellers.map((seller) => {
          const sellerId = String(seller.business_id);
          const details = Object.entries(seller).filter(([key, value]) =>
            !['business_id', 'name', 'verification_status', 'verified', 'documents', 'tier'].includes(key) &&
            value !== null &&
            value !== undefined &&
            value !== ''
          );
          const documents = seller.documents &&
            typeof seller.documents === 'object' &&
            !Array.isArray(seller.documents)
            ? Object.entries(seller.documents).filter(([, url]) => typeof url === 'string' && url)
            : [];
          const expanded = expandedSellerId === sellerId;

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
                  <span className="info-label">Tier</span>
                  <p className="info-value">{seller.tier === 'business' ? 'Tier 2 · Business' : 'Tier 1 · Merchant'}</p>
                </div>
                <div className="info-block">
                  <span className="info-label">Verified</span>
                  <p className="info-value">{formatVerified(seller.verified)}</p>
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
              <button
                className="secondary-btn seller-details-toggle"
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedSellerId(expanded ? null : sellerId)}
              >
                {expanded ? 'Hide full details and history' : 'View full details and history'}
              </button>
              {expanded && <SellerDetails token={token} sellerId={sellerId} />}
            </article>
          );
        })}
      </div>
      {visiblePagination && visiblePagination.pages > 1 && (
        <div className="pagination">
          <button
            className="pill"
            type="button"
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={loading || visiblePagination.currentPage <= 1}
          >
            Previous
          </button>
          <span className="meta">Page {visiblePagination.currentPage} of {visiblePagination.pages}</span>
          <button
            className="pill"
            type="button"
            onClick={() => setPage((currentPage) => Math.min(visiblePagination.pages, currentPage + 1))}
            disabled={loading || visiblePagination.currentPage >= visiblePagination.pages}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

export default Sellers;
