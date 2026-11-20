import { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const COUNTRIES = [
  'Any country', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'India', 'Brazil', 'Netherlands', 'Spain', 'Italy'
];

const LANGUAGES = [
  'Any language', 'English', 'Spanish', 'French', 'German', 'Portuguese',
  'Italian', 'Dutch', 'Chinese', 'Japanese'
];

const PROVIDERS = ['Any provider', 'Gmail', 'Outlook', 'Yahoo', 'iCloud', 'Other'];

export default function SearchWorkspace() {
  const [config, setConfig] = useState(null);
  const [simpleMode, setSimpleMode] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [apiKeys, setApiKeys] = useState({ google: '', serper: '', serpapi: '' });
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [form, setForm] = useState({
    keywords: '',
    searchEngine: 'duckduckgo',
    country: 'Any country',
    language: 'Any language',
    sources: ['search engines', 'company websites'],
    maxEmails: 100,
    delayMs: 1500,
    workers: 1,
    proxyEnabled: false,
    proxyList: '',
    scrapeWebsites: true,
    verifyEmails: false
  });
  const [filters, setFilters] = useState({
    emailType: 'Any type',
    provider: 'Any provider',
    countryFilter: 'Any country',
    sourceFilter: 'Any source',
    searchText: '',
    verified: 'Any'
  });
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const pollRef = useRef(null);
  const eventSourceRef = useRef(null);

  const addLog = (message) => {
    setLogs(prev => [...prev.slice(-99), `${new Date().toLocaleTimeString()} ${message}`]);
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/search/config`)
      .then(r => r.json())
      .then(data => setConfig(data))
      .catch(() => setConfig({
        searchEngines: [
          { value: 'duckduckgo', label: 'DuckDuckGo', apiKeyRequired: false, note: 'HTML scraping, no key required' },
          { value: 'bing', label: 'Bing', apiKeyRequired: false, note: 'HTML scraping, no key required' },
          { value: 'google', label: 'Google', apiKeyRequired: true, note: 'Requires Serper/SerpAPI key' }
        ],
        sources: [
          { value: 'search engines', label: 'Search Engines' },
          { value: 'company websites', label: 'Company Websites' },
          { value: 'business directories', label: 'Business Directories' },
          { value: 'linkedin', label: 'LinkedIn (public)' }
        ],
        countries: COUNTRIES,
        languages: LANGUAGES,
        providers: PROVIDERS,
        emailTypes: ['Any type', 'Business', 'Personal', 'Generic'],
        proxySupported: true,
        verificationSupported: true,
        maxConcurrencyDefault: 1
      }));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/config`)
      .then(r => r.json())
      .then(data => {
        if (data.googleApiKeyConfigured) {
          setApiKeys(prev => ({ ...prev, google: '[configured]' }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateApiKey = (key, value) => {
    setApiKeys(prev => ({ ...prev, [key]: value }));
  };

  const toggleSource = (value) => {
    setForm(prev => ({
      ...prev,
      sources: prev.sources.includes(value)
        ? prev.sources.filter(v => v !== value)
        : [...prev.sources, value]
    }));
  };

  const parseKeywords = () => form.keywords.split(',').map(k => k.trim()).filter(Boolean);

  const connectProgress = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (eventSourceRef.current) eventSourceRef.current.close();

    const es = new EventSource(`${API_BASE}/api/search/progress/${id}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setTaskStatus(data);
        if (data.contacts && data.contacts.length > 0) {
          setContacts(prev => {
            const next = [...data.contacts];
            return next;
          });
        }
        if (data.status === 'completed' || data.status === 'stopped' || data.status === 'error') {
          addLog(`Search ${data.status}. Emails found: ${data.totalEmails}, Searches: ${data.searchesCompleted}, Sites: ${data.websitesVisited}`);
          es.close();
          eventSourceRef.current = null;
        }
      } catch (e) {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      pollRef.current = setInterval(async () => {
        try {
          const response = await fetch(`${API_BASE}/api/search/${id}`);
          const task = await response.json();
          setTaskStatus(task);
          if (task.contacts && task.contacts.length > 0) {
            setContacts(task.contacts);
          }
          if (task.status === 'completed' || task.status === 'stopped' || task.status === 'error') {
            addLog(`Search ${task.status}. Emails found: ${task.totalEmails}`);
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch (e) {}
      }, 2000);
    };
  };

  const startSearch = async () => {
    const keywords = parseKeywords();
    if (keywords.length === 0) {
      addLog('Enter at least one keyword.');
      return;
    }
    if (form.searchEngine === 'google' && !apiKeys.google && !apiKeys.serper && !apiKeys.serpapi) {
      addLog('Google search requires an API key. Enter Serper/SerpAPI/Google key in Advanced Mode.');
      return;
    }
    setLogs([]);
    setContacts([]);
    setSelectedEmails(new Set());
    try {
      const response = await fetch(`${API_BASE}/api/search/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords,
          searchEngine: form.searchEngine,
          country: form.country,
          language: form.language,
          sources: form.sources,
          maxEmails: Number(form.maxEmails),
          delayMs: Number(form.delayMs),
          workers: Number(form.workers),
          proxyEnabled: form.proxyEnabled,
          proxyList: form.proxyEnabled ? form.proxyList.split('\n').filter(Boolean) : [],
          apiKeys: {
            google: apiKeys.google || undefined,
            serper: apiKeys.serper || undefined,
            serpapi: apiKeys.serpapi || undefined
          },
          scrapeWebsites: form.scrapeWebsites,
          verifyEmails: form.verifyEmails
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Start failed');
      setTaskId(data.taskId);
      addLog(`Search started: ${data.taskId}`);
      connectProgress(data.taskId);
    } catch (error) {
      addLog(`Error: ${error.message}`);
    }
  };

  const stopSearch = async () => {
    if (!taskId) return;
    await fetch(`${API_BASE}/api/search/${taskId}/stop`, { method: 'POST' });
    addLog('Stop requested.');
  };

  const pauseSearch = async () => {
    if (!taskId) return;
    await fetch(`${API_BASE}/api/search/${taskId}/pause`, { method: 'POST' });
    addLog('Pause requested.');
  };

  const resumeSearch = async () => {
    if (!taskId) return;
    await fetch(`${API_BASE}/api/search/${taskId}/resume`, { method: 'POST' });
    addLog('Resume requested.');
  };

  const testSearch = async () => {
    const keywords = parseKeywords();
    if (keywords.length === 0) return;
    addLog(`Test query: "${keywords[0]}" on ${form.searchEngine}...`);
    try {
      const response = await fetch(`${API_BASE}/api/search/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: [keywords[0]],
          searchEngine: form.searchEngine,
          country: form.country,
          language: form.language,
          sources: form.sources,
          maxEmails: 10,
          delayMs: Number(form.delayMs),
          workers: 1,
          proxyEnabled: false,
          proxyList: [],
          apiKeys: {
            google: apiKeys.google || undefined,
            serper: apiKeys.serper || undefined,
            serpapi: apiKeys.serpapi || undefined
          },
          scrapeWebsites: false,
          verifyEmails: false
        })
      });
      const data = await response.json();
      setTaskId(data.taskId);
      connectProgress(data.taskId);
      addLog('Test search started (max 10 emails).');
    } catch (error) {
      addLog(`Test failed: ${error.message}`);
    }
  };

  const verifyEmails = async () => {
    const emails = contacts.map(c => c.email).filter(Boolean);
    if (emails.length === 0) {
      addLog('No emails to verify.');
      return;
    }
    setVerifying(true);
    try {
      const response = await fetch(`${API_BASE}/api/search/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails })
      });
      const data = await response.json();
      const verificationMap = new Map(data.results.map(r => [r.email, r]));
      setContacts(contacts.map(c => {
        const v = verificationMap.get(c.email);
        if (v) return { ...c, verified: v.verified, confidence: v.confidence, provider: v.provider, type: v.type, domain: v.domain };
        return c;
      }));
      addLog(`Verified ${data.results.length} emails.`);
    } catch (error) {
      addLog(`Verification failed: ${error.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const saveSession = async () => {
    if (!taskId || contacts.length === 0) {
      addLog('No search results to save.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/search/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          keywords: form.keywords,
          searchEngine: form.searchEngine,
          country: form.country,
          language: form.language,
          contacts,
          searchesCompleted: taskStatus?.searchesCompleted || 0,
          websitesVisited: taskStatus?.websitesVisited || 0,
          status: taskStatus?.status || 'completed'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Save failed');
      addLog(`Session saved: ${data.id}`);
      loadSessions();
    } catch (error) {
      addLog(`Save failed: ${error.message}`);
    }
  };

  const loadSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/search/sessions`);
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      addLog(`Could not load sessions: ${error.message}`);
    }
  };

  const loadSession = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/api/search/sessions/${id}`);
      const session = await response.json();
      setContacts(session.items || []);
      setSelectedEmails(new Set());
      setTaskStatus({ status: session.status, totalEmails: session.count, searchesCompleted: session.searchesCompleted, websitesVisited: session.websitesVisited });
      setTaskId(null);
      addLog(`Loaded session: ${session.sourceLabel} (${session.count} emails)`);
    } catch (error) {
      addLog(`Could not load session: ${error.message}`);
    }
  };

  const deleteSession = async (id) => {
    if (!confirm('Delete this session?')) return;
    try {
      await fetch(`${API_BASE}/api/search/sessions/${id}`, { method: 'DELETE' });
      addLog('Session deleted.');
      loadSessions();
    } catch (error) {
      addLog(`Delete failed: ${error.message}`);
    }
  };

  const toggleSelect = (email) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allEmails = new Set(filteredContacts.map(c => c.email).filter(Boolean));
    if (allEmails.size > 0 && [...allEmails].every(e => selectedEmails.has(e))) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(allEmails);
    }
  };

  const getSelectedContacts = () => {
    if (selectedEmails.size === 0) return filteredContacts;
    return filteredContacts.filter(c => selectedEmails.has(c.email));
  };

  const removeDuplicates = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/search/remove-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts })
      });
      const data = await response.json();
      setContacts(data.unique);
      setSelectedEmails(new Set());
      addLog(`Removed ${data.removed} duplicates. ${data.total} unique contacts remain.`);
    } catch (error) {
      addLog(`Remove duplicates failed: ${error.message}`);
    }
  };

  const clearSelected = () => {
    const selectedSet = new Set(selectedEmails);
    setContacts(contacts.filter(c => !selectedSet.has(c.email)));
    setSelectedEmails(new Set());
    addLog(`Cleared ${selectedSet.size} selected results.`);
  };

  const clearAllResults = () => {
    setContacts([]);
    setSelectedEmails(new Set());
    setTaskStatus(null);
    addLog('All results cleared.');
  };

  const filteredContacts = contacts.filter(c => {
    if (filters.emailType !== 'Any type') {
      const isBusiness = c.type.startsWith('Business');
      const isGeneric = /^(info|hello|contact|support|sales|service|office|admin|team|careers|press|billing|orders|marketing)@/.test(c.email);
      if (filters.emailType === 'Business' && !isBusiness) return false;
      if (filters.emailType === 'Personal' && isBusiness) return false;
      if (filters.emailType === 'Generic' && !isGeneric) return false;
    }
    if (filters.provider !== 'Any provider') {
      if (filters.provider === 'Other' && ['Gmail','Outlook','Yahoo','iCloud'].includes(c.provider)) return false;
      if (filters.provider !== 'Other' && c.provider !== filters.provider) return false;
    }
    if (filters.countryFilter !== 'Any country' && c.country !== filters.countryFilter) return false;
    if (filters.sourceFilter !== 'Any source' && c.source !== filters.sourceFilter) return false;
    if (filters.verified !== 'Any') {
      const isVerified = c.verified === true;
      if (filters.verified === 'Verified' && !isVerified) return false;
      if (filters.verified === 'Unverified' && isVerified) return false;
    }
    if (filters.searchText) {
      const q = filters.searchText.toLowerCase();
      return [c.email, c.name, c.provider, c.sourceLabel, c.url, c.country, c.domain, c.source].some(
        field => String(field || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sourcesList = [...new Set(filteredContacts.map(c => c.source).filter(Boolean))];
  const countriesList = [...new Set(filteredContacts.map(c => c.country).filter(Boolean))];

  const downloadBlob = (content, mime, filename) => {
    const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSelected = () => {
    const toExport = getSelectedContacts();
    if (toExport.length === 0) return;
    const headers = ['Name','Phone','Email','Type','Provider','Domain','URL','Source','Country','Language','Verified','Confidence'];
    const rows = [headers, ...toExport.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.type}"`,
      `"${c.provider}"`,
      `"${c.domain || ''}"`,
      `"${c.url || ''}"`,
      `"${c.sourceLabel}"`,
      `"${c.country}"`,
      `"${c.language}"`,
      `"${c.verified ? 'Yes' : 'No'}"`,
      `"${c.confidence || ''}"`
    ])];
    downloadBlob(rows.map(r => r.join(',')).join('\r\n'), 'text/csv', 'mazzi-selected-results.csv');
  };

  const exportCSV = () => {
    if (filteredContacts.length === 0) return;
    const headers = ['Name','Phone','Email','Type','Provider','Domain','URL','Source','Country','Language','Verified','Confidence'];
    const rows = [headers, ...filteredContacts.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.type}"`,
      `"${c.provider}"`,
      `"${c.domain || ''}"`,
      `"${c.url || ''}"`,
      `"${c.sourceLabel}"`,
      `"${c.country}"`,
      `"${c.language}"`,
      `"${c.verified ? 'Yes' : 'No'}"`,
      `"${c.confidence || ''}"`
    ])];
    downloadBlob(rows.map(r => r.join(',')).join('\r\n'), 'text/csv', 'mazzi-search-results.csv');
  };

  const exportJSON = () => {
    if (filteredContacts.length === 0) return;
    const blob = new Blob([JSON.stringify(filteredContacts, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'application/json', 'mazzi-search-results.json');
  };

  const exportTXT = () => {
    if (filteredContacts.length === 0) return;
    const txt = filteredContacts.map(c => c.email).join('\n');
    downloadBlob(txt, 'text/plain', 'mazzi-search-results.txt');
  };

  const isRunning = taskStatus?.status === 'running' || taskStatus?.status === 'pending';
  const isPaused = taskStatus?.status === 'paused';

  const simpleControls = (
    <div className="row">
      <div className="col-md-6 mb-3">
        <label className="form-label">Search Keywords (comma-separated)</label>
        <input className="form-control" placeholder="plumbing companies, electricians"
          value={form.keywords} onChange={e => updateForm('keywords', e.target.value)} />
      </div>
      <div className="col-md-3 mb-3">
        <label className="form-label">Country</label>
        <select className="form-select" value={form.country} onChange={e => updateForm('country', e.target.value)}>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="col-md-3 mb-3 d-flex align-items-end">
        <button className="btn btn-primary w-100" onClick={startSearch} disabled={isRunning}>
          {isRunning ? 'Searching…' : 'Start Search'}
        </button>
      </div>
    </div>
  );

  const advancedControls = (
    <>
      <div className="row mb-3">
        <div className="col-md-3">
          <label className="form-label">Search Keywords (comma-separated)</label>
          <input className="form-control" placeholder="plumbing companies, electricians"
            value={form.keywords} onChange={e => updateForm('keywords', e.target.value)} />
        </div>
        <div className="col-md-2">
          <label className="form-label">Search Engine</label>
          <select className="form-select" value={form.searchEngine} onChange={e => updateForm('searchEngine', e.target.value)}>
            {config?.searchEngines?.map(e => (
              <option key={e.value} value={e.value}>{e.label} {e.apiKeyRequired ? ` ⚠️ key` : ''}</option>
            ))}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label">Country</label>
          <select className="form-select" value={form.country} onChange={e => updateForm('country', e.target.value)}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label">Language</label>
          <select className="form-select" value={form.language} onChange={e => updateForm('language', e.target.value)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="col-md-3 d-flex align-items-end">
          <button className="btn btn-primary w-100" onClick={startSearch} disabled={isRunning}>
            {isRunning ? 'Searching…' : 'Start Search'}
          </button>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-8">
          <label className="form-label">Sources</label>
          <div className="form-check">
            {config?.sources?.map(s => (
              <div key={s.value} className="form-check form-check-inline">
                <input className="form-check-input" type="checkbox" value={s.value}
                  checked={form.sources.includes(s.value)} onChange={() => toggleSource(s.value)} />
                <label className="form-check-label">{s.label}</label>
              </div>
            ))}
          </div>
        </div>
        <div className="col-md-4">
          <label className="form-label">Max Emails</label>
          <input className="form-control" type="number" min="1" max="10000"
            value={form.maxEmails} onChange={e => updateForm('maxEmails', e.target.value)} />
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-4">
          <label className="form-label">Delay Between Requests (ms)</label>
          <input className="form-control" type="number" min="0"
            value={form.delayMs} onChange={e => updateForm('delayMs', e.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Workers / Threads</label>
          <input className="form-control" type="number" min="1" max="10"
            value={form.workers} onChange={e => updateForm('workers', e.target.value)} />
        </div>
        <div className="col-md-4">
          <div className="form-check mt-4">
            <input className="form-check-input" type="checkbox" checked={form.scrapeWebsites}
              onChange={() => updateForm('scrapeWebsites', !form.scrapeWebsites)} />
            <label className="form-check-label">Visit found websites</label>
          </div>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-6">
          <label className="form-label">Proxy List (one per line, e.g. http://user:pass@ip:port)</label>
          <textarea className="form-control" rows="3"
            value={form.proxyList} onChange={e => updateForm('proxyList', e.target.value)} />
        </div>
        <div className="col-md-6 d-flex align-items-end">
          <div className="form-check me-2">
            <input className="form-check-input" type="checkbox" checked={form.proxyEnabled}
              onChange={() => updateForm('proxyEnabled', !form.proxyEnabled)} />
            <label className="form-check-label">Enable Proxy</label>
          </div>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-4">
          <div className="form-check">
            <input className="form-check-input" type="checkbox" checked={form.verifyEmails}
              onChange={() => updateForm('verifyEmails', !form.verifyEmails)} />
            <label className="form-check-label">Verify emails after search (MX lookup)</label>
          </div>
        </div>
        {config?.searchEngines?.some(e => e.value === 'google' && e.apiKeyRequired) && (
          <div className="col-md-4">
            <label className="form-label">Google / Serper / SerpAPI Key</label>
            <div className="input-group">
              <input className="form-control" type="password"
                value={apiKeys.google || ''}
                onChange={e => updateApiKey('google', e.target.value)}
                placeholder="Enter API key" />
              <button className="btn btn-outline-secondary" type="button" onClick={() => updateApiKey('google', '')}>Clear</button>
            </div>
            <div className="form-text mt-1">Stored in memory only for this session.</div>
          </div>
        )}
        <div className="col-md-4">
          <button className="btn btn-primary w-100" onClick={testSearch} disabled={isRunning}>
            Test Search
          </button>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-3">
          <button className="btn btn-secondary w-100" onClick={pauseSearch} disabled={!isRunning || isPaused}>
            Pause
          </button>
        </div>
        <div className="col-md-3">
          <button className="btn btn-outline-secondary w-100" onClick={resumeSearch} disabled={!isPaused}>
            Resume
          </button>
        </div>
        <div className="col-md-3 mt-2">
          <button className="btn btn-danger w-100" onClick={stopSearch} disabled={!isRunning && !isPaused}>
            Stop
          </button>
        </div>
        <div className="col-md-3 mt-2">
          <button className="btn btn-outline-primary w-100" onClick={saveSession} disabled={!contacts.length || !taskId}>
            Save Session
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2><i className="bi bi-search me-2"></i>Mazzi Live Search</h2>
          <p className="text-muted">Real-time web search &amp; email extraction platform</p>
        </div>
        <div className="text-end">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setSimpleMode(!simpleMode)}>
            {simpleMode ? 'Advanced Mode' : 'Simple Mode'}
          </button>
        </div>
      </div>

      <div className="alert alert-warning border-warning mb-4">
        <i className="bi bi-exclamation-triangle me-2"></i>
        <strong>Compliance Notice:</strong> Web scraping and email collection are subject to website Terms of Service,
        data protection laws (GDPR, CCPA, CAN-SPAM), and local regulations. You are responsible for lawful use.
        DuckDuckGo and Bing HTML scraping require no API key but may be rate-limited. Google requires a Serper/SerpAPI key.
        LinkedIn requires authentication and is not fully scrapeable. This tool does not provide proxies — you supply your own.
      </div>

      <div className="row mb-4">
        <div className={`col-md-6 ${!simpleMode ? 'col-lg-8' : ''}`}>
          {simpleMode ? simpleControls : advancedControls}
        </div>
        {!simpleMode && (
          <div className="col-md-4 col-lg-4">
            <div className="card">
              <div className="card-header"><strong>Run Controls</strong></div>
              <div className="card-body">
                <div className="mb-2">
                  <strong className={taskStatus?.status === 'running' ? 'text-success' : taskStatus?.status === 'paused' ? 'text-warning' : 'text-muted'}>
                    ● {taskStatus?.status || 'Idle'}
                  </strong>
                </div>
                <button className="btn btn-primary w-100 mb-2" onClick={startSearch} disabled={isRunning}>
                  Start Search
                </button>
                <button className="btn btn-warning w-100 mb-2" onClick={testSearch} disabled={isRunning}>
                  Test Search
                </button>
                <button className="btn btn-secondary w-100 mb-2" onClick={pauseSearch} disabled={!isRunning || isPaused}>
                  Pause
                </button>
                <button className="btn btn-outline-secondary w-100 mb-2" onClick={resumeSearch} disabled={!isPaused}>
                  Resume
                </button>
                <button className="btn btn-danger w-100" onClick={stopSearch} disabled={!isRunning && !isPaused}>
                  Stop
                </button>
                <button className="btn btn-outline-primary w-100 mt-2" onClick={verifyEmails} disabled={verifying || !contacts.length}>
                  {verifying ? 'Verifying…' : 'Verify Emails'}
                </button>
                <button className="btn btn-outline-primary w-100 mt-2" onClick={saveSession} disabled={!contacts.length || !taskId}>
                  Save Session
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {taskStatus && (
        <div className="card mb-4">
          <div className="card-header">
            <strong>Live Progress</strong>
            <span className="float-end text-muted">
              {taskStatus.totalEmails} emails · {taskStatus.searchesCompleted} searches · {taskStatus.websitesVisited} sites
            </span>
          </div>
          <div className="card-body">
            <div className="progress mb-2">
              <div
                className="progress-bar progress-bar-striped progress-bar-animated"
                role="progressbar"
                style={{ width: `${taskStatus.progress}%` }}
              >
                {taskStatus.progress}%
              </div>
            </div>
            <div className="small text-muted">
              {taskStatus.currentQuery ? `Query: <strong>${taskStatus.currentQuery}</strong>` : ''}
              {taskStatus.currentSource ? ` | Source: <strong>${taskStatus.currentSource}</strong>` : ''}
              {taskStatus.contactsCount != null ? ` | Live contacts: ${taskStatus.contactsCount}` : ''}
              {taskStatus.error ? ` | Error: ${taskStatus.error}` : ''}
            </div>
          </div>
        </div>
      )}

      {!simpleMode && contacts.length > 0 && (
        <div className="card mb-3">
          <div className="card-body">
            <div className="row g-2">
              <div className="col-md-3">
                <label className="form-label small">Email Type</label>
                <select className="form-select form-select-sm"
                  value={filters.emailType}
                  onChange={e => setFilters({...filters, emailType: e.target.value})}>
                  <option>Any type</option>
                  <option>Business</option>
                  <option>Personal</option>
                  <option>Generic</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small">Provider</label>
                <select className="form-select form-select-sm"
                  value={filters.provider}
                  onChange={e => setFilters({...filters, provider: e.target.value})}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small">Country</label>
                <select className="form-select form-select-sm"
                  value={filters.countryFilter}
                  onChange={e => setFilters({...filters, countryFilter: e.target.value})}>
                  <option>Any country</option>
                  {countriesList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small">Source</label>
                <select className="form-select form-select-sm"
                  value={filters.sourceFilter}
                  onChange={e => setFilters({...filters, sourceFilter: e.target.value})}>
                  <option>Any source</option>
                  {sourcesList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="row g-2 mt-2">
              <div className="col-md-4">
                <label className="form-label small">Verification</label>
                <select className="form-select form-select-sm"
                  value={filters.verified}
                  onChange={e => setFilters({...filters, verified: e.target.value})}>
                  <option>Any</option>
                  <option>Verified</option>
                  <option>Unverified</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label small">Search results</label>
                <input className="form-control form-control-sm"
                  placeholder="email, name, domain, source…"
                  value={filters.searchText}
                  onChange={e => setFilters({...filters, searchText: e.target.value})} />
              </div>
              <div className="col-md-2 d-flex align-items-end">
                <span className="badge bg-secondary me-2">{filteredContacts.length} of {contacts.length} showing</span>
              </div>
            </div>
            <div className="row g-2 mt-2">
              <div className="col-md-4">
                <button className="btn btn-outline-danger btn-sm w-100" onClick={clearSelected} disabled={selectedEmails.size === 0}>
                  Clear Selected ({selectedEmails.size})
                </button>
              </div>
              <div className="col-md-4">
                <button className="btn btn-outline-warning btn-sm w-100" onClick={removeDuplicates}>
                  Remove Duplicates
                </button>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <button className="btn btn-danger btn-sm" onClick={clearAllResults}>Clear All</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>Extracted Contacts</strong>
          <div className="text-end">
            <div className="form-check form-check-inline me-2">
              <input className="form-check-input" type="checkbox"
                checked={selectedEmails.size > 0 && filteredContacts.every(c => selectedEmails.has(c.email)) && filteredContacts.length > 0}
                onChange={toggleSelectAll} />
              <label className="form-check-label">Select all visible</label>
            </div>
            {filteredContacts.length > 0 && (
              <>
                <button className="btn btn-sm btn-outline-primary me-1" onClick={exportSelected} disabled={selectedEmails.size === 0}>
                  CSV (selected)
                </button>
                <button className="btn btn-sm btn-outline-primary me-1" onClick={exportCSV}>CSV</button>
                <button className="btn btn-sm btn-outline-primary me-1" onClick={exportJSON}>JSON</button>
                <button className="btn btn-sm btn-outline-primary" onClick={exportTXT}>TXT</button>
              </>
            )}
          </div>
        </div>
        <div className="card-body p-0">
          {filteredContacts.length === 0 && !taskStatus ? (
            <div className="text-center py-4 text-muted">
              <i className="bi bi-inbox fs-1 mb-2"></i><br />
              No contacts yet. Enter keywords and start a search.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '30px' }}></th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Provider</th>
                    <th>Domain</th>
                    <th>Phone</th>
                    <th>Source</th>
                    <th>Country</th>
                    <th>Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((c, i) => {
                    const isSelected = selectedEmails.has(c.email);
                    return (
                      <tr key={c.email + i} className={isSelected ? 'table-active' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={isSelected}
                            onChange={() => toggleSelect(c.email)}
                          />
                        </td>
                        <td>
                          <a href={`mailto:${c.email}`}>{c.email}</a>
                        </td>
                        <td>{c.name || '<em className="text-muted">—</em>'}</td>
                        <td><span className={`badge ${c.type.startsWith('Business') ? 'bg-primary' : 'bg-secondary'}`}>{c.type}</span></td>
                        <td>{c.provider}</td>
                        <td>{c.domain || '<em className="text-muted">—</em>'}</td>
                        <td>{c.phone || '<em className="text-muted">—</em>'}</td>
                        <td>{c.sourceLabel}</td>
                        <td>{c.country}</td>
                        <td>
                          {c.verified ? (
                            <span className="badge bg-success">✓ {c.confidence}</span>
                          ) : (
                            <span className="badge bg-secondary">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {!simpleMode && logs.length > 0 && (
        <div className="card mt-4">
          <div className="card-header"><strong>Activity Log</strong></div>
          <div className="card-body p-2" style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.85rem', fontFamily: 'monospace' }}>
            {logs.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
