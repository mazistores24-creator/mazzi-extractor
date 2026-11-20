import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate, Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_BADGE = {
  pending: 'bg-warning text-dark',
  approved: 'bg-success',
  rejected: 'bg-danger'
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    loadUsers();
  }, [user, navigate]);

  async function loadUsers() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/users`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        setError('Failed to load users.');
      }
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${id}/${status}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(`User ${status}.`);
        loadUsers();
      } else {
        setError(data.message || `Failed to ${status} user.`);
      }
    } catch {
      setError(`Failed to ${status} user.`);
    }
  }

  async function removeUser(id) {
    if (!confirm('Remove this user? This cannot be undone.')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        setMessage('User removed.');
        loadUsers();
      } else {
        setError('Failed to remove user.');
      }
    } catch {
      setError('Failed to remove user.');
    }
  }

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center min-vh-100">
        <div className="spinner-border" role="status"></div>
      </div>
    );
  }

  if (!user) return <div className="text-center p-4">Loading…</div>;

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2><i className="bi bi-shield-check me-2"></i>Admin Dashboard</h2>
          <p className="text-muted">Manage user accounts and approvals</p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/search" className="btn btn-outline-primary">Go to Search</Link>
          <button className="btn btn-outline-danger" onClick={logout}>Sign Out</button>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-3">{error}</div>}
      {message && <div className="alert alert-info mb-3">{message}</div>}

      <div className="card">
        <div className="card-header">
          <strong>Users</strong>
          <span className="float-end text-muted">{users.length} total</span>
        </div>
        <div className="card-body p-0">
          {users.length === 0 ? (
            <div className="p-4 text-center text-muted">No users found.</div>
          ) : (
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'bg-dark' : 'bg-primary'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[u.status] || 'bg-secondary'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="text-end">
                      {u.status === 'pending' && (
                        <>
                          <button className="btn btn-sm btn-success me-1" onClick={() => updateStatus(u.id, 'approve')}>Approve</button>
                          <button className="btn btn-sm btn-danger me-1" onClick={() => updateStatus(u.id, 'reject')}>Reject</button>
                        </>
                      )}
                      {u.status === 'approved' && (
                        <button className="btn btn-sm btn-danger" onClick={() => updateStatus(u.id, 'reject')}>Reject</button>
                      )}
                      {u.id !== user.id && (
                        <button className="btn btn-sm btn-outline-danger ms-1" onClick={() => removeUser(u.id)}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="alert alert-warning">
          <strong>Default admin credentials:</strong><br />
          Email: admin@mazzi.com<br />
          Password: admin123<br />
          <small className="text-muted">Change these via ADMIN_EMAIL and ADMIN_PASSWORD environment variables in production.</small>
        </div>
      </div>
    </div>
  );
}
