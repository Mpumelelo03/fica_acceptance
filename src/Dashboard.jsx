import { useEffect, useState } from 'react';
import { apiUrl } from './api';

const directoryStatuses = [
  'pending',
  'pending_merchant',
  'pending_business',
  'approved',
  'rejected',
  'not_submitted'
];

async function loadVerifiedTierCounts(token, signal) {
  const statusResults = await Promise.all(directoryStatuses.map(async (status) => {
    const items = [];
    let page = 1;
    let pages = 1;

    while (page <= pages) {
      const query = new URLSearchParams({
        page: String(page),
        limit: '100',
        status
      });
      const response = await fetch(`${apiUrl('/api/admin/queue')}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal
      });
      const contentType = response.headers.get('content-type') || '';
      if (!/\bjson\b/i.test(contentType)) {
        throw new Error(`Seller tier counts API returned a non-JSON response (HTTP ${response.status}).`);
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || `Unable to load seller tier counts (HTTP ${response.status}).`);
      }
      if (
        !Array.isArray(result?.items) ||
        !Number.isInteger(result.pages) ||
        result.pages < 0 ||
        !Number.isInteger(result.current_page) ||
        result.current_page !== page ||
        (result.pages > 0 && result.current_page > result.pages)
      ) {
        throw new Error('Queue API response is missing valid items or pagination details for tier counts.');
      }

      items.push(...result.items);
      pages = result.pages;
      page += 1;
    }

    return items;
  }));

  const sellers = new Map();
  statusResults.flat().forEach((seller) => {
    if (
      !seller ||
      (typeof seller.business_id !== 'string' && typeof seller.business_id !== 'number') ||
      typeof seller.verification_status !== 'string'
    ) {
      throw new Error('Queue API returned a seller with missing business_id or verification_status for tier counts.');
    }

    const id = String(seller.business_id);
    const previous = sellers.get(id);
    if (!previous || (previous.verification_status === 'pending' && seller.verification_status !== 'pending')) {
      sellers.set(id, seller);
    }
  });

  const counts = { merchants: 0, businesses: 0, unclassified: 0 };
  sellers.forEach((seller) => {
    const verified = String(seller.verified ?? '').toLowerCase();
    const status = seller.verification_status.toLowerCase();
    const tier = seller.tier?.toLowerCase();

    let verifiedTier = ['merchant', 'business'].includes(verified) ? verified : null;
    if (!verifiedTier && (verified === 'true' || seller.verified === true)) {
      if (status.includes('pending_business') || (status === 'rejected' && tier === 'business')) {
        verifiedTier = 'merchant';
      } else if (status === 'approved' && ['merchant', 'business'].includes(tier)) {
        verifiedTier = tier;
      }
    }

    if (verifiedTier === 'merchant') counts.merchants += 1;
    else if (verifiedTier === 'business') counts.businesses += 1;
    else if (verified === 'true' || seller.verified === true) counts.unclassified += 1;
  });

  return counts;
}

function Dashboard({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tierCounts, setTierCounts] = useState(null);
  const [tierCountsLoading, setTierCountsLoading] = useState(false);
  const [tierCountsError, setTierCountsError] = useState('');
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState('');
  const [digestMessage, setDigestMessage] = useState('');

  useEffect(() => {
    if (!token) return undefined;

    const controller = new AbortController();
    const loadTierCounts = async () => {
      setTierCountsLoading(true);
      setTierCountsError('');
      try {
        setTierCounts(await loadVerifiedTierCounts(token, controller.signal));
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setTierCountsError(loadError instanceof Error ? loadError.message : 'Unable to load verified seller tier counts.');
        }
      } finally {
        if (!controller.signal.aborted) setTierCountsLoading(false);
      }
    };

    const loadDashboardStats = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(apiUrl('/api/admin/dashboard'), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });

        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) {
          throw new Error(`Dashboard API returned a non-JSON response (HTTP ${response.status}).`);
        }

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || `Unable to load dashboard stats (HTTP ${response.status}).`);
        }

        const verificationStats = result?.verification_stats;
        const counts = [
          result?.total_sellers,
          verificationStats?.pending,
          verificationStats?.approved,
          verificationStats?.rejected,
          verificationStats?.not_submitted
        ];
        if (!counts.every((count) => Number.isInteger(count) && count >= 0)) {
          throw new Error('Dashboard API response is missing valid seller verification counts.');
        }

        setStats({
          totalSellers: result.total_sellers,
          pending: verificationStats.pending,
          approved: verificationStats.approved,
          rejected: verificationStats.rejected,
          notSubmitted: verificationStats.not_submitted
        });
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard stats.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadDashboardStats();
    loadTierCounts();
    return () => controller.abort();
  }, [token]);

  const dispatchDigest = async () => {
    if (!window.confirm('Send the daily verification digest to the admins now?')) return;

    setDigestLoading(true);
    setDigestError('');
    setDigestMessage('');
    try {
      const response = await fetch(apiUrl('/api/admin/dispatch-digest'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const contentType = response.headers.get('content-type') || '';
      if (!/\bjson\b/i.test(contentType)) {
        throw new Error(`Digest API returned a non-JSON response (HTTP ${response.status}).`);
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || `Unable to dispatch the daily digest (HTTP ${response.status}).`);
      }
      if (typeof result?.message !== 'string') {
        throw new Error('Digest API response is missing its confirmation message.');
      }
      setDigestMessage(result.message);
    } catch (dispatchError) {
      setDigestError(dispatchError instanceof Error ? dispatchError.message : 'Unable to dispatch the daily digest.');
    } finally {
      setDigestLoading(false);
    }
  };

  const metrics = [
    { label: 'Total sellers', key: 'totalSellers', description: 'Registered businesses' },
    { label: 'Pending', key: 'pending', description: 'Awaiting verification' },
    { label: 'Approved', key: 'approved', description: 'Applications approved' },
    { label: 'Verified merchants', key: 'merchants', description: 'Tier 1 · Merchant verified' },
    { label: 'Verified businesses', key: 'businesses', description: 'Tier 2 · Business verified' },
    { label: 'Rejected', key: 'rejected', description: 'Applications declined' },
    { label: 'Not submitted', key: 'notSubmitted', description: 'Awaiting submission' }
  ];

  return (
    <section id="dashboard" aria-label="Verification analytics" aria-busy={loading}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Overview</span>
          <p className="meta">A summary of seller verification activity.</p>
        </div>
        <button className="pill" type="button" onClick={dispatchDigest} disabled={digestLoading}>
          {digestLoading ? 'Dispatching…' : 'Send daily digest'}
        </button>
      </div>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {tierCountsError && <p className="dashboard-error" role="alert">{tierCountsError}</p>}
      {tierCounts?.unclassified > 0 && (
        <p className="meta" role="status">
          Tier counts exclude {tierCounts.unclassified} verified seller{tierCounts.unclassified === 1 ? '' : 's'} whose API records do not identify a verification tier.
        </p>
      )}
      {digestError && <p className="dashboard-error" role="alert">{digestError}</p>}
      {digestMessage && <p className="admin-feedback admin-success" role="status">{digestMessage}</p>}
      <div className="stats">
        {metrics.map((metric) => (
          <article className="card stat-card" key={metric.key}>
            <div className="stat-head">
              <span>{metric.label}</span>
              <span className="stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-7m4 7v-4"></path>
                </svg>
              </span>
            </div>
            <p className="stat-value">
              {metric.key === 'merchants' || metric.key === 'businesses'
                ? tierCounts?.[metric.key] ?? (tierCountsLoading ? '…' : '—')
                : stats?.[metric.key] ?? (loading ? '…' : '—')}
            </p>
            <div className="stat-foot">{metric.description}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default Dashboard;
