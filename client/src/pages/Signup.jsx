import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await signup(form.name, form.email, form.password);
      setMessage('Account created successfully. Pending admin approval. You will be notified once approved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card shadow p-4" style={{ width: 420, maxWidth: '90vw' }}>
        <div className="text-center mb-4">
          <h3><i className="bi bi-person-plus me-2"></i>Create Account</h3>
          <p className="text-muted">Sign up to use Mazzi live search &amp; extraction</p>
        </div>
        {error && <div className="alert alert-danger mb-3">{error}</div>}
        {message && <div className="alert alert-info mb-3">{message}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Full name</label>
            <input type="text" className="form-control" required
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label">Email address</label>
            <input type="email" className="form-control" required
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" required minLength="6"
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <div className="form-text">Password must be at least 6 characters.</div>
          </div>
          <button className="btn btn-primary w-100 py-2" type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>
        <div className="text-center mt-4">
          <p className="text-muted small">Already have an account?{' '}
            <a href="/login" className="text-decoration-none">Sign in</a>
          </p>
          <p className="text-muted small">Your account must be approved by an admin before you can search.</p>
        </div>
      </div>
    </div>
  );
}
