import { useEffect, useState } from 'react';
import Dashboard from './Dashboard';
import LoginPage from './LoginPage';
import Sellers from './Sellers';

function formatVerificationStatus(status) {
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

function formatVerified(value) {
  if (value === true || value === 'true') return 'Yes';
  if (value === false || value === 'false') return 'No';
  return 'Not provided';
}

function getActiveSection() {
  return navItems.some((item) => item.href === window.location.hash)
    ? window.location.hash
    : '#dashboard';
}

const navItems = [
  { label: 'Dashboard', href: '#dashboard', badge: null },
  { label: 'Queue', href: '#queue', badge: null },
  { label: 'Sellers', href: '#sellers', badge: null },
  { label: 'Reports', href: '#reports', badge: null },
  { label: 'Audit Log', href: '#audit-log', badge: null },
  { label: 'Settings', href: '#settings', badge: null }
];

function App() {
  const [auth, setAuth] = useState(null);
  const [activeSection, setActiveSection] = useState(getActiveSection);
  const [sellers, setSellers] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  const [sellerDetails, setSellerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [queuePage, setQueuePage] = useState(1);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [queueMeta, setQueueMeta] = useState(null);
  const [queueRefresh, setQueueRefresh] = useState(0);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionInProgress, setDecisionInProgress] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    const updateActiveSection = () => {
      setActiveSection(getActiveSection());
    };

    window.addEventListener('hashchange', updateActiveSection);
    return () => window.removeEventListener('hashchange', updateActiveSection);
  }, []);

  useEffect(() => {
    if (!auth) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(activeSection.slice(1))?.scrollIntoView();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [auth, activeSection]);

  useEffect(() => {
    if (!auth?.token || activeSection !== '#queue') return undefined;

    const controller = new AbortController();
    const loadQueue = async () => {
      setQueueLoading(true);
      setQueueError('');

      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
        const queueEndpoint = import.meta.env.DEV || !apiBaseUrl
          ? '/api/admin/queue'
          : `${apiBaseUrl}/api/admin/queue`;
        const query = new URLSearchParams({ page: String(queuePage), limit: '20' });
        const response = await fetch(`${queueEndpoint}?${query}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${auth.token}` },
          signal: controller.signal
        });

        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) {
          throw new Error(`Queue API returned a non-JSON response (HTTP ${response.status}).`);
        }

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || `Unable to load seller queue (HTTP ${response.status}).`);
        }
        if (!Array.isArray(result.items)) {
          throw new Error('Queue API response is missing its items list.');
        }

        const queueItems = result.items.map((item) => {
          if (
            !item ||
            (typeof item.business_id !== 'string' && typeof item.business_id !== 'number') ||
            typeof item.name !== 'string' ||
            typeof item.verification_status !== 'string'
          ) {
            throw new Error('Queue API returned a seller with missing or invalid business_id, name, or verification_status.');
          }

          return {
            id: String(item.business_id),
            sellerId: String(item.business_id),
            name: item.name,
            status: formatVerificationStatus(item.verification_status),
            verified: item.verified
          };
        });

        setSellers(queueItems);
        setSelectedSellerId((currentId) =>
          queueItems.some((seller) => seller.id === currentId) ? currentId : queueItems[0]?.id ?? null
        );
        setQueueMeta({
          total: result.total,
          pages: result.pages,
          currentPage: result.current_page
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          setQueueError(error instanceof Error ? error.message : 'Unable to load the seller queue.');
        }
      } finally {
        if (!controller.signal.aborted) setQueueLoading(false);
      }
    };

    loadQueue();
    return () => controller.abort();
  }, [auth?.token, activeSection, queuePage, queueRefresh]);

  const selectedSeller = sellers.find((seller) => seller.id === selectedSellerId) ?? sellers[0] ?? null;

  const handleVerificationDecision = async (decision) => {
    const reason = rejectionReason.trim();
    if (decision === 'reject' && !reason) {
      setDecisionError('Enter a reason before rejecting this application.');
      setDecisionMessage('');
      return;
    }
    if (!selectedSeller) return;

    setDecisionLoading(true);
    setDecisionInProgress(decision);
    setDecisionError('');
    setDecisionMessage('');

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
      const endpoint = import.meta.env.DEV || !apiBaseUrl
        ? `/api/admin/verification/${encodeURIComponent(selectedSeller.sellerId)}/${decision}`
        : `${apiBaseUrl}/api/admin/verification/${encodeURIComponent(selectedSeller.sellerId)}/${decision}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          ...(decision === 'reject' ? { 'Content-Type': 'application/json' } : {})
        },
        ...(decision === 'reject' ? { body: JSON.stringify({ reason }) } : {})
      });

      const contentType = response.headers.get('content-type') || '';
      if (!/\bjson\b/i.test(contentType)) {
        throw new Error(`Verification API returned a non-JSON response (HTTP ${response.status}).`);
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || `Unable to ${decision} this application (HTTP ${response.status}).`);
      }

      setDecisionMessage(
        result?.message || `Successfully marked as ${decision === 'approve' ? 'approved' : 'rejected'}`
      );
      setRejectionReason('');
      setQueueRefresh((current) => current + 1);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : `Unable to ${decision} this application.`);
    } finally {
      setDecisionLoading(false);
      setDecisionInProgress('');
    }
  };

  const pageTitles = {
    '#dashboard': 'Verification analytics',
    '#queue': 'Seller verification queue',
    '#sellers': 'All sellers',
    '#reports': 'Reports',
    '#audit-log': 'Audit Log',
    '#settings': 'Settings'
  };

  useEffect(() => {
    if (!auth?.token || activeSection !== '#queue' || !selectedSeller) {
      setSellerDetails(null);
      setDetailsError('');
      return undefined;
    }

    const controller = new AbortController();
    const loadSellerDetails = async () => {
      setSellerDetails(null);
      setDetailsLoading(true);
      setDetailsError('');

      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
        const detailsEndpoint = import.meta.env.DEV || !apiBaseUrl
          ? `/api/admin/verification/${encodeURIComponent(selectedSeller.sellerId)}`
          : `${apiBaseUrl}/api/admin/verification/${encodeURIComponent(selectedSeller.sellerId)}`;
        const response = await fetch(detailsEndpoint, {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + auth.token },
          signal: controller.signal
        });

        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) {
          throw new Error(`Seller details API returned a non-JSON response (HTTP ${response.status}).`);
        }

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || `Unable to load seller details (HTTP ${response.status}).`);
        }
        if (
          !result ||
          typeof result !== 'object' ||
          (typeof result.business_id !== 'string' && typeof result.business_id !== 'number') ||
          String(result.business_id) !== selectedSeller.sellerId ||
          typeof result.name !== 'string' ||
          typeof result.verification_status !== 'string'
        ) {
          throw new Error('Seller details API returned missing or mismatched business details.');
        }

        setSellerDetails(result);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setDetailsError(error instanceof Error ? error.message : 'Unable to load seller details.');
        }
      } finally {
        if (!controller.signal.aborted) setDetailsLoading(false);
      }
    };

    loadSellerDetails();
    return () => controller.abort();
  }, [auth?.token, activeSection, selectedSeller?.sellerId]);

  return (
    <>
      {!auth ? (
        <LoginPage onLoginSuccess={setAuth} />
      ) : (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">EPS</div>
              <div className="brand-copy">
                <strong>e-Pocketshop</strong>
                <span>Admin Verification</span>
              </div>
            </div>

            <nav className="nav" aria-label="Sidebar navigation">
              {navItems.map((item, index) => (
                <a
                  className={`nav-item ${activeSection === item.href ? 'active' : ''}`}
                  aria-current={activeSection === item.href ? 'page' : undefined}
                  href={item.href}
                  key={item.label}
                >
                  {index === 0 && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 11.5L12 5l8 6.5V18a2 2 0 0 1-2 2h-3v-7H9v7H6a2 2 0 0 1-2-2v-6.5z"></path>
                    </svg>
                  )}
                  {index === 1 && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 7h16M4 12h16M4 17h10"></path>
                    </svg>
                  )}
                  {index === 2 && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 8v-1a4 4 0 0 0-3-3.87M20 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  )}
                  {index === 3 && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 18V9m6 9V5m6 13v-7"></path>
                    </svg>
                  )}
                  {index === 4 && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 20.5V7.5A2.5 2.5 0 0 1 8.5 5h7A2.5 2.5 0 0 1 18 7.5v13M9 9h6M9 13h6M9 17h4"></path>
                    </svg>
                  )}
                  {index === 5 && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 3v3m0 15v3m9-9h-3M6 12H3m15.5 6.5L16 16l-2.5 2.5 1.5 1.5 2.5-2.5zm-11-11L8 8l2.5-2.5-1.5-1.5L6.5 6.5zM16 8l1.5-1.5L16 5l-1.5 1.5L16 8zm-8 8l1.5 1.5L8 16l-1.5-1.5L8 13z"></path>
                    </svg>
                  )}
                  {item.label}
                  {item.badge && <small>{item.badge}</small>}
                </a>
              ))}
            </nav>

            <div className="sidebar-bottom">
              <div className="sidebar-footer">
                <span className="label">Current account</span>
                <strong>{auth.admin.role || 'Admin'}</strong>
                <span>{auth.admin.email}</span>
              </div>
              <button className="logout-button sidebar-logout" type="button" onClick={() => setAuth(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M15 12H3"></path>
                  <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"></path>
                </svg>
                Log out
              </button>
            </div>
          </aside>

          <main className="main">
            <header className="topbar">
              <div className="topbar-title">
                <span>Admin portal</span>
                <h2>{pageTitles[activeSection] || pageTitles['#dashboard']}</h2>
              </div>

              <div className="topbar-actions">
                <button className="icon-button" type="button" aria-label="Notifications">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0"></path>
                  </svg>
                </button>

                <div className="user-pill">
                  <div className="avatar">{auth.admin.email?.[0]?.toUpperCase() || 'A'}</div>
                  <div>
                    <strong>{auth.admin.email}</strong>
                    <small>{auth.admin.role}</small>
                  </div>
                </div>
              </div>
            </header>

            {activeSection === '#dashboard' && <Dashboard token={auth.token} />}

            {activeSection === '#queue' && <section className="content-layout" id="queue">
              <div className="panel">
                <div className="panel-header">
                  <h3>Seller queue</h3>
                  <div className="panel-tools">
                    <span className="meta">Pending queue</span>
                    <button className="pill" type="button" onClick={() => setQueueRefresh((current) => current + 1)} disabled={queueLoading}>
                      {queueLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                </div>

                {decisionError && <p className="decision-error queue-decision-feedback" role="alert">{decisionError}</p>}
                {decisionMessage && <p className="decision-message queue-decision-feedback" role="status">{decisionMessage}</p>}
                {queueMeta && (
                  <p className="queue-summary">
                    {queueMeta.total} sellers · page {queueMeta.currentPage} of {queueMeta.pages}
                  </p>
                )}

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Seller</th>
                        <th>Business ID</th>
                        <th>Status</th>
                        <th>Verified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueLoading && (
                        <tr><td colSpan="4">Loading queue…</td></tr>
                      )}
                      {!queueLoading && queueError && (
                        <tr><td colSpan="4" role="alert">{queueError}</td></tr>
                      )}
                      {!queueLoading && !queueError && sellers.length === 0 && (
                        <tr><td colSpan="4">No sellers are waiting for verification.</td></tr>
                      )}
                      {sellers.map((seller) => (
                        <tr
                          className={seller.id === selectedSeller?.id ? 'selected' : ''}
                          key={seller.id}
                          onClick={() => {
                            setSelectedSellerId(seller.id);
                            setDecisionError('');
                            setDecisionMessage('');
                            setRejectionReason('');
                          }}
                        >
                          <td>
                            <div className="seller-id">
                              <div className="seller-avatar">{seller.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
                              <div className="seller-name">{seller.name}</div>
                            </div>
                          </td>
                          <td>{seller.sellerId}</td>
                          <td><span className={`chip ${statusClass(seller.status)}`}>{seller.status}</span></td>
                          <td>{formatVerified(seller.verified)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {queueMeta && queueMeta.pages > 1 && (
                  <div className="pagination">
                    <button
                      className="pill"
                      type="button"
                      onClick={() => setQueuePage((page) => Math.max(1, page - 1))}
                      disabled={queueLoading || queuePage <= 1}
                    >
                      Previous
                    </button>
                    <span className="meta">Page {queueMeta.currentPage} of {queueMeta.pages}</span>
                    <button
                      className="pill"
                      type="button"
                      onClick={() => setQueuePage((page) => Math.min(queueMeta.pages, page + 1))}
                      disabled={queueLoading || queuePage >= queueMeta.pages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              <aside className="panel review-panel">
                {selectedSeller ? (
                  <>
                    <div className="review-header">
                      <div>
                        <h3>{sellerDetails?.name ?? selectedSeller.name}</h3>
                        <div className="meta">Business #{selectedSeller.sellerId}</div>
                      </div>
                      <span className={`chip ${statusClass(sellerDetails?.verification_status ?? selectedSeller.status)}`}>
                        {formatVerificationStatus(sellerDetails?.verification_status ?? selectedSeller.status)}
                      </span>
                    </div>

                    <div className="details-grid">
                      <div className="info-block">
                        <span className="info-label">Business ID</span>
                        <p className="info-value">{sellerDetails?.business_id ?? selectedSeller.sellerId}</p>
                      </div>
                      <div className="info-block">
                        <span className="info-label">Verified</span>
                        <p className="info-value">{formatVerified(selectedSeller.verified)}</p>
                      </div>
                    </div>
                    {detailsLoading && <p className="meta" role="status">Loading business details and documents…</p>}
                    {detailsError && <p className="meta" role="alert">{detailsError}</p>}
                    {sellerDetails && (
                      <>
                        {sellerDetails.description && (
                          <div className="info-block seller-description">
                            <span className="info-label">Description</span>
                            <p className="info-value">{sellerDetails.description}</p>
                          </div>
                        )}
                        {sellerDetails.address && (
                          <div className="info-block seller-address">
                            <span className="info-label">Address</span>
                            <p className="info-value">{sellerDetails.address}</p>
                          </div>
                        )}
                        {sellerDetails.documents &&
                          typeof sellerDetails.documents === 'object' &&
                          !Array.isArray(sellerDetails.documents) && (
                          <section className="seller-documents" aria-label="Seller documents">
                            <h4>Documents</h4>
                            <div className="doc-grid">
                              {Object.entries(sellerDetails.documents).map(([key, url]) => {
                                if (typeof url !== 'string' || !url) return null;
                                const label = key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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
                      </>
                    )}
                    <div className="verification-actions" aria-busy={decisionLoading}>
                      <label htmlFor="rejection-reason">Rejection reason (required to reject)</label>
                      <textarea
                        id="rejection-reason"
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        placeholder="Explain why this application is being rejected"
                        disabled={decisionLoading}
                      />
                      <div className="action-row">
                        <button
                          className="primary-btn"
                          type="button"
                          onClick={() => handleVerificationDecision('approve')}
                          disabled={decisionLoading}
                        >
                          {decisionInProgress === 'approve' ? 'Approving…' : 'Approve application'}
                        </button>
                        <button
                          className="ghost-btn"
                          type="button"
                          onClick={() => handleVerificationDecision('reject')}
                          disabled={decisionLoading}
                        >
                          {decisionInProgress === 'reject' ? 'Rejecting…' : 'Reject application'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-review">
                    <h3>{queueError ? 'Seller details unavailable' : 'No seller selected'}</h3>
                    <p className="meta">{queueError || (queueLoading ? 'Loading seller queue…' : 'Select a seller from the queue to view details.')}</p>
                  </div>
                )}
              </aside>
            </section>}

            {activeSection === '#sellers' && <Sellers token={auth.token} />}

            {activeSection === '#reports' && <section className="panel workspace-placeholder" id="reports" aria-labelledby="reports-title">
              <div className="panel-header"><h3 id="reports-title">Reports</h3></div>
              <p>Detailed reports are not available yet. Current verification totals are shown on the Dashboard.</p>
              <a href="#dashboard">View dashboard metrics</a>
            </section>}

            {activeSection === '#audit-log' && <section className="panel workspace-placeholder" id="audit-log" aria-labelledby="audit-log-title">
              <div className="panel-header"><h3 id="audit-log-title">Audit Log</h3></div>
              <p>The audit log is not available yet because no audit-log data source is connected.</p>
            </section>}

            {activeSection === '#settings' && <section className="panel workspace-placeholder" id="settings" aria-labelledby="settings-title">
              <div className="panel-header"><h3 id="settings-title">Settings</h3></div>
              <p>Portal settings are not available yet. No settings screen or API is configured.</p>
            </section>}
          </main>
        </div>
      )}

    </>
  );
}

export default App;