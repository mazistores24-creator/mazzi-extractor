import { resolveMx, resolveTxt, resolvePtr } from 'dns/promises';

const COMMON_PROVIDERS = new Set([
  'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com',
  'yahoo.com','yahoo.co.uk','icloud.com','me.com','protonmail.com',
  'aol.com','zoho.com','gmx.com','mail.com','yandex.com'
]);

const DISPOSABLE_DOMAIN_HINTS = new Set([
  'mailinator.com','10minutemail.com','guerrillamail.com','temp-mail.org',
  'throwaway.email','dispostable.com','fakeinbox.com'
]);

export class EmailVerification {
  constructor({ timeoutMs = 5000, concurrency = 3 } = {}) {
    this.timeoutMs = timeoutMs;
    this.concurrency = concurrency;
    this.mxCache = new Map();
  }

  async resolveMxWithTimeout(domain) {
    const cached = this.mxCache.get(domain);
    if (cached !== undefined) return cached;

    try {
      const mxRecords = await resolveMx(domain);
      const hasMx = mxRecords && mxRecords.length > 0;
      this.mxCache.set(domain, hasMx);
      return hasMx;
    } catch (error) {
      // No MX records found — domain may still accept mail via A record
      this.mxCache.set(domain, false);
      return false;
    }
  }

  async verifySyntax(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(email);
  }

  async verifyDomain(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    return this.resolveMxWithTimeout(domain);
  }

  classifyProvider(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return 'Unknown';
    if (COMMON_PROVIDERS.has(domain)) {
      const providerMap = {
        'gmail.com': 'Gmail', 'googlemail.com': 'Gmail',
        'outlook.com': 'Outlook', 'hotmail.com': 'Outlook', 'live.com': 'Outlook',
        'yahoo.com': 'Yahoo', 'yahoo.co.uk': 'Yahoo',
        'icloud.com': 'iCloud', 'me.com': 'iCloud',
        'protonmail.com': 'ProtonMail', 'zoho.com': 'Zoho'
      };
      return providerMap[domain] || domain;
    }
    return domain; // Custom domain
  }

  isDisposable(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    return DISPOSABLE_DOMAIN_HINTS.has(domain || '');
  }

  classifyType(email) {
    const [localPart] = email.split('@');
    const first = localPart?.split(/[.+_-]/)[0]?.toLowerCase();
    const rolePrefixes = new Set([
      'info','hello','contact','support','sales','service','office','admin',
      'team','careers','press','billing','orders','marketing','enquiries','inquiries'
    ]);
    if (rolePrefixes.has(first)) return 'Business mailbox (inferred)';
    return 'Personal-style mailbox (inferred)';
  }

  async verifySingle(email) {
    const syntaxValid = await this.verifySyntax(email);
    if (!syntaxValid) {
      return { email, valid: false, reason: 'Invalid syntax', verified: false, confidence: 'none' };
    }

    const isDisposableDomain = this.isDisposable(email);
    const domainHasMx = await this.verifyDomain(email);
    const provider = this.classifyProvider(email);
    const type = this.classifyType(email);

    let verified = false;
    let confidence = 'low';
    let reason = '';

    if (isDisposableDomain) {
      verified = false;
      confidence = 'none';
      reason = 'Disposable domain detected';
    } else if (!domainHasMx) {
      verified = false;
      confidence = 'low';
      reason = 'No MX records found for domain';
    } else if (COMMON_PROVIDERS.has(email.split('@')[1]?.toLowerCase())) {
      // Well-known provider with MX — high confidence it's a real inbox type
      verified = true;
      confidence = 'high';
      reason = 'Valid syntax + known provider with MX records';
    } else {
      // Custom domain with MX — medium confidence
      verified = true;
      confidence = 'medium';
      reason = 'Valid syntax + domain has MX records';
    }

    return {
      email,
      valid: verified,
      reason,
      verified,
      confidence,
      provider,
      type,
      domain: email.split('@')[1]?.toLowerCase() || '',
      disposable: isDisposableDomain
    };
  }

  async verifyBatch(emails, onProgress = null) {
    const results = [];
    const semaphore = (() => {
      let running = 0;
      const queue = [];
      return {
        acquire: () => new Promise(resolve => {
          if (running < this.concurrency) {
            running++;
            resolve();
          } else {
            queue.push(resolve);
          }
        }),
        release: () => {
          running--;
          if (queue.length > 0) {
            const next = queue.shift();
            running++;
            next();
          }
        }
      };
    })();

    for (const email of emails) {
      await semaphore.acquire();
      (async () => {
        try {
          const result = await this.verifySingle(email);
          results.push(result);
          if (onProgress) onProgress(results.length, emails.length);
        } catch (error) {
          results.push({ email, valid: false, reason: error.message, verified: false, confidence: 'none' });
          if (onProgress) onProgress(results.length, emails.length);
        } finally {
          semaphore.release();
        }
      })();
    }

    // Wait for all to complete
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (results.length === emails.length) {
          clearInterval(check);
          resolve(results);
        }
      }, 100);
    });
  }
}

export const emailVerification = new EmailVerification();