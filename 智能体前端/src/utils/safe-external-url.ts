const RESERVED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.test',
  '.invalid',
];

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

/**
 * Browser-side defence for automatically loaded third-party evidence assets.
 * The backend must apply the same policy before persisting evidence URLs.
 */
export function safeExternalHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
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
      isPrivateIpv4(hostname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
