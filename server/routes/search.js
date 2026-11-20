import express from 'express';
import mongoose from 'mongoose';
import { SearchService, createContactFromSearch } from '../lib/searchService.js';
import { taskQueue } from '../lib/taskQueue.js';
import { emailVerification } from '../lib/emailVerification.js';
import Extraction from '../models/Extraction.js';
import crypto from 'crypto';

const router = express.Router();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SOURCE_ENGINE_MAP = {
  'search engines': null,
  'company websites': null,
  'business directories': 'business-directories',
  'linkedin': 'linkedin'
};

router.post('/config', (_req, res) => {
  try {
    return res.json({
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
      countries: [
        'Any country', 'United States', 'United Kingdom', 'Canada', 'Australia',
        'Germany', 'France', 'India', 'Brazil', 'Netherlands', 'Spain', 'Italy'
      ],
      languages: [
        'Any language', 'English', 'Spanish', 'French', 'German', 'Portuguese',
        'Italian', 'Dutch', 'Chinese', 'Japanese'
      ],
      providers: ['Any provider', 'Gmail', 'Outlook', 'Yahoo', 'iCloud', 'Other'],
      emailTypes: ['Any type', 'Business', 'Personal', 'Generic'],
      proxySupported: true,
      verificationSupported: true,
      maxConcurrencyDefault: 1
    });
  } catch (error) {
    return res.status(500).json({ message: 'Config failed.', detail: error.message });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { emails = [] } = req.body || {};
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: 'Provide an array of emails to verify.' });
    }
    const results = await emailVerification.verifyBatch(emails);
    return res.json({ results, total: results.length });
  } catch (error) {
    return res.status(500).json({ message: 'Verification failed.', detail: error.message });
  }
});

router.post('/save', async (req, res) => {
  try {
    const {
      taskId,
      keywords,
      searchEngine,
      country,
      language,
      contacts,
      searchesCompleted = 0,
      websitesVisited = 0,
      status = 'completed'
    } = req.body || {};

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ message: 'Contacts array is required.' });
    }

    const record = {
      sourceLabel: taskId || `search-${Date.now()}`,
      sourceUrl: '',
      country,
      language,
      keywords: Array.isArray(keywords) ? keywords.join(',') : String(keywords || ''),
      count: contacts.length,
      items: contacts.map(c => ({
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || '',
        url: c.url || '',
        sourceLabel: c.sourceLabel || '',
        country: c.country || 'Any country',
        language: c.language || 'Any language',
        type: c.type || 'Personal-style mailbox (inferred)',
        provider: c.provider || '',
        source: c.source || 'search',
        verified: c.verified === true,
        confidence: c.confidence || 'low',
        domain: c.domain || (c.email ? c.email.split('@')[1] : '')
      })),
      status,
      searchesCompleted,
      websitesVisited
    };

    let saved;
    if (mongoose.connection.readyState === 1) {
      saved = await Extraction.create(record);
    } else {
      return res.status(503).json({ message: 'MongoDB not connected. Cannot save session.' });
    }

    return res.status(201).json({
      id: saved._id,
      count: saved.count,
      message: 'Session saved successfully.'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save session.', detail: error.message });
  }
});

router.get('/sessions', async (_req, res) => {
  try {
    let sessions;
    if (mongoose.connection.readyState === 1) {
      sessions = await Extraction.find()
        .select('-items')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    } else {
      return res.json([]);
    }
    return res.json(sessions);
  } catch (error) {
    return res.status(500).json({ message: 'Could not load sessions.', detail: error.message });
  }
});

router.get('/sessions/:id', async (_req, res) => {
  try {
    let session;
    if (mongoose.connection.readyState === 1) {
      session = await Extraction.findById(_req.params.id).lean();
    } else {
      return res.status(503).json({ message: 'MongoDB not connected.' });
    }
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    return res.json(session);
  } catch (error) {
    return res.status(500).json({ message: 'Could not load session.', detail: error.message });
  }
});

router.delete('/sessions/:id', async (_req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const result = await Extraction.findByIdAndDelete(_req.params.id);
      if (!result) return res.status(404).json({ message: 'Session not found.' });
    }
    return res.json({ message: 'Session deleted.' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete session.', detail: error.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const {
      keywords = [],
      searchEngine = 'duckduckgo',
      country = 'Any country',
      language = 'Any language',
      sources = ['search engines'],
      maxEmails = 100,
      delayMs = 1500,
      workers = 1,
      proxyEnabled = false,
      proxyList = [],
      apiKeys = {},
      scrapeWebsites = true,
      verifyEmails = false
    } = req.body || {};

    if (!keywords || keywords.length === 0) {
      return res.status(400).json({ message: 'At least one keyword is required.' });
    }

    taskQueue.setMaxConcurrency(workers);

    const taskId = `search-${crypto.randomUUID().slice(0, 8)}`;
    const proxy = proxyEnabled && proxyList && proxyList.length > 0 ? proxyList[0] : null;
    const searchService = new SearchService({ delayMs, proxy, apiKeys });

    taskQueue.createTask(taskId, {
      keywords, searchEngine, country, language, sources,
      maxEmails, delayMs, workers, proxyEnabled, proxyList, apiKeys,
      scrapeWebsites, verifyEmails, status: 'running'
    });

    const runner = async (task) => {
      const allContacts = [];
      const seenEmails = new Set();
      const keywords = task.config.keywords;
      let keywordIndex = 0;

      const enginesToRun = [];
      if (task.config.sources.includes('search engines')) {
        enginesToRun.push(task.config.searchEngine);
      }
      if (task.config.sources.includes('business directories')) {
        enginesToRun.push('business-directories');
      }
      if (task.config.sources.includes('linkedin')) {
        enginesToRun.push('linkedin');
      }

      const addContact = (contact) => {
        if (!contact.email) return false;
        if (seenEmails.has(contact.email)) return false;
        if (allContacts.length >= task.config.maxEmails) return false;
        seenEmails.add(contact.email);
        allContacts.push(contact);
        task.emails = allContacts;
        task.totalEmails = allContacts.length;
        taskQueue.emit('taskUpdated', task);
        return true;
      };

      while (keywordIndex < keywords.length) {
        if (task.stopRequested) break;
        while (task.pauseRequested && !task.stopRequested) {
          task.status = 'paused';
          taskQueue.emit('taskUpdated', task);
          await sleep(1000);
        }
        if (task.stopRequested) break;

        const keyword = keywords[keywordIndex];
        task.currentQuery = keyword;
        taskQueue.emit('taskUpdated', task);

        for (const engine of enginesToRun) {
          if (task.stopRequested) break;
          while (task.pauseRequested && !task.stopRequested) {
            task.status = 'paused';
            taskQueue.emit('taskUpdated', task);
            await sleep(1000);
          }
          if (task.stopRequested) break;

          task.currentSource = `${engine} search`;
          taskQueue.emit('taskUpdated', task);

          try {
            let results = [];
            if (engine === 'linkedin') {
              results = await searchService.scrapeLinkedIn(keyword, task.config.country, task.config.language);
            } else if (engine === 'business-directories') {
              results = await searchService.scrapeBusinessDirectories(keyword, task.config.country, task.config.language);
            } else {
              results = await searchService.searchEngine(keyword, engine, task.config.country, task.config.language);
            }

            task.searchesCompleted++;
            taskQueue.emit('taskUpdated', task);

            for (const result of results) {
              if (task.stopRequested) break;
              while (task.pauseRequested && !task.stopRequested) {
                task.status = 'paused';
                taskQueue.emit('taskUpdated', task);
                await sleep(1000);
              }
              if (task.stopRequested) break;

              const contact = createContactFromSearch(
                result,
                engine,
                result.link,
                task.config.country,
                task.config.language
              );
              addContact(contact);

              if (task.config.scrapeWebsites && result.link && allContacts.length < task.config.maxEmails) {
                if (task.stopRequested) break;
                while (task.pauseRequested && !task.stopRequested) {
                  task.status = 'paused';
                  taskQueue.emit('taskUpdated', task);
                  await sleep(1000);
                }
                if (task.stopRequested) break;

                task.currentSource = result.link;
                task.websitesVisited++;
                taskQueue.emit('taskUpdated', task);

                try {
                  const scraped = await searchService.scrapeWebsite(result.link);
                  for (const email of scraped.emails) {
                    if (task.stopRequested) break;
                    addContact({
                      name: scraped.businessName || '',
                      phone: scraped.phones[0] || '',
                      email,
                      url: result.link,
                      type: searchService.classifyEmail(email),
                      provider: searchService.getProvider(email),
                      sourceLabel: `Website: ${result.link}`,
                      sourceUrl: result.link,
                      country: task.config.country,
                      language: task.config.language,
                      source: 'website',
                      verified: false,
                      confidence: 'medium'
                    });
                  }
                  task.emails = allContacts;
                  task.totalEmails = allContacts.length;
                  taskQueue.emit('taskUpdated', task);
                } catch (scrapeError) {
                  console.error(`Scrape failed for ${result.link}:`, scrapeError.message);
                }

                await sleep(task.config.delayMs);
              }

              if (allContacts.length >= task.config.maxEmails) break;
            }
          } catch (searchError) {
            console.error(`Search failed for "${keyword}" on ${engine}:`, searchError.message);
          }

          if (allContacts.length >= task.config.maxEmails) break;
          await sleep(task.config.delayMs);
        }

        keywordIndex++;
        if (keywordIndex < keywords.length && !task.stopRequested) {
          await sleep(task.config.delayMs);
        }
      }

      if (task.config.verifyEmails && allContacts.length > 0) {
        task.currentSource = 'Verifying emails…';
        taskQueue.emit('taskUpdated', task);
        try {
          const emailsToVerify = allContacts.map(c => c.email).filter(Boolean);
          const verificationResults = await emailVerification.verifyBatch(emailsToVerify);
          const verificationMap = new Map(verificationResults.map(r => [r.email, r]));
          allContacts = allContacts.map(c => {
            const v = verificationMap.get(c.email);
            if (v) {
              return { ...c, verified: v.verified, confidence: v.confidence, provider: v.provider, type: v.type, domain: v.domain };
            }
            return c;
          });
          task.emails = allContacts;
          task.totalEmails = allContacts.length;
          taskQueue.emit('taskUpdated', task);
        } catch (verifyError) {
          console.error('Email verification failed:', verifyError.message);
        }
      }

      task.result = {
        contacts: allContacts,
        totalEmails: allContacts.length,
        searchesCompleted: task.searchesCompleted,
        websitesVisited: task.websitesVisited
      };
      task.progress = 100;
    };

    taskQueue.startTask(taskId, runner);

    return res.json({ taskId, status: 'started' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to start search.', detail: error.message });
  }
});

router.get('/list', (_req, res) => {
  const tasks = taskQueue.listTasks().map(t => ({
    id: t.id,
    status: t.status,
    progress: t.progress,
    totalEmails: t.totalEmails,
    searchesCompleted: t.searchesCompleted,
    websitesVisited: t.websitesVisited,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    config: {
      keywords: t.config.keywords,
      searchEngine: t.config.searchEngine,
      country: t.config.country,
      language: t.config.language,
      sources: t.config.sources,
      workers: t.config.workers
    }
  }));
  return res.json(tasks);
});

router.get('/:id', (_req, res) => {
  const task = taskQueue.getTask(_req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  return res.json({
    id: task.id,
    status: task.status,
    progress: task.progress,
    totalEmails: task.totalEmails,
    searchesCompleted: task.searchesCompleted,
    websitesVisited: task.websitesVisited,
    currentSource: task.currentSource,
    currentQuery: task.currentQuery,
    error: task.error,
    contacts: task.emails || [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  });
});

router.post('/:id/stop', (_req, res) => {
  taskQueue.requestStop(_req.params.id);
  return res.json({ message: 'Stop requested.' });
});

router.post('/:id/pause', (_req, res) => {
  taskQueue.requestPause(_req.params.id);
  return res.json({ message: 'Pause requested.' });
});

router.post('/:id/resume', (_req, res) => {
  taskQueue.requestResume(_req.params.id);
  return res.json({ message: 'Resume requested.' });
});

router.get('/progress/:id', (_req, res) => {
  const taskId = _req.params.id;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendTask = () => {
    const task = taskQueue.getTask(taskId);
    if (task) {
      res.write(`data: ${JSON.stringify({
        status: task.status,
        progress: task.progress,
        totalEmails: task.totalEmails,
        searchesCompleted: task.searchesCompleted,
        websitesVisited: task.websitesVisited,
        currentSource: task.currentSource,
        currentQuery: task.currentQuery,
        contactsCount: (task.emails || []).length,
        contacts: task.emails || [],
        error: task.error
      })}\n\n`);
    }
  };

  sendTask();

  const handler = (task) => {
    if (task.id === taskId) sendTask();
  };

  taskQueue.on('taskUpdated', handler);

  _req.on('close', () => {
    taskQueue.off('taskUpdated', handler);
  });
});

router.post('/remove-duplicates', async (req, res) => {
  try {
    const { contacts = [] } = req.body || {};
    if (!Array.isArray(contacts)) {
      return res.status(400).json({ message: 'Provide a contacts array.' });
    }
    const seen = new Set();
    const unique = contacts.filter(c => {
      const key = (c.email || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return res.json({ unique, removed: contacts.length - unique.length, total: unique.length });
  } catch (error) {
    return res.status(500).json({ message: 'Remove duplicates failed.', detail: error.message });
  }
});

export default router;
