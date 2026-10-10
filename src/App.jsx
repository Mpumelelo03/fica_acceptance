import { useMemo, useState } from 'react';

const initialSellers = [
  { id: 1, sellerId: '00324', name: 'Nandi Mokoena', store: 'Mokoena Market', category: 'Grocery', phone: '+27 82 371 1010', idNumber: 'ID: 9806031497087', address: '18 Main Road, Soweto, Johannesburg', status: 'Pending', priority: 'High', submitted: '14:22', openTime: '06:41' },
  { id: 2, sellerId: '00317', name: 'Lerato Ndlovu', store: 'Lerato Beauty', category: 'Beauty', phone: '+27 71 240 6888', idNumber: 'ID: 0311200982049', address: '44 Kent Road, Sandton, Johannesburg', status: 'Review', priority: 'Normal', submitted: '12:43', openTime: '04:51' },
  { id: 3, sellerId: '00306', name: 'Mpho Dlamini', store: 'Dlamini Hardware', category: 'Hardware', phone: '+27 79 118 0919', idNumber: 'ID: 9102211458092', address: '88 Voortrekker Road, Pretoria', status: 'Flagged', priority: 'Low', submitted: '10:16', openTime: '08:22' },
  { id: 4, sellerId: '00291', name: 'Thabo Sithole', store: 'Sithole Auto Parts', category: 'Automotive', phone: '+27 83 911 3446', idNumber: 'ID: 8709042110429', address: '26 Olifants Road, Durban', status: 'Approved', priority: 'Normal', submitted: '18:40', openTime: '09:07' }
];

const navItems = [
  { label: 'Dashboard', href: '#dashboard', badge: null },
  { label: 'Queue', href: '#queue', badge: '12' },
  { label: 'Sellers', href: '#sellers', badge: null },
  { label: 'Reports', href: '#reports', badge: null },
  { label: 'Audit Log', href: '#audit-log', badge: null },
  { label: 'Settings', href: '#settings', badge: null }
];

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState(initialSellers[0].id);
  const [toast, setToast] = useState('');

  const selectedSeller = useMemo(
    () => initialSellers.find((seller) => seller.id === selectedSellerId) ?? initialSellers[0],
    [selectedSellerId]
  );

  const handleLogin = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get('twofa') || '').trim();

    if (code.length !== 6 || !/^\d+$/.test(code)) {
      setLoginError('Enter a valid 6-digit authenticator code.');
      return;
    }

    setLoginError('');
    setLoggedIn(true);
  };

  const handleAction = (action) => {
    const messages = {
      approve: 'Approval result returned to the existing database.',
      info: 'Additional info request returned to the existing database.',
      reject: 'Rejection result returned to the existing database.'
    };

    setToast(messages[action]);
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(''), 2200);
  };

  return (
    <>
      {!loggedIn ? (
        <div className="login-shell">
          <div className="login-box">
            <div className="login-brand">
              <div className="mark">EP</div>
              <p>Internal access</p>
              <h1>Admin Portal</h1>
            </div>

            <form onSubmit={handleLogin}>
              <label className="field" aria-label="Email address">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
                  <path d="M4.5 7l7.5 6 7.5-6"></path>
                </svg>
                <input type="email" name="email" placeholder="Admin email" autoComplete="email" required />
              </label>

              <div className="field password-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="4.5" y="10" width="15" height="11" rx="2"></rect>
                  <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
                </svg>
                <input id="password" type="password" name="password" placeholder="Password" autoComplete="current-password" required />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label="Show password"
                  aria-pressed="false"
                  onClick={(event) => {
                    event.preventDefault();
                    const input = document.getElementById('password');
                    const isVisible = input.type === 'text';
                    input.type = isVisible ? 'password' : 'text';
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
                    <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.2-2.3 3.2M6.2 6.2C3.8 7.7 2.7 9.8 2.5 12c.4 1.1 1.2 2.2 2.3 3.2A10.6 10.6 0 0 0 12 19c1 0 2-.2 2.9-.5"></path>
                  </svg>
                </button>
              </div>

              <label className="field" aria-label="Two factor code">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="7" y="2.5" width="10" height="19" rx="2.5"></rect>
                  <path d="M10 7h4M10 12h4M10 17h3"></path>
                </svg>
                <input type="text" name="twofa" placeholder="6-digit authenticator code" inputMode="numeric" maxLength="6" pattern="[0-9]*" required />
              </label>

              <div className="helper-row">
                <span>Session timeout: 15 minutes</span>
                <a href="#recover">Need help?</a>
              </div>

              <button className="login-button" type="submit">Verify &amp; Sign in</button>
            </form>

            <p className="message" role="status" aria-live="polite">
              {loginError || 'Protected by 2FA for all admin reviews.'}
            </p>
            <p className="register-note">Protected by 2FA for all admin reviews.</p>
          </div>
        </div>
      ) : (
        <div className={`app-shell ${darkMode ? 'dark' : ''}`}>
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">EP</div>
              <div className="brand-copy">
                <strong>e-Pocketshop</strong>
                <span>Admin Verification</span>
              </div>
            </div>

            <nav className="nav" aria-label="Sidebar navigation">
              {navItems.map((item, index) => (
                <a className={`nav-item ${index === 0 ? 'active' : ''}`} href={item.href} key={item.label}>
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

            <div className="sidebar-footer">
              <span className="label">Portal status</span>
              <strong>All systems live</strong>
              <span>Fetches data from the existing DB in real time</span>
            </div>
          </aside>

          <main className="main">
            <header className="topbar">
              <div className="topbar-title">
                <span>Overview</span>
                <h2>Verification dashboard</h2>
              </div>

              <div className="topbar-actions">
                <label className="search" aria-label="Search sellers">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="11" cy="11" r="6"></circle>
                    <path d="M16 16l4 4"></path>
                  </svg>
                  <input type="search" placeholder="Search seller or admin" />
                </label>

                <button className="icon-button" type="button" id="theme-toggle" aria-label="Toggle dark mode" onClick={() => setDarkMode((current) => !current)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="4.5"></circle>
                    <path d="M12 2.5v2.3M12 19.2v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"></path>
                  </svg>
                </button>

                <button className="icon-button" type="button" aria-label="Notifications">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0"></path>
                  </svg>
                </button>

                <div className="user-pill">
                  <div className="avatar">UJ</div>
                  <div>
                    <strong>Umar J.</strong>
                    <small>Super admin</small>
                  </div>
                </div>
              </div>
            </header>

            <section className="stats" aria-label="Verification metrics">
              <div className="card stat-card">
                <div className="stat-head">
                  <span>Pending</span>
                  <span className="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5v14"></path></svg>
                  </span>
                </div>
                <p className="stat-value">124</p>
                <div className="stat-foot"><span className="trend-up">+18%</span> from last week</div>
              </div>

              <div className="card stat-card">
                <div className="stat-head">
                  <span>Approved</span>
                  <span className="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12.5l4 4 10-10"></path></svg>
                  </span>
                </div>
                <p className="stat-value">86</p>
                <div className="stat-foot"><span className="trend-up">+9%</span> today</div>
              </div>

              <div className="card stat-card">
                <div className="stat-head">
                  <span>Rejected</span>
                  <span className="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18"></path></svg>
                  </span>
                </div>
                <p className="stat-value">32</p>
                <div className="stat-foot"><span className="trend-down">-4%</span> compared with yesterday</div>
              </div>

              <div className="card stat-card">
                <div className="stat-head">
                  <span>Avg review</span>
                  <span className="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path></svg>
                  </span>
                </div>
                <p className="stat-value">18m</p>
                <div className="stat-foot"><span className="trend-up">+2m</span> faster than target</div>
              </div>
            </section>

            <section className="content-layout">
              <div className="panel">
                <div className="panel-header">
                  <h3>Seller queue</h3>
                  <div className="panel-tools">
                    <button className="pill active" type="button">All</button>
                    <button className="pill" type="button">Pending</button>
                    <button className="pill" type="button">Flagged</button>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Seller</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {initialSellers.map((seller) => (
                        <tr
                          className={seller.id === selectedSeller.id ? 'selected' : ''}
                          key={seller.id}
                          onClick={() => setSelectedSellerId(seller.id)}
                        >
                          <td>
                            <div className="seller-id">
                              <div className="seller-avatar">{seller.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
                              <div>
                                <div className="seller-name">{seller.name}</div>
                                <div className="subtext">#{seller.sellerId}</div>
                              </div>
                            </div>
                          </td>
                          <td>{seller.category}</td>
                          <td><span className={`chip ${seller.status.toLowerCase() === 'pending' ? 'pending' : seller.status.toLowerCase() === 'review' ? 'review' : seller.status.toLowerCase() === 'flagged' ? 'flagged' : 'approved'}`}>{seller.status}</span></td>
                          <td><span className={`chip ${seller.priority.toLowerCase()}`}>{seller.priority}</span></td>
                          <td>{seller.submitted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="panel review-panel">
                <div className="review-header">
                  <div>
                    <h3>{selectedSeller.name}</h3>
                    <div className="meta">#{selectedSeller.sellerId} · {selectedSeller.category} · Submitted {selectedSeller.submitted}</div>
                  </div>
                  <div className="result-timeline">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 7v5l3 3"></path><circle cx="12" cy="12" r="8"></circle></svg>
                    <span>Open {selectedSeller.openTime}</span>
                  </div>
                </div>

                <div className="details-grid">
                  <div className="info-block">
                    <span className="info-label">Store</span>
                    <p className="info-value">{selectedSeller.store}</p>
                  </div>
                  <div className="info-block">
                    <span className="info-label">Phone</span>
                    <p className="info-value">{selectedSeller.phone}</p>
                  </div>
                  <div className="info-block">
                    <span className="info-label">ID number</span>
                    <p className="info-value">{selectedSeller.idNumber}</p>
                  </div>
                  <div className="info-block">
                    <span className="info-label">Location</span>
                    <p className="info-value">{selectedSeller.address}</p>
                  </div>
                </div>

                <div className="doc-grid">
                  <div className="doc-card">
                    <div className="doc-preview">
                      <img alt="ID front" src="https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=700&q=80" />
                      <div className="doc-overlay">ID front</div>
                    </div>
                    <div className="doc-meta"><span>Document</span><a href="#">Zoom</a></div>
                  </div>

                  <div className="doc-card">
                    <div className="doc-preview">
                      <img alt="ID back" src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=700&q=80" />
                      <div className="doc-overlay">ID back</div>
                    </div>
                    <div className="doc-meta"><span>Document</span><a href="#">Zoom</a></div>
                  </div>

                  <div className="doc-card">
                    <div className="doc-preview">
                      <img alt="Selfie" src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=700&q=80" />
                      <div className="doc-overlay">Selfie</div>
                    </div>
                    <div className="doc-meta"><span>Face match</span><a href="#">Compare</a></div>
                  </div>
                </div>

                <div className="notes">
                  <label>
                    <span className="info-label">Internal notes</span>
                    <textarea placeholder="Add admin review notes or reasons for rejection / additional info request...">CPIC appears valid, but ID expiry date is within 3 months. Cross-check face match and verify certification region before approval.</textarea>
                  </label>
                </div>

                <div className="action-row">
                  <button className="primary-btn" type="button" onClick={() => handleAction('approve')}>Approve</button>
                  <button className="secondary-btn" type="button" onClick={() => handleAction('info')}>Request info</button>
                  <button className="ghost-btn" type="button" onClick={() => handleAction('reject')}>Reject</button>
                </div>
              </aside>
            </section>
          </main>
        </div>
      )}

      {toast && <div className="toast show">{toast}</div>}
    </>
  );
}

export default App;