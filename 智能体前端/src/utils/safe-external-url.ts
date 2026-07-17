const RESERVED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.test',
  '.invalid',
];

// Click-only market evidence may use marketplace pages. These hosts must never
// be reused as an automatic image allowlist because marketplace pages can
// contain redirects and other active routing behavior.
const TRUSTED_EVIDENCE_HOST_SUFFIXES = [
  '1688.com',
  'alibaba.com',
  'aliexpress.com',
  'amazon.com',
  'amazon.co.uk',
  'amazon.de',
  'amazon.co.jp',
  'ebay.com',
  'etsy.com',
  'google.com',
  'ozon.ru',
  'temu.com',
  'tiktok.com',
  'walmart.com',
  'wildberries.ru',
  'youtube.com',
  'youtu.be',
  'reddit.com',
] as const;

// Automatic browser requests are restricted to dedicated marketplace image
// CDNs. Deliberately exclude generic multi-tenant infrastructure domains.
const TRUSTED_IMAGE_HOST_SUFFIXES = [
  'alicdn.com',
  'aliexpress-media.com',
  'ebayimg.com',
  'etsystatic.com',
  'gstatic.com',
  'kwcdn.com',
  'media-amazon.com',
  'ssl-images-amazon.com',
  'ozone.ru',
  'ozonusercontent.com',
  'redd.it',
  'tiktokcdn.com',
  'walmartimages.com',
  'wbbasket.ru',
  'ytimg.com',
] as const;

const CONTROLLED_AGENT_IMAGE_PATH =
  /^\/agent\/api\/image\/[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function matchesTrustedHost(
  hostname: string,
  suffixes: readonly string[],
): boolean {
  return suffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    !octets.every(
      (part) => Number.isInteger(part) && part >= 0 && part <= 255,
    )
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function safeHttpsUrlForHosts(
  value: unknown,
  trustedHostSuffixes: readonly string[],
): string | null {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 4096 ||
    hasControlCharacter(value)
  ) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== '443')
    ) {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (
      !hostname ||
      hostname === 'localhost' ||
      !hostname.includes('.') ||
      hostname.includes(':') ||
      RESERVED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
      isPrivateIpv4(hostname) ||
      !matchesTrustedHost(hostname, trustedHostSuffixes)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function controlledAgentImagePath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4096 ||
    hasControlCharacter(value) ||
    value.includes('\\') ||
    value.includes('//') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('%') ||
    value.split('/').some((segment) => segment === '.' || segment === '..') ||
    !CONTROLLED_AGENT_IMAGE_PATH.test(value)
  ) {
    return null;
  }
  return value;
}

function browserOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.origin || null;
}

/** HTTPS URL that is only exposed behind an explicit customer click. */
export function safeExternalEvidenceUrl(value: unknown): string | null {
  return safeHttpsUrlForHosts(value, [
    ...TRUSTED_EVIDENCE_HOST_SUFFIXES,
    ...TRUSTED_IMAGE_HOST_SUFFIXES,
  ]);
}

export function firstSafeExternalEvidenceUrl(
  ...values: unknown[]
): string | null {
  for (const value of values) {
    const safeUrl = safeExternalEvidenceUrl(value);
    if (safeUrl) return safeUrl;
  }
  return null;
}

/**
 * URL that may be requested automatically by an <img>. It permits only a
 * dedicated image CDN or the exact same-origin Agent image route.
 */
export function safeReviewImageUrl(
  value: unknown,
  currentOrigin: string | null = browserOrigin(),
): string | null {
  const controlledPath = controlledAgentImagePath(value);
  if (controlledPath) return controlledPath;

  const externalImage = safeHttpsUrlForHosts(
    value,
    TRUSTED_IMAGE_HOST_SUFFIXES,
  );
  if (externalImage) return externalImage;

  if (typeof value !== 'string' || !currentOrigin) return null;
  try {
    const parsed = new URL(value);
    const origin = new URL(currentOrigin);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      parsed.origin !== origin.origin ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !controlledAgentImagePath(parsed.pathname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function firstSafeReviewImageUrl(...values: unknown[]): string | null {
  for (const value of values) {
    const safeUrl = safeReviewImageUrl(value);
    if (safeUrl) return safeUrl;
  }
  return null;
}
