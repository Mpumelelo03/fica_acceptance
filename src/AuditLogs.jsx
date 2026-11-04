import { useEffect, useState } from 'react';

const pageSize = 20;
const actions = [
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
  { value: 'create_admin', label: 'Create admin' },
  { value: 'update_admin', label: 'Update admin' },
  { value: 'deactivate_admin', label: 'Deactivate admin' }
];

function getEndpoint() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
  return import.meta.env.DEV || !apiBaseUrl
    ? '/api/admin/audit-logs'
    : `${apiBaseUrl}/api/admin/audit-logs`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatAction(value) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function validateLog(entry) {
  if (
    !entry ||
    (typeof entry.log_id !== 'string' && typeof entry.log_id !== 'number') ||
    typeof entry.action !== 'string' ||
    typeof entry.timestamp !== 'string'
  ) {
    throw new Error('Audit log API returned an entry with missing or invalid log_id, action, or timestamp.');
  }
  return entry;
}

function AuditLogs({ token }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState({ action: '', admin_id: '', business_id: '' });
  const [filters, setFilters] = useState({ action: '', admin_id: '', business_id: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadAuditLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const query = new URLSearchParams({ page: String(page), limit: String(pageSize) });
        Object.entries(filters).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        const response = await fetch(`${getEndpoint()}?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });

        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) {
          throw new Error(`Audit log API returned a non-JSON response (HTTP ${response.status}).`);
        }

        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error('Audit log API returned an invalid response.');
        }
        if (!response.ok) {
          throw new Error(result?.message || `Unable to load audit logs (HTTP ${response.status}).`);
        }
        if (
          !Array.isArray(result.items) ||
          !Number.isInteger(result.total) || result.total < 0 ||
          !Number.isInteger(result.pages) || result.pages < 0 ||
          !Number.isInteger(result.current_page) || result.current_page < 1
        ) {
          throw new Error('Audit log API response is missing a valid total, pages, current_page, or items list.');
        }

        setLogs(result.items.map(validateLog));
        setTotal(result.total);
        setPages(result.pages);
        setCurrentPage(result.current_page);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load audit logs.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadAuditLogs();
    return () => controller.abort();
  }, [filters, page, refresh, token]);

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    setPage(1);
    setFilters({
      action: draftFilters.action,
      admin_id: draftFilters.admin_id.trim(),
      business_id: draftFilters.business_id.trim()
    });
  };

  const clearFilters = () => {
    setDraftFilters({ action: '', admin_id: '', business_id: '' });
    setFilters({ action: '', admin_id: '', business_id: '' });
    setPage(1);
  };

  return (
    <section className="audit-management" id="audit-log" aria-label="Admin audit log" aria-busy={loading}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Admin activity</span>
          <p className="meta">Review verification decisions and admin account changes.</p>
        </div>
        <button className="pill" type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="admin-feedback admin-error" role="alert">{error}</p>}

      <form className="panel audit-filters" onSubmit={handleFilterSubmit}>
        <label>
          Action
          <select
            value={draftFilters.action}
            onChange={(event) => setDraftFilters({ ...draftFilters, action: event.target.value })}
          >
            <option value="">All actions</option>
            {actions.map((action) => <option value={action.value} key={action.value}>{action.label}</option>)}
          </select>
        </label>
        <label>
          Admin ID
          <input
            type="text"
            value={draftFilters.admin_id}
            onChange={(event) => setDraftFilters({ ...draftFilters, admin_id: event.target.value })}
            placeholder="Filter by acting admin UUID"
          />
        </label>
        <label>
          Business ID
          <input
            type="number"
            min="1"
            step="1"
            value={draftFilters.business_id}
            onChange={(event) => setDraftFilters({ ...draftFilters, business_id: event.target.value })}
            placeholder="Filter by seller ID"
          />
        </label>
        <div className="audit-filter-actions">
          <button className="primary-btn" type="submit" disabled={loading}>Apply filters</button>
          <button className="secondary-btn" type="button" onClick={clearFilters} disabled={loading}>Clear</button>
        </div>
      </form>

      <div className="panel audit-directory">
        <div className="panel-header">
          <div>
            <h3>Activity history</h3>
            <p className="meta">{loading ? 'Loading audit entries…' : `${total} entr${total === 1 ? 'y' : 'ies'}`}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>Result</th>
                <th>Details</th>
                <th>IP address</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="7">Loading audit entries…</td></tr>}
              {!loading && error && <tr><td colSpan="7">Audit entries could not be loaded.</td></tr>}
              {!loading && !error && logs.length === 0 && <tr><td colSpan="7">No audit entries found.</td></tr>}
              {!loading && !error && logs.map((entry) => (
                <tr key={entry.log_id}>
                  <td>{formatDate(entry.timestamp)}</td>
                  <td>
                    <strong>{entry.admin_name || 'Unknown admin'}</strong>
                    {entry.admin_email && <span className="audit-subtext">{entry.admin_email}</span>}
                  </td>
                  <td><span className="chip review">{formatAction(entry.action)}</span></td>
                  <td>
                    {entry.target_business_id != null
                      ? <>{entry.business_name || 'Business'} <span className="audit-subtext">#{entry.target_business_id}</span></>
                      : 'Admin account'}
                  </td>
                  <td>{entry.result_returned || '—'}</td>
                  <td className="audit-details">{entry.details || '—'}</td>
                  <td>{entry.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && (
          <div className="pagination">
            <button
              className="pill"
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span className="meta">Page {pages === 0 ? 0 : currentPage} of {pages}</span>
            <button
              className="pill"
              type="button"
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
              disabled={pages === 0 || currentPage >= pages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default AuditLogs;
