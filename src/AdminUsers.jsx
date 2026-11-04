import { useCallback, useEffect, useState } from 'react';

function getEndpoint() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
  return import.meta.env.DEV || !apiBaseUrl ? '/api/admin/users' : `${apiBaseUrl}/api/admin/users`;
}

async function readResponse(response, action) {
  const contentType = response.headers.get('content-type') || '';
  if (!/\bjson\b/i.test(contentType)) {
    throw new Error(`${action} returned a non-JSON response (HTTP ${response.status}).`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`${action} returned an invalid response.`);
  }

  if (!response.ok) {
    throw new Error(result?.message || `${action} failed (HTTP ${response.status}).`);
  }
  return result;
}

function validateAdmin(admin) {
  if (
    !admin ||
    typeof admin.admin_id !== 'string' ||
    typeof admin.email !== 'string' ||
    typeof admin.full_name !== 'string' ||
    !['Admin', 'SuperAdmin'].includes(admin.role) ||
    typeof admin.is_active !== 'boolean'
  ) {
    throw new Error('Admin API returned an account with missing or invalid details.');
  }
  return admin;
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isCurrentAdmin(admin, currentAdmin) {
  if (typeof admin.admin_id === 'string' && typeof currentAdmin.admin_id === 'string') {
    return admin.admin_id === currentAdmin.admin_id;
  }
  return admin.email.toLowerCase() === currentAdmin.email?.toLowerCase();
}

function AdminUsers({ token, currentAdmin }) {
  const [admins, setAdmins] = useState([]);
  const [total, setTotal] = useState(0);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [invite, setInvite] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'Admin'
  });
  const [editDraft, setEditDraft] = useState({ full_name: '', role: 'Admin' });

  const loadAdmins = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ include_inactive: String(includeInactive) });
      const response = await fetch(`${getEndpoint()}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal
      });
      const result = await readResponse(response, 'Admin directory API');
      if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0) {
        throw new Error('Admin directory API response is missing a valid total or accounts list.');
      }
      setAdmins(result.items.map(validateAdmin));
      setTotal(result.total);
    } catch (loadError) {
      if (loadError.name !== 'AbortError') {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load admin accounts.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [includeInactive, token]);

  useEffect(() => {
    const controller = new AbortController();
    loadAdmins(controller.signal);
    return () => controller.abort();
  }, [loadAdmins]);

  const updateListedAdmin = (admin) => {
    const updatedAdmin = validateAdmin(admin);
    const alreadyListed = admins.some((item) => item.admin_id === updatedAdmin.admin_id);
    const shouldBeListed = includeInactive || updatedAdmin.is_active;
    setAdmins((current) => {
      if (!shouldBeListed) {
        return current.filter((item) => item.admin_id !== updatedAdmin.admin_id);
      }
      return alreadyListed
        ? current.map((item) => item.admin_id === updatedAdmin.admin_id ? updatedAdmin : item)
        : [updatedAdmin, ...current];
    });
    setTotal((current) => {
      if (alreadyListed && !shouldBeListed) return Math.max(0, current - 1);
      if (!alreadyListed && shouldBeListed) return current + 1;
      return current;
    });
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(getEndpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: invite.email.trim(),
          full_name: invite.full_name.trim(),
          password: invite.password,
          role: invite.role
        })
      });
      const result = await readResponse(response, 'Create admin API');
      const createdAdmin = validateAdmin(result.admin);
      updateListedAdmin(createdAdmin);
      setInvite({ email: '', full_name: '', password: '', role: 'Admin' });
      setInviteOpen(false);
      setMessage(result.message || 'Admin account created successfully.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create the admin account.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (admin) => {
    setEditingAdmin(admin);
    setEditDraft({ full_name: admin.full_name, role: admin.role });
    setError('');
    setMessage('');
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!editingAdmin) return;
    const isSelf = isCurrentAdmin(editingAdmin, currentAdmin);
    const payload = {
      full_name: editDraft.full_name.trim()
    };
    if (!isSelf) payload.role = editDraft.role;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${getEndpoint()}/${encodeURIComponent(editingAdmin.admin_id)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await readResponse(response, 'Update admin API');
      updateListedAdmin(result.admin);
      setEditingAdmin(null);
      setMessage(result.message || 'Admin updated successfully.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to update the admin account.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (admin) => {
    if (!window.confirm(`Deactivate ${admin.full_name} (${admin.email})? Their access will be revoked immediately.`)) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${getEndpoint()}/${encodeURIComponent(admin.admin_id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await readResponse(response, 'Deactivate admin API');
      updateListedAdmin(result.admin);
      setMessage(result.message || 'Admin account deactivated successfully.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to deactivate the admin account.');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async (admin) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${getEndpoint()}/${encodeURIComponent(admin.admin_id)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: true })
      });
      const result = await readResponse(response, 'Reactivate admin API');
      updateListedAdmin(result.admin);
      setMessage(result.message || 'Admin account reactivated successfully.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to reactivate the admin account.');
    } finally {
      setSaving(false);
    }
  };

  if (currentAdmin.role !== 'SuperAdmin') {
    return <section className="panel workspace-placeholder"><p role="alert">SuperAdmin access is required to manage admin accounts.</p></section>;
  }

  return (
    <section className="admin-management" id="team-management" aria-label="Team and admin management">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SuperAdmin only</span>
          <p className="meta">Manage platform admin accounts, roles, and access.</p>
        </div>
        <button
          className="primary-btn"
          type="button"
          onClick={() => {
            setInviteOpen((open) => !open);
            setEditingAdmin(null);
            setError('');
            setMessage('');
          }}
        >
          {inviteOpen ? 'Close form' : 'Add admin'}
        </button>
      </div>

      {error && <p className="admin-feedback admin-error" role="alert">{error}</p>}
      {message && <p className="admin-feedback admin-success" role="status">{message}</p>}

      {inviteOpen && (
        <form className="panel admin-form" onSubmit={handleInvite} aria-busy={saving}>
          <div className="admin-form-heading">
            <div>
              <h3>Invite an admin</h3>
              <p className="meta">The new admin will be prompted to configure Google Authenticator on first login.</p>
            </div>
          </div>
          <div className="admin-form-grid">
            <label>
              Full name
              <input
                type="text"
                autoComplete="name"
                value={invite.full_name}
                onChange={(event) => setInvite({ ...invite, full_name: event.target.value })}
                required
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={invite.email}
                onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                required
              />
            </label>
            <label>
              Temporary password
              <input
                type="password"
                autoComplete="new-password"
                value={invite.password}
                onChange={(event) => setInvite({ ...invite, password: event.target.value })}
                required
              />
            </label>
            <label>
              Role
              <select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                <option value="Admin">Admin</option>
                <option value="SuperAdmin">SuperAdmin</option>
              </select>
            </label>
          </div>
          <div className="action-row">
            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create admin'}
            </button>
          </div>
        </form>
      )}

      {editingAdmin && (
        <form className="panel admin-form" onSubmit={handleUpdate} aria-busy={saving}>
          <div className="admin-form-heading">
            <div>
              <h3>Edit {editingAdmin.full_name}</h3>
              <p className="meta">{editingAdmin.email}</p>
            </div>
            <button className="secondary-btn" type="button" onClick={() => setEditingAdmin(null)}>Cancel</button>
          </div>
          <div className="admin-form-grid">
            <label>
              Full name
              <input
                type="text"
                value={editDraft.full_name}
                onChange={(event) => setEditDraft({ ...editDraft, full_name: event.target.value })}
                required
              />
            </label>
            <label>
              Role
              <select
                value={editDraft.role}
                onChange={(event) => setEditDraft({ ...editDraft, role: event.target.value })}
                disabled={isCurrentAdmin(editingAdmin, currentAdmin)}
              >
                <option value="Admin">Admin</option>
                <option value="SuperAdmin">SuperAdmin</option>
              </select>
            </label>
          </div>
          {isCurrentAdmin(editingAdmin, currentAdmin) && (
            <p className="meta">You cannot demote or deactivate your own account.</p>
          )}
          <div className="action-row">
            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      <div className="panel admin-directory">
        <div className="panel-header">
          <div>
            <h3>Admin accounts</h3>
            <p className="meta">{loading ? 'Loading accounts…' : `${total} account${total === 1 ? '' : 's'}`}</p>
          </div>
          <div className="panel-tools">
            <label className="inactive-filter">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Include inactive
            </label>
            <button className="pill" type="button" onClick={() => loadAdmins()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Admin</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6">Loading admin accounts…</td></tr>}
              {!loading && error && <tr><td colSpan="6">Admin accounts could not be loaded.</td></tr>}
              {!loading && !error && admins.length === 0 && (
                <tr><td colSpan="6">No admin accounts found.</td></tr>
              )}
              {!loading && !error && admins.map((admin) => {
                const isSelf = isCurrentAdmin(admin, currentAdmin);
                return (
                  <tr key={admin.admin_id}>
                    <td>
                      <div className="admin-identity">
                        <div className="seller-avatar">{admin.full_name.trim().charAt(0).toUpperCase() || 'A'}</div>
                        <div>
                          <strong>{admin.full_name}</strong>
                          <span>{admin.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{admin.role}</td>
                    <td><span className={`chip ${admin.is_active ? 'approved' : 'low'}`}>{admin.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>{formatDate(admin.last_login)}</td>
                    <td>{formatDate(admin.created_at)}</td>
                    <td>
                      <div className="admin-actions">
                        <button className="pill" type="button" onClick={() => startEditing(admin)} disabled={saving}>
                          Edit
                        </button>
                        {!isSelf && (admin.is_active
                          ? <button className="pill admin-deactivate" type="button" onClick={() => handleDeactivate(admin)} disabled={saving}>Deactivate</button>
                          : <button className="pill" type="button" onClick={() => handleReactivate(admin)} disabled={saving}>Reactivate</button>)}
                        {isSelf && <span className="subtext">Your account</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AdminUsers;
