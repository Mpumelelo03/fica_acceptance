import { useEffect, useState } from 'react';
import AdminUsers from './AdminUsers';
import AuditLogs from './AuditLogs';
import Dashboard from './Dashboard';
import LoginPage from './LoginPage';
import Sellers from './Sellers';
import { apiUrl } from './api';

const authStorageKey = 'fica-admin-auth';

function getStoredAuth() {
  try {
    const storedAuth = window.localStorage.getItem(authStorageKey);
    if (!storedAuth) return null;

    const auth = JSON.parse(storedAuth);
    if (
      typeof auth?.token === 'string' &&
      auth.token &&
      typeof auth.admin?.email === 'string' &&
      ['Admin', 'SuperAdmin'].includes(auth.admin.role)
    ) {
      return auth;
    }

    window.localStorage.removeItem(authStorageKey);
    console.warn('Removed an invalid saved admin session.');
  } catch (error) {
    console.error('Unable to restore the saved admin session.', error);
  }
  return null;
}

function formatVerificationStatus(status) {
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

function formatVerified(value) {
  if (value === 'merchant') return 'Tier 1 · Merchant';
  if (value === 'business') return 'Tier 2 · Business';
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
  { label: 'Audit Log', href: '#audit-log', badge: null },
  { label: 'Team & Admins', href: '#team-management', badge: null }
];

function App() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [authStorageError, setAuthStorageError] = useState('');
  const [activeSection, setActiveSection] = useState(getActiveSection);
  const [sellers, setSellers] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  const [sellerDetails, setSellerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [queuePage, setQueuePage] = useState(1);
  const [queueTier, setQueueTier] = useState('');
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [queueMeta, setQueueMeta] = useState(null);
  const [queueRefresh, setQueueRefresh] = useState(0);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionInProgress, setDecisionInProgress] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const handleLoginSuccess = (session) => {
    setAuth(session);
    setAuthStorageError('');
    try {
      window.localStorage.setItem(authStorageKey, JSON.stringify(session));
    } catch (error) {
      console.error('Unable to persist the admin session.', error);
      setAuthStorageError('Your session is active, but could not be saved for the next visit.');
    }
  };

  const handleLogout = () => {
    setAuth(null);
    setAuthStorageError('');
    try {
      window.localStorage.removeItem(authStorageKey);
    } catch (error) {
      console.error('Unable to clear the saved admin session.', error);
      setAuthStorageError('The saved session could not be cleared from this browser.');
    }
  };

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
    if (auth && auth.admin.role !== 'SuperAdmin' && activeSection === '#team-management') {
      window.location.hash = '#dashboard';
      setActiveSection('#dashboard');
    }
  }, [auth, activeSection]);

  useEffect(() => {
    if (!auth?.token || activeSection !== '#queue') return undefined;

    const controller = new AbortController();
    const loadQueue = async () => {
      setQueueLoading(true);
      setQueueError('');

      try {
        const query = new URLSearchParams({
          page: String(queuePage),
          limit: '20',
          status: 'pending'
        });
        if (queueTier) query.set('tier', queueTier);
        const response = await fetch(`${apiUrl('/api/admin/queue')}?${query}`, {
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
        if (
          !Array.isArray(result.items) ||
          !Number.isInteger(result.total) || result.total < 0 ||
          !Number.isInteger(result.pages) || result.pages < 0 ||
          !Number.isInteger(result.current_page) || result.current_page < 1 ||
          (result.pages > 0 && result.current_page > result.pages)
        ) {
          throw new Error('Queue API response is missing valid items or pagination details.');
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
            verified: item.verified,
            tier: item.tier || (
              item.verification_status.includes('business') || item.verified === 'business'
                ? 'business'
                : 'merchant'
            )
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
  }, [auth?.token, activeSection, queuePage, queueRefresh, queueTier]);

  const selectedSeller = sellers.find((seller) => seller.id === selectedSellerId) ?? sellers[0] ?? null;
  const currentSellerDetails = sellerDetails?.business_id != null &&
    String(sellerDetails.business_id) === selectedSeller?.sellerId
    ? sellerDetails
    : null;
  const selectedSellerTier = currentSellerDetails?.current_tier ?? selectedSeller?.tier;
  const selectedTierLabel = selectedSellerTier === 'business'
    ? 'Tier 2 (business)'
    : selectedSellerTier === 'merchant'
      ? 'Tier 1 (merchant)'
      : 'verification tier';

  useEffect(() => {
    if (activeSection !== '#queue') return undefined;

    const refreshQueue = () => setQueueRefresh((current) => current + 1);
    const intervalId = window.setInterval(refreshQueue, 30_000);
    window.addEventListener('focus', refreshQueue);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshQueue);
    };
  }, [activeSection]);

  const handleVerificationDecision = async (decision) => {
    const reason = rejectionReason.trim();
    if (decision === 'reject' && !reason) {
      setDecisionError('Enter a reason before rejecting this application.');
      setDecisionMessage('');
      return;
    }
    if (!selectedSeller) return;
    if (!['merchant', 'business'].includes(selectedSellerTier)) {
      setDecisionError('The seller verification tier is unavailable. Refresh the seller details before deciding.');
      setDecisionMessage('');
      return;
    }

    setDecisionLoading(true);
    setDecisionInProgress(decision);
    setDecisionError('');
    setDecisionMessage('');

    try {
      const endpoint = apiUrl(
        `/api/admin/verification/${encodeURIComponent(selectedSeller.sellerId)}/${decision}`
      );
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tier: selectedSellerTier,
          ...(decision === 'reject' ? { reason } : {})
        })
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
    '#sellers': 'Businesses and sellers',
    '#audit-log': 'Audit Log',
    '#team-management': 'Team & admin management'
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
        const response = await fetch(apiUrl(
          `/api/admin/verification/${encodeURIComponent(selectedSeller.sellerId)}`
        ), {
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
          typeof result.verification_status !== 'string' ||
          !['merchant', 'business'].includes(result.current_tier)
        ) {
          throw new Error('Seller details API returned missing or mismatched business details or an invalid current_tier.');
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
        <LoginPage onLoginSuccess={handleLoginSuccess} authStorageError={authStorageError} />
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
              {navItems.filter((item) => item.href !== '#team-management' || auth.admin.role === 'SuperAdmin').map((item, index) => (
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
                      <path d="M6 20.5V7.5A2.5 2.5 0 0 1 8.5 5h7A2.5 2.5 0 0 1 18 7.5v13M9 9h6M9 13h6M9 17h4"></path>
                    </svg>
                  )}
                  {index === 4 && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm10 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>
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
              <button className="logout-button sidebar-logout" type="button" onClick={handleLogout}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M15 12H3"></path>
                  <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"></path>
                </svg>
                Log out
              </button>
            </div>
          </aside>

          <main className="main">
            {authStorageError && <p className="admin-feedback admin-error" role="alert">{authStorageError}</p>}
            <header className="topbar">
              <div className="topbar-title">
                <span>Admin portal</span>
                <h2>{pageTitles[activeSection] || pageTitles['#dashboard']}</h2>
              </div>

              <div className="topbar-actions">
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
                    <label className="queue-tier-filter">
                      <span className="visually-hidden">Verification tier</span>
                      <select
                        value={queueTier}
                        onChange={(event) => {
                          setQueueTier(event.target.value);
                          setQueuePage(1);
                        }}
                        disabled={queueLoading}
                      >
                        <option value="">All tiers</option>
                        <option value="merchant">Tier 1 · Merchant</option>
                        <option value="business">Tier 2 · Business</option>
                      </select>
                    </label>
                    <button className="pill" type="button" onClick={() => setQueueRefresh((current) => current + 1)} disabled={queueLoading}>
                      {queueLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                </div>

                {decisionError && <p className="decision-error queue-decision-feedback" role="alert">{decisionError}</p>}
                {decisionMessage && <p className="decision-message queue-decision-feedback" role="status">{decisionMessage}</p>}
                {queueMeta && (
                  <p className="queue-summary">
                    {queueMeta.total} sellers
                    {queueMeta.pages > 0 && ` · page ${queueMeta.currentPage} of ${queueMeta.pages}`}
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
                        <tr><td colSpan="4">No sellers are waiting in this verification tier.</td></tr>
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
                        <h3>{currentSellerDetails?.name ?? selectedSeller.name}</h3>
                        <div className="meta">Business #{selectedSeller.sellerId}</div>
                      </div>
                      <span className={`chip ${statusClass(currentSellerDetails?.verification_status ?? selectedSeller.status)}`}>
                        {formatVerificationStatus(currentSellerDetails?.verification_status ?? selectedSeller.status)}
                      </span>
                    </div>

                    <div className="details-grid">
                      <div className="info-block">
                        <span className="info-label">Business ID</span>
                        <p className="info-value">{currentSellerDetails?.business_id ?? selectedSeller.sellerId}</p>
                      </div>
                      <div className="info-block">
                        <span className="info-label">Verified</span>
                        <p className="info-value">{formatVerified(currentSellerDetails?.verified ?? selectedSeller.verified)}</p>
                      </div>
                      <div className="info-block">
                        <span className="info-label">Current tier</span>
                        <p className="info-value">{selectedSellerTier || 'Not provided'}</p>
                      </div>
                    </div>
                    {detailsLoading && <p className="meta" role="status">Loading business details and documents…</p>}
                    {detailsError && <p className="meta" role="alert">{detailsError}</p>}
                    {currentSellerDetails && (
                      <>
                        {currentSellerDetails.rejection_reason && (
                          <div className="info-block">
                            <span className="info-label">Latest rejection reason</span>
                            <p className="info-value">{currentSellerDetails.rejection_reason}</p>
                          </div>
                        )}
                        {currentSellerDetails.description && (
                          <div className="info-block seller-description">
                            <span className="info-label">Description</span>
                            <p className="info-value">{currentSellerDetails.description}</p>
                          </div>
                        )}
                        {currentSellerDetails.address && (
                          <div className="info-block seller-address">
                            <span className="info-label">Address</span>
                            <p className="info-value">{currentSellerDetails.address}</p>
                          </div>
                        )}
                        {currentSellerDetails.documents &&
                          typeof currentSellerDetails.documents === 'object' &&
                          !Array.isArray(currentSellerDetails.documents) && (
                          <section className="seller-documents" aria-label="Seller documents">
                            <h4>Documents</h4>
                            <div className="doc-grid">
                              {Object.entries(currentSellerDetails.documents).map(([key, url]) => {
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
                          disabled={decisionLoading || detailsLoading || !currentSellerDetails || !['merchant', 'business'].includes(selectedSellerTier)}
                        >
                          {decisionInProgress === 'approve' ? 'Approving…' : `Approve ${selectedTierLabel}`}
                        </button>
                        <button
                          className="ghost-btn"
                          type="button"
                          onClick={() => handleVerificationDecision('reject')}
                          disabled={decisionLoading || detailsLoading || !currentSellerDetails || !['merchant', 'business'].includes(selectedSellerTier)}
                        >
                          {decisionInProgress === 'reject' ? 'Rejecting…' : `Reject ${selectedTierLabel}`}
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
                {selectedSeller && (
                  <AuditLogs
                    token={auth.token}
                    businessId={selectedSeller.sellerId}
                    embedded
                    refreshToken={queueRefresh}
                  />
                )}
              </aside>
            </section>}

            {activeSection === '#sellers' && <Sellers token={auth.token} />}

            {activeSection === '#audit-log' && <AuditLogs token={auth.token} />}

            {activeSection === '#team-management' && auth.admin.role === 'SuperAdmin' && (
              <AdminUsers token={auth.token} currentAdmin={auth.admin} />
            )}
          </main>
        </div>
      )}

    </>
  );
}

export default App;