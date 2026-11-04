import { useEffect, useState } from 'react';

function Dashboard({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return undefined;

    const controller = new AbortController();
    const loadDashboardStats = async () => {
      setLoading(true);
      setError('');

      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
        const endpoint = import.meta.env.DEV || !apiBaseUrl
          ? '/api/admin/dashboard'
          : `${apiBaseUrl}/api/admin/dashboard`;
        const response = await fetch(endpoint, {
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
    return () => controller.abort();
  }, [token]);

  const metrics = [
    { label: 'Total sellers', key: 'totalSellers', description: 'Registered businesses' },
    { label: 'Pending', key: 'pending', description: 'Awaiting verification' },
    { label: 'Approved', key: 'approved', description: 'Verified businesses' },
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
      </div>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
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
            <p className="stat-value">{stats?.[metric.key] ?? (loading ? '…' : '—')}</p>
            <div className="stat-foot">{metric.description}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default Dashboard;
