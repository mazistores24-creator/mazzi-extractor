import { useState, useMemo, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import SearchWorkspace from './components/SearchWorkspace';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AdminDashboard from './pages/AdminDashboard';

const emptyFilters = { country: 'Any country', language: 'Any language', emailType: 'Any type', provider: 'Any provider', keywords: '', maxResults: 500 };
const demoText = `Acme Studio | hello@acmestudio.example | +1 555 010 2200 | https://acmestudio.example\nNorthwind Labs | partnerships@northwind.example | +44 20 7946 0958 | https://northwind.example`;

const API_BASE = import.meta.env.VITE_API_URL || '';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== 'approved') return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== 'admin') return <Navigate to="/login" replace />;
  return children;
}

function MainApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [filters, setFilters] = useState(emptyFilters);
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState([]);
  const [resultQuery, setResultQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeView, setActiveView] = useState('live-search');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  async function loadHistory() {
    try {
      const response = await fetch(`${API_BASE}/api/extractions`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) setHistory(await response.json());
    } catch { /* The client can still work once the API is started. */ }
  }

  useEffect(() => { loadHistory(); }, []);

  function updateFilter(key, value) { setFilters(current => ({ ...current, [key]: value })); }

  async function readFile(file) {
    if (!file) return;
    const allowed = /\.(txt|csv|log)$/i.test(file.name);
    if (!allowed) { setNotice('Choose a .txt, .csv, or .log file.'); return; }
    setSourceLabel(file.name);
    setRawText(await file.text());
    setNotice(`${file.name} is ready to process.`);
  }

  async function extract() {
    if (!rawText.trim()) { setNotice('Paste source text or import a file first.'); return; }
    setBusy(true); setNotice('Extracting contacts from your supplied material…');
    try {
      const response = await fetch(`${API_BASE}/api/extractions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText, sourceLabel: sourceLabel || 'Pasted text', sourceUrl, ...filters })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Extraction failed.');
      setResults(data.items || []);
      setNotice(`Done — found ${data.items?.length || 0} unique email address${data.items?.length === 1 ? '' : 'es'}.`);
      loadHistory();
    } catch (error) {
      setNotice(error.message === 'Failed to fetch' ? 'Could not reach the API. Start the server with the setup guide.' : error.message);
    } finally { setBusy(false); }
  }

  function downloadCsv() {
    if (!results.length) return;
    const headers = ['Name', 'Phone', 'Email', 'Type (inferred)', 'Provider', 'URL', 'Country', 'Language', 'Source'];
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headers, ...results.map(row => [row.name, row.phone, row.email, row.type, row.provider, row.url, row.country, row.language, row.sourceLabel])].map(row => row.map(quote).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'mazzi-extractor-results.csv'; link.click(); URL.revokeObjectURL(link.href);
  }

  const resultCount = useMemo(() => results.length, [results]);
  const visibleResults = useMemo(() => {
    const query = resultQuery.trim().toLowerCase();
    if (!query) return results;
    return results.filter(row => [row.name,row.phone,row.email,row.type,row.provider,row.url,row.sourceLabel].some(value => String(value || '').toLowerCase().includes(query)));
  }, [results, resultQuery]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home"><span className="brand-mark"><i className="bi bi-at" /></span><span><b>Mazzi</b><small>EXTRACTOR</small></span></a>
        <div className="side-caption">WORKSPACE</div>
        <button className={`side-link ${activeView === 'extractor' ? 'active' : ''}`} onClick={() => { setActiveView('extractor'); navigate('/search'); }}>
          <i className="bi bi-grid-1x2-fill" /> Extractor
        </button>
        <button className={`side-link ${activeView === 'live-search' ? 'active' : ''}`} onClick={() => { setActiveView('live-search'); navigate('/search'); }}>
          <i className="bi bi-search me-1" /> Live Search
        </button>
        <button className={`side-link ${activeView === 'history' ? 'active' : ''}`} onClick={() => { setActiveView('history'); loadHistory(); navigate('/search'); }}>
          <i className="bi bi-clock-history" /> Run history <span className="side-count">{history.length}</span>
        </button>
        {user && user.role === 'admin' && (
          <button className={`side-link ${activeView === 'admin' ? 'active' : ''}`} onClick={() => { setActiveView('admin'); navigate('/admin'); }}>
            <i className="bi bi-shield-check" /> Admin
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="safe-card"><i className="bi bi-shield-check" /><div><b>Secure workspace</b><span>Sign in required.</span></div></div>
          <div className="user-chip">
            <div className="avatar">{user?.name?.[0] || 'M'}</div>
            <div>
              <b>{user?.name || 'Mazzi Workspace'}</b>
              <span>{user?.role === 'admin' ? 'Administrator' : 'Personal workspace'}</span>
            </div>
            <button className="text-decoration-none" onClick={logout} title="Sign out"><i className="bi bi-box-arrow-right" /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <i className="bi bi-chevron-right" /> <b>{activeView === 'extractor' ? 'Extractor' : activeView === 'admin' ? 'Admin' : 'Run history'}</b></div>
          <div className="top-actions">
            <span className="api-status"><span /> API connection</span>
            <button className="icon-btn" title="Help"><i className="bi bi-question-circle" /></button>
          </div>
        </header>
        <div className="content-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{activeView === 'admin' ? 'USER MANAGEMENT' : 'CONTACT RESEARCH'}</div>
              <h1>{activeView === 'admin' ? 'Admin Dashboard' : 'Email extractor'}</h1>
              <p>{activeView === 'admin' ? 'Approve, reject, and remove user accounts.' : 'Find and organize contact details from material you are authorized to use.'}</p>
            </div>
            {activeView !== 'admin' && (
              <button className="btn btn-outline-secondary btn-sm" onClick={() => { setRawText(demoText); setSourceLabel('Example contacts'); setNotice('Example content loaded.'); }}>
                <i className="bi bi-stars me-2" /> Load example
              </button>
            )}
          </div>
          <div className="notice-bar">
            <i className="bi bi-info-circle-fill" /><span>
              {activeView === 'admin'
                ? 'Admin controls: approve pending users, reject accounts, or remove users.'
                : 'Live web search & extraction. Mazzi searches DuckDuckGo, Bing, Google (API key), LinkedIn, and business directories, then visits websites to collect emails, phones, and business names.'}
            </span>
          </div>
          {notice && <div className={`toast-line ${notice.startsWith('Done') ? 'success' : ''}`}><i className={`bi ${busy ? 'bi-arrow-repeat spin' : notice.startsWith('Done') ? 'bi-check-circle-fill' : 'bi-info-circle'}`} />{notice}</div>}

          <div className="mb-3">
            <div className="d-flex gap-2">
              <button className={`btn btn-outline-primary ${activeView === 'extractor' ? 'active' : ''}`} onClick={() => { setActiveView('extractor'); navigate('/search'); }}>
                <i className="bi bi-patch-question me-1" /> Text Extractor
              </button>
              <button className={`btn btn-outline-primary ${activeView === 'live-search' ? 'active' : ''}`} onClick={() => { setActiveView('live-search'); navigate('/search'); }}>
                <i className="bi bi-search me-1" /> Live Search
              </button>
              <button className={`btn btn-outline-primary ${activeView === 'history' ? 'active' : ''}`} onClick={() => { setActiveView('history'); loadHistory(); navigate('/search'); }}>
                <i className="bi bi-clock-history me-1" /> Workspace
              </button>
            </div>
          </div>

          {activeView === 'extractor' ? (
            <>
              <div className="workspace-grid">
                <section className="panel source-panel">
                  <div className="panel-heading"><div className="step-badge">01</div><div><h2>Source material</h2><p>Paste copied page text or import a text file.</p></div></div>
                  <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
                    <div className="upload-icon"><i className="bi bi-cloud-arrow-up" /></div>
                    <div className="drop-copy"><b>Drop a file here or <span>browse files</span></b><small>TXT, CSV, or LOG · up to 10 MB</small></div>
                    <input ref={fileRef} hidden type="file" accept=".txt,.csv,.log,text/plain,text/csv" onChange={event => readFile(event.target.files[0])} />
                  </div>
                  {sourceLabel && <div className="file-chip"><i className="bi bi-file-earmark-text" /><span>{sourceLabel}</span><button onClick={() => { setSourceLabel(''); setRawText(''); }} title="Remove source"><i className="bi bi-x-lg" /></button></div>}
                  <label className="form-label mt-3">Source text <span className="label-muted">Required</span></label>
                  <textarea className="form-control source-text" value={rawText} onChange={event => setRawText(event.target.value)} placeholder={'Paste text, copied page content, or contact data here…\n\nExample: Acme Studio | hello@example.com | +1 555 010 2200 | https://example.com'} />
                  <div className="textarea-foot"><span>{rawText.length.toLocaleString()} characters</span><button className="text-action" onClick={() => { setRawText(''); setSourceLabel(''); setNotice('Source cleared.'); }}>Clear source</button></div>
                  <div className="field-row mt-3">
                    <div className="flex-fill"><label className="form-label">Source label <span className="label-muted">Optional</span></label><input className="form-control" placeholder="e.g. Supplier directory" value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} /></div>
                    <div className="flex-fill"><label className="form-label">Source URL <span className="label-muted">Optional reference</span></label><input className="form-control" type="url" placeholder="https://example.com" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} /></div>
                  </div>
                </section>
                <section className="panel filter-panel">
                  <div className="panel-heading"><div className="step-badge">02</div><div><h2>Search settings</h2><p>Label and narrow the extracted results.</p></div></div>
                  <div className="settings-grid">
                    <div><label className="form-label">Country label</label><select className="form-select" value={filters.country} onChange={event => updateFilter('country', event.target.value)}><option>Any country</option><option>Nigeria</option><option>United States</option><option>United Kingdom</option><option>Canada</option><option>Australia</option><option>Other</option></select></div>
                    <div><label className="form-label">Language label</label><select className="form-select" value={filters.language} onChange={event => updateFilter('language', event.target.value)}><option>Any language</option><option>English</option><option>French</option><option>Spanish</option><option>Portuguese</option><option>Other</option></select></div>
                    <div><label className="form-label">Mailbox type <span className="label-muted">Heuristic</span></label><select className="form-select" value={filters.emailType} onChange={event => updateFilter('emailType', event.target.value)}><option>Any type</option><option>Business</option><option>Personal</option></select></div>
                    <div><label className="form-label">Provider</label><select className="form-select" value={filters.provider} onChange={event => updateFilter('provider', event.target.value)}><option>Any provider</option><option>Gmail</option><option>Outlook</option><option>Yahoo</option><option>iCloud</option><option>Other</option></select></div>
                  </div>
                  <div className="mt-3"><label className="form-label">Keyword filter <span className="label-muted">Optional</span></label><div className="input-icon"><i className="bi bi-search" /><input className="form-control" placeholder="e.g. partnerships, support" value={filters.keywords} onChange={event => updateFilter('keywords', event.target.value)} /></div><div className="form-hint">Keep results whose surrounding source text contains a keyword.</div></div>
                  <div className="mt-3"><label className="form-label">Maximum results</label><div className="range-row"><input className="form-range" type="range" min="10" max="25000" step="10" value={filters.maxResults} onChange={event => updateFilter('maxResults', Number(event.target.value))} /><span className="range-value">{filters.maxResults}</span></div></div>
                  <div className="source-mode mt-4"><div className="mode-icon"><i className="bi bi-file-earmark-check" /></div><div><b>Provided material</b><span>Direct parsing · No web requests</span></div><span className="mode-on">ON</span></div>
                  <div className="control-note"><i className="bi bi-lightning-charge" /><span>Processing runs on the supplied text only. No proxy or thread settings are needed.</span></div>
                  <button className="btn btn-primary run-btn" onClick={extract} disabled={busy}><i className={`bi ${busy ? 'bi-arrow-repeat spin' : 'bi-play-fill'}`} />{busy ? 'Processing…' : 'Start extraction'}<span>Ctrl ↵</span></button>
                </section>
              </div>
              <section className="panel results-panel">
                <div className="results-header">
                  <div className="panel-heading mb-0">
                    <div className="step-badge">03</div>
                    <div><h2>Extracted contacts <span className="count-pill">{resultCount}</span></h2><p>Unique email addresses found in the provided source.</p></div>
                  </div>
                  <div className="results-actions">
                    <input className="form-control result-search" placeholder="Filter these results…" value={resultQuery} onChange={event => setResultQuery(event.target.value)} disabled={!results.length}/>
                    <button className="btn btn-outline-secondary btn-sm" disabled={!results.length} onClick={downloadCsv}><i className="bi bi-download me-2" />Export CSV</button>
                    <button className="btn btn-outline-secondary btn-sm" disabled={!results.length} onClick={() => { setResults([]); setResultQuery(''); setNotice('Results cleared.'); }}><i className="bi bi-trash3 me-1"/>Clear</button>
                  </div>
                </div>
                {results.length ? (
                  <div className="table-responsive">
                    <table className="table results-table">
                      <thead>
                        <tr><th>Name</th><th>Phone</th><th>Email</th><th>Type</th><th>Provider</th><th>URL</th><th>Source</th></tr>
                      </thead>
                      <tbody>
                        {visibleResults.map((row, index) => (
                          <tr key={`${row.email}-${index}`}>
                            <td>{row.name || <span className="text-muted">—</span>}</td>
                            <td>{row.phone || <span className="text-muted">—</span>}</td>
                            <td><a href={`mailto:${row.email}`}>{row.email}</a></td>
                            <td><span className="count-pill">{row.type}</span></td>
                            <td>{row.provider}</td>
                            <td>{row.url ? <a href={row.url} target="_blank" rel="noreferrer">{row.url}</a> : <span className="text-muted">—</span>}</td>
                            <td>{row.sourceLabel || 'Pasted text'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visibleResults.length && <div className="empty-search">No results match that filter.</div>}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-art"><i className="bi bi-inbox" /><span><i className="bi bi-at" /></span></div>
                    <b>No contacts yet</b><p>Add source material and start an extraction to see results here.</p>
                  </div>
                )}
              </section>
            </>
          ) : activeView === 'live-search' ? (
            <SearchWorkspace />
          ) : (
            <>
              <div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Run history</h1><p>Recent extraction jobs and their result counts.</p></div><button className="btn btn-outline-secondary btn-sm" onClick={loadHistory}><i className="bi bi-arrow-clockwise me-2" />Refresh</button></div>
              <section className="panel history-panel">
                {history.length ? (
                  <div className="table-responsive">
                    <table className="table results-table">
                      <thead>
                        <tr><th>Source</th><th>Country</th><th>Language</th><th>Results</th><th>Created</th></tr>
                      </thead>
                      <tbody>
                        {history.map(job => (
                          <tr key={job._id}>
                            <td><i className="bi bi-file-earmark-text me-2 text-primary" />{job.sourceLabel}</td>
                            <td>{job.country}</td>
                            <td>{job.language}</td>
                            <td><span className="count-pill">{job.count}</span></td>
                            <td>{new Date(job.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-art"><i className="bi bi-clock-history" /></div>
                    <b>No saved runs yet</b><p>Completed extractions will appear here when MongoDB is connected.</p>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="footer-note"><span>MAZZI EXTRACTOR <i>·</i> v1.0.0</span><span>Built for secure contact research</span></footer>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/admin" element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          } />
          <Route path="/search" element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          } />
          <Route path="/" element={
            <Navigate to={useAuth().user ? '/search' : '/login'} replace />
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
