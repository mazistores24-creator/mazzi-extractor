import axios from 'axios';
import { load } from 'cheerio';
import { resolveMx } from 'dns/promises';

const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
const PHONE_REGEX = /(?:(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4})/g;
const URL_REGEX = /https?:\/\/(?:www\.)?[^\s<>()\[\]{}"'\\]+/gi;

const ROLE_PREFIXES = new Set([
  'info','hello','contact','support','sales','service','office','admin',
  'team','careers','press','billing','orders','marketing','enquiries','inquiries'
]);

const PROVIDER_MAP = {
  'gmail.com': 'Gmail', 'googlemail.com': 'Gmail',
  'outlook.com': 'Outlook', 'hotmail.com': 'Outlook', 'live.com': 'Outlook',
  'yahoo.com': 'Yahoo', 'yahoo.co.uk': 'Yahoo',
  'icloud.com': 'iCloud', 'me.com': 'iCloud'
};

const COUNTRY_TLD = {
  'united states': 'us', 'united kingdom': 'uk', 'canada': 'ca',
  'australia': 'au', 'germany': 'de', 'france': 'fr',
  'india': 'in', 'brazil': 'br', 'netherlands': 'nl',
  'spain': 'es', 'italy': 'it', 'japan': 'jp', 'china': 'cn'
};

const COUNTRY_GL = {
  'united states': 'us', 'united kingdom': 'uk', 'canada': 'ca',
  'australia': 'au', 'germany': 'de', 'france': 'fr',
  'india': 'in', 'brazil': 'br', 'netherlands': 'nl',
  'spain': 'es', 'italy': 'it', 'japan': 'jp', 'china': 'cn'
};

const LANGUAGE_HL = {
  'english': 'en', 'spanish': 'es', 'french': 'fr', 'german': 'de',
  'portuguese': 'pt', 'italian': 'it', 'dutch': 'nl',
  'chinese': 'zh-CN', 'japanese': 'ja'
};

const clean = (value) => value?.replace(/[;,.)\]}]+$/g, '').trim() || '';

export class SearchService {
  constructor({ delayMs = 1500, proxy = null, userAgent = null, apiKeys = {} } = {}) {
    this.delayMs = delayMs;
    this.proxy = proxy;
    this.apiKeys = apiKeys || {};
    const httpsAgentOptions = {};
    if (proxy) {
      httpsAgentOptions.proxy = {
        host: proxy.host || proxy.hostname || proxy.split('://')[1]?.split(':')[0] || '',
        port: Number(proxy.port || proxy.split(':').pop() || 8080)
      };
      if (proxy.auth) {
        httpsAgentOptions.proxy.auth = proxy.auth;
      }
    }
    this.http = axios.create({
      timeout: 20000,
      httpsAgent: proxy ? new (require('https').Agent)(httpsAgentOptions) : undefined,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      }
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  classifyEmail(email) {
    const [localPart] = email.split('@');
    const first = localPart?.split(/[.+_-]/)[0]?.toLowerCase();
    if (ROLE_PREFIXES.has(first)) return 'Business mailbox (inferred)';
    return 'Personal-style mailbox (inferred)';
  }

  getProvider(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    return PROVIDER_MAP[domain] || domain;
  }

  extractEmails(text) {
    if (!text) return [];
    return [...text.matchAll(EMAIL_REGEX)].map(m => m[0].toLowerCase());
  }

  extractPhones(text) {
    if (!text) return [];
    return [...text.matchAll(PHONE_REGEX)].map(m => clean(m[0])).filter(Boolean);
  }

  extractUrls(text) {
    if (!text) return [];
    return [...text.matchAll(URL_REGEX)].map(m => clean(m[0])).filter(Boolean);
  }

  guessNameBeforeEmail(line, email) {
    const index = line.indexOf(email);
    if (index <= 0) return '';
    const before = line.slice(0, index).replace(/[|,;\s-]+$/g, '').trim();
    return before.length <= 120 ? before : '';
  }

  async fetchHtml(url) {
    const response = await this.http.get(url, {
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400
    });
    return response.data;
  }

  buildQuery(keywords, country, language) {
    const parts = [...keywords.filter(Boolean)];
    if (country && country !== 'Any country') parts.push(`"${country}"`);
    if (language && language !== 'Any language') parts.push(`language:${language}`);
    return parts.join(' ');
  }

  getSearchUrl(engine, query, country, language) {
    const encoded = encodeURIComponent(query);
    const gl = country !== 'Any country' ? (COUNTRY_GL[country.toLowerCase()] || '') : '';
    const hl = language !== 'Any language' ? (LANGUAGE_HL[language.toLowerCase()] || 'en') : 'en';
    const tld = country !== 'Any country' ? (COUNTRY_TLD[country.toLowerCase()] || 'com') : 'com';

    if (engine === 'duckduckgo') {
      return `https://html.duckduckgo.com/html/?q=${encoded}`;
    }
    if (engine === 'bing') {
      const params = `q=${encoded}${gl ? `&cc=${gl}` : ''}${hl ? `&setlang=${hl}` : ''}`;
      return `https://www.bing.com/search?${params}`;
    }
    if (engine === 'google') {
      const apiKey = this.apiKeys.google || this.apiKeys.serper || this.apiKeys.serpapi;
      if (!apiKey) {
        throw new Error('Google search requires an API key (Serper, SerpAPI, or Google Custom Search) in server configuration.');
      }
      return null;
    }
    throw new Error(`Unsupported search engine: ${engine}`);
  }

  parseSearchResults(html, engine) {
    const $ = load(html);
    const results = [];

    if (engine === 'duckduckgo') {
      $('.result').each((_, el) => {
        const $el = $(el);
        const title = $el.find('.result__title').text().trim();
        const snippet = $el.find('.result__snippet').text().trim();
        const link = $el.find('.result__a').attr('href') || $el.find('a.result__a').attr('href') || '';
        if (link) results.push({ title, snippet, link, source: engine });
      });
    } else if (engine === 'bing') {
      $('li.b_algo').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h2').text().trim();
        const link = $el.find('h2 a').attr('href') || '';
        const snippet = $el.find('.b_caption p').text().trim() || $el.find('.b_snippet').text().trim();
        if (link) results.push({ title, snippet, link, source: engine });
      });
    }

    return results;
  }

  async searchGoogle(query, country, language) {
    const apiKey = this.apiKeys.google || this.apiKeys.serper || this.apiKeys.serpapi;
    if (!apiKey) {
      throw new Error('Google search requires an API key (Serper, SerpAPI, or Google Custom Search).');
    }

    const gl = country !== 'Any country' ? (COUNTRY_GL[country.toLowerCase()] || '') : '';
    const hl = language !== 'Any language' ? (LANGUAGE_HL[language.toLowerCase()] || 'en') : 'en';

    try {
      const response = await this.http.post('https://google.serper.dev/search', {
        q: query,
        gl,
        hl,
        num: 10
      }, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      });
      const data = response.data || {};
      const results = [];
      for (const item of data.answerBox || []) {
        if (item.link) results.push({ title: item.title || '', snippet: item.snippet || '', link: item.link, source: 'google' });
      }
      for (const item of data.searchResults || data.organic || []) {
        if (item.link) results.push({ title: item.title || '', snippet: item.snippet || '', link: item.link, source: 'google' });
      }
      return results;
    } catch (error) {
      throw new Error(`Google search failed: ${error.message}`);
    }
  }

  async searchEngine(query, engine, country, language) {
    if (engine === 'google') {
      return this.searchGoogle(query, country, language);
    }

    const url = this.getSearchUrl(engine, query, country, language);
    const html = await this.fetchHtml(url);
    return this.parseSearchResults(html, engine);
  }

  async scrapeLinkedIn(query, country, language) {
    try {
      const encoded = encodeURIComponent(query);
      const gl = country !== 'Any country' ? (COUNTRY_GL[country.toLowerCase()] || 'us') : 'us';
      const url = `https://www.bing.com/search?q=${encoded}+site:linkedin.com/in&cc=${gl}`;
      const html = await this.fetchHtml(url);
      const $ = load(html);
      const results = [];
      $('li.b_algo').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h2').text().trim();
        const link = $el.find('h2 a').attr('href') || '';
        const snippet = $el.find('.b_caption p').text().trim();
        if (link) results.push({ title, snippet, link, source: 'linkedin' });
      });
      if (results.length === 0) {
        results.push({
          title: `LinkedIn results for "${query}"`,
          snippet: 'LinkedIn blocks automated scraping. Public profile emails are not accessible without login. Results shown are from Bing site:linkedin.com queries.',
          link: 'https://www.linkedin.com',
          source: 'linkedin',
          notice: 'LinkedIn scraping is limited without authentication.'
        });
      }
      return results;
    } catch (error) {
      return [{
        title: `LinkedIn results for "${query}"`,
        snippet: 'LinkedIn requires authentication and blocks automated scraping.',
        link: 'https://www.linkedin.com',
        source: 'linkedin',
        notice: 'LinkedIn scraping is not supported without authentication. This is a placeholder.'
      }];
    }
  }

  async scrapeBusinessDirectories(query, country, language) {
    const directories = [
      { name: 'Yellow Pages', urlPattern: 'https://www.yellowpages.com/search?search_terms={q}&geo_location_terms={c}' },
      { name: 'Yelp', urlPattern: 'https://www.yelp.com/search?find_desc={q}&find_loc={c}' },
      { name: 'Manta', urlPattern: 'https://www.manta.com/search?search={q}' },
      { name: 'Chamber of Commerce', urlPattern: 'https://www.chamberofcommerce.com/search?search={q}' }
    ];

    const results = [];
    for (const dir of directories.slice(0, 2)) {
      try {
        const encoded = encodeURIComponent(query);
        const location = country !== 'Any country' ? country : '';
        const url = dir.urlPattern.replace('{q}', encoded).replace('{c}', encodeURIComponent(location));
        const html = await this.fetchHtml(url);
        const $ = load(html);
        const text = $('body').text().replace(/\s+/g, ' ');
        const emails = this.extractEmails(text);
        const title = $('title').text().trim() || dir.name;
        results.push({
          title: `${dir.name} results for "${query}"`,
          snippet: text.slice(0, 300),
          link: url,
          source: 'business-directories',
          directory: dir.name,
          emails
        });
      } catch (error) {
        results.push({
          title: `${dir.name} results for "${query}"`,
          snippet: `Directory scraping failed: ${error.message}`,
          link: '',
          source: 'business-directories',
          directory: dir.name,
          notice: 'Business directory scraping requires site-specific access.'
        });
      }
      await this.sleep(this.delayMs);
    }

    if (results.length === 0) {
      results.push({
        title: `Business directory results for "${query}"`,
        snippet: 'Business directory scraping requires site-specific selectors. Enable specific directories in configuration.',
        link: '',
        source: 'business-directories',
        notice: 'Business directory scraping is a placeholder. Add specific directory scrapers as needed.'
      });
    }
    return results;
  }

  async scrapeWebsite(url) {
    try {
      const html = await this.fetchHtml(url);
      const $ = load(html);
      const text = $('body').text().replace(/\s+/g, ' ');
      const emails = this.extractEmails(text);
      const phones = this.extractPhones(text);
      const links = this.extractUrls(html);
      const title = $('title').text().trim() || '';
      const h1 = $('h1').first().text().trim() || '';
      const businessName = h1 || title.split(' - ')[0] || title.split(' | ')[0] || '';

      return {
        url,
        emails,
        phones,
        businessName,
        sourcePage: url,
        links: links.slice(0, 20)
      };
    } catch (error) {
      return { url, error: error.message, emails: [], phones: [], businessName: '', sourcePage: url, links: [] };
    }
  }

  deduplicateEmails(emails) {
    return [...new Set(emails.map(e => e.toLowerCase()))];
  }
}

export function createContactFromSearch(result, sourceEngine, sourceUrl, country, language) {
  const { title, snippet, link } = result;
  const text = `${title} ${snippet}`;
  const emails = [...new Set([...text.matchAll(EMAIL_REGEX)].map(m => m[0].toLowerCase()))];
  const phones = [...new Set([...text.matchAll(PHONE_REGEX)].map(m => clean(m[0])))].filter(Boolean);
  const email = emails[0] || '';
  const [localPart] = email.split('@');
  const type = ROLE_PREFIXES.has(localPart?.split(/[.+_-]/)[0]?.toLowerCase())
    ? 'Business mailbox (inferred)'
    : 'Personal-style mailbox (inferred)';
  const domain = email.split('@')[1]?.toLowerCase();
  const provider = PROVIDER_MAP[domain] || domain;

  return {
    name: clean(title) || '',
    phone: phones[0] || '',
    email,
    url: clean(link) || '',
    type,
    provider,
    sourceLabel: `${sourceEngine} search`,
    sourceUrl,
    country: country || 'Any country',
    language: language || 'Any language',
    source: sourceEngine,
    verified: false,
    confidence: email ? 'medium' : 'low'
  };
}
