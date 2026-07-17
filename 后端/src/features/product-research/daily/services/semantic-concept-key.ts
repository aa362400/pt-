import { createHash } from 'node:crypto';

const STOPWORDS = new Set([
  'and',
  'for',
  'from',
  'gift',
  'new',
  'official',
  'sale',
  'shop',
  'store',
  'the',
  'with',
]);

const NON_IDENTITY_MODIFIERS = new Set([
  'black',
  'blue',
  'compact',
  'green',
  'lightweight',
  'metal',
  'mini',
  'plastic',
  'portable',
  'red',
  'rubber',
  'silicone',
  'small',
  'white',
  'wood',
  'wooden',
]);

const SINGULAR_TOKENS: Record<string, string> = {
  bags: 'bag',
  cases: 'case',
  clips: 'clip',
  covers: 'cover',
  dividers: 'divider',
  eyeglasses: 'eyeglass',
  glasses: 'eyeglass',
  holders: 'holder',
  hooks: 'hook',
  organizers: 'organizer',
  pouches: 'pouch',
  spectacles: 'eyeglass',
  tags: 'tag',
};

function singular(token: string): string {
  const mapped = SINGULAR_TOKENS[token];
  if (mapped) return mapped;
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (
    ['ches', 'shes', 'xes', 'zes'].some((suffix) => token.endsWith(suffix)) &&
    token.length > 4
  ) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function tokens(value: string): string[] {
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
    .filter(
      (token) =>
        !STOPWORDS.has(token) &&
        !NON_IDENTITY_MODIFIERS.has(token) &&
        (token.length >= 2 || /^\d+$/.test(token)),
    )
    .map(singular);
}

export function semanticConceptKey(name: string, productType: string): string {
  const productTypeTokens = new Set(tokens(productType));
  const allTokens = new Set(tokens(`${name} ${productType}`));
  if (
    allTokens.has('makeup') &&
    allTokens.has('brush') &&
    allTokens.has('protector')
  ) {
    return 'makeup brush protector';
  }
  if (
    allTokens.has('toothbrush') &&
    ['cap', 'cover'].some((token) => allTokens.has(token))
  ) {
    return 'toothbrush cover';
  }
  if (
    allTokens.has('eyeglass') &&
    ['case', 'pouch'].some((token) => allTokens.has(token))
  ) {
    return 'eyeglass case';
  }
  if (
    ['earbud', 'earphone'].some((token) => allTokens.has(token)) &&
    ['case', 'pouch'].some((token) => allTokens.has(token))
  ) {
    return 'earphone case';
  }
  const isBadgeCard =
    allTokens.has('badge') || (allTokens.has('id') && allTokens.has('card'));
  if (
    isBadgeCard &&
    ['case', 'holder', 'sleeve'].some((token) => allTokens.has(token))
  ) {
    return 'badge card holder';
  }
  if (productTypeTokens.has('poop') && productTypeTokens.has('scooper')) {
    if (
      ['bag', 'refill', 'replacement'].some((token) =>
        productTypeTokens.has(token),
      )
    ) {
      return 'poop scooper refill bag';
    }
    return 'poop scooper';
  }
  if (
    allTokens.has('chair') &&
    allTokens.has('leg') &&
    ['cap', 'feet', 'foot', 'pad', 'protector'].some((token) =>
      allTokens.has(token),
    )
  ) {
    return 'chair leg protector';
  }
  if (
    allTokens.has('seat') &&
    allTokens.has('gap') &&
    ['filler', 'organizer'].some((token) => allTokens.has(token))
  ) {
    return 'car seat gap accessory';
  }
  if (
    allTokens.has('cable') &&
    ['clip', 'holder', 'organizer'].some((token) => allTokens.has(token))
  ) {
    return 'cable organizer';
  }
  const key = [...allTokens].sort().join(' ');
  if (key) return key;
  const fallbackBasis = `${name.normalize('NFKC').toLowerCase()}|${productType
    .normalize('NFKC')
    .toLowerCase()}`;
  return `concept ${createHash('sha256').update(fallbackBasis).digest('hex')}`;
}
