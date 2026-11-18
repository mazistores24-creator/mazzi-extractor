const EMAIL = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
const URL = /https?:\/\/(?:www\.)?[^\s<>()\[\]{}"']+/i;
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/;
const clean = value => value?.replace(/[;,.)\]}]+$/g, '').trim() || '';
const ROLE_PREFIXES = new Set(['info','hello','contact','support','sales','service','office','admin','team','careers','press','billing','orders','marketing','enquiries','inquiries']);

export function extractContacts(text, options = {}) {
  const maxResults = Math.min(25000, Math.max(1, Number(options.maxResults) || 500));
  const terms = String(options.keywords || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const unique = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const matches = [...line.matchAll(EMAIL)];
    if (!matches.length) continue;
    if (terms.length && !terms.some(term => line.toLowerCase().includes(term))) continue;
    const url = clean(line.match(URL)?.[0] || options.sourceUrl || '');
    const phone = clean(line.match(PHONE)?.[0] || '');
    const beforeFirstEmail = line.slice(0, matches[0].index).replace(/[|,;\s-]+$/g, '').trim();
    const name = beforeFirstEmail.length <= 90 ? beforeFirstEmail : '';
    for (const match of matches) {
      const email = match[0].toLowerCase();
      const [localPart, domain] = email.split('@');
      const type = ROLE_PREFIXES.has(localPart.split(/[.+_-]/)[0]) ? 'Business mailbox (inferred)' : 'Personal-style mailbox (inferred)';
      const provider = ['gmail.com','googlemail.com'].includes(domain) ? 'Gmail' : ['outlook.com','hotmail.com','live.com'].includes(domain) ? 'Outlook' : ['yahoo.com','yahoo.co.uk'].includes(domain) ? 'Yahoo' : ['icloud.com','me.com'].includes(domain) ? 'iCloud' : domain;
      if (options.emailType && options.emailType !== 'Any type' && (options.emailType === 'Business' ? !type.startsWith('Business') : type.startsWith('Business'))) continue;
      if (options.provider && options.provider !== 'Any provider' && (options.provider === 'Other' ? ['Gmail','Outlook','Yahoo','iCloud'].includes(provider) : provider !== options.provider)) continue;
      if (!unique.has(email)) unique.set(email, { name, phone, email, url, type, provider, sourceLabel: options.sourceLabel || 'Pasted text', country: options.country || 'Any country', language: options.language || 'Any language' });
      if (unique.size >= maxResults) return [...unique.values()];
    }
  }
  return [...unique.values()];
}
