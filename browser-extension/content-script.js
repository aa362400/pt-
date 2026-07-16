(() => {
  const VERSION = 'ozon-parser/v1';
  const MAX_ITEMS = 100;

  function cleanText(value, limit = 500) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, limit)
      : '';
  }

  function absoluteUrl(value) {
    if (!value) return undefined;
    try {
      const url = new URL(value, location.origin);
      if (url.protocol !== 'https:') return undefined;
      url.hash = '';
      return url.toString();
    } catch {
      return undefined;
    }
  }

  function productId(url) {
    const match = String(url || '').match(/\/product\/(?:[^/]+-)?(\d+)(?:\/|$|\?)/i);
    return match?.[1];
  }

  function price(value) {
    const match = cleanText(value, 120).match(/([\d\s]{1,15})(?:[,.](\d{1,2}))?\s*(?:₽|руб)/i);
    if (!match) return undefined;
    const number = Number(`${match[1].replace(/\s/g, '')}.${match[2] || '0'}`);
    return Number.isFinite(number) ? number : undefined;
  }

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function pageType() {
    const path = location.pathname.toLowerCase();
    if (path.includes('/product/')) return 'PRODUCT';
    if (path.includes('/category/')) return 'CATEGORY';
    return 'SEARCH';
  }

  function jsonLdProducts() {
    const products = [];
    const visit = (value) => {
      if (!value) return;
      if (Array.isArray(value)) return value.forEach(visit);
      if (typeof value !== 'object') return;
      const type = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
      if (type.includes('Product')) products.push(value);
      if (value['@graph']) visit(value['@graph']);
      if (value.itemListElement) visit(value.itemListElement);
      if (value.item) visit(value.item);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        visit(JSON.parse(script.textContent || 'null'));
      } catch {
        // Invalid page-owned JSON-LD is ignored and reported through confidence.
      }
    });
    return products.map((item, index) => {
      const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      const url = absoluteUrl(item.url || offer?.url || location.href);
      const image = Array.isArray(item.image) ? item.image[0] : item.image;
      const ratingValue = Number(item.aggregateRating?.ratingValue);
      const reviewCount = Number(item.aggregateRating?.reviewCount || item.aggregateRating?.ratingCount);
      return {
        externalId: cleanText(item.sku || item.productID || productId(url), 160) || undefined,
        offerId: cleanText(offer?.sku, 160) || undefined,
        title: cleanText(item.name),
        url,
        imageUrl: absoluteUrl(typeof image === 'object' ? image.url : image),
        brand: cleanText(typeof item.brand === 'object' ? item.brand.name : item.brand, 160) || undefined,
        currentPrice: Number.isFinite(Number(offer?.price)) ? Number(offer.price) : undefined,
        currency: cleanText(offer?.priceCurrency, 8) || undefined,
        rating: Number.isFinite(ratingValue) ? ratingValue : undefined,
        reviewCount: Number.isInteger(reviewCount) && reviewCount >= 0 ? reviewCount : undefined,
        position: index + 1
      };
    }).filter((item) => item.title && item.url);
  }

  function cardProducts() {
    const seen = new Set();
    const items = [];
    const anchors = [...document.querySelectorAll('a[href*="/product/"]')];
    for (const anchor of anchors) {
      if (items.length >= MAX_ITEMS || !visible(anchor)) continue;
      const url = absoluteUrl(anchor.getAttribute('href'));
      if (!url || seen.has(url)) continue;
      const card = anchor.closest('article, li, [role="listitem"], div') || anchor;
      if (!visible(card)) continue;
      const text = cleanText(card.textContent || '', 2_000);
      const image = card.querySelector('img');
      const title = cleanText(
        anchor.getAttribute('title') ||
          image?.getAttribute('alt') ||
          anchor.textContent ||
          text.split(/\s{2,}|\n/)[0]
      );
      if (!title) continue;
      const ratingMatch = text.match(/([0-5](?:[,.]\d)?)\s*(?:из\s*5|★)/i);
      const reviewMatch = text.match(/(\d[\d\s]*)\s*(?:отзыв|оцен)/i);
      seen.add(url);
      items.push({
        externalId: productId(url),
        title,
        url,
        imageUrl: absoluteUrl(image?.currentSrc || image?.src),
        currentPrice: price(text),
        currency: price(text) !== undefined ? 'RUB' : undefined,
        rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : undefined,
        reviewCount: reviewMatch ? Number(reviewMatch[1].replace(/\s/g, '')) : undefined,
        position: items.length + 1,
        sponsored: /реклама|sponsored/i.test(text),
        promotionText: cleanText((text.match(/(?:скидка|акция)[^.!]{0,120}/i) || [])[0], 160) || undefined
      });
    }
    return items;
  }

  function confidence(items, strategy) {
    if (!items.length) return 0;
    const completeness = items.reduce((sum, item) => {
      let value = 0.45;
      if (item.currentPrice !== undefined) value += 0.15;
      if (item.imageUrl) value += 0.08;
      if (item.rating !== undefined) value += 0.08;
      if (item.externalId) value += 0.08;
      if (item.reviewCount !== undefined) value += 0.06;
      if (item.currency) value += 0.05;
      if (item.position) value += 0.05;
      return sum + Math.min(1, value);
    }, 0) / items.length;
    return Math.round(Math.min(completeness, strategy === 'json-ld' ? 0.98 : 0.82) * 1000) / 1000;
  }

  function capture() {
    const structured = jsonLdProducts();
    const fallback = cardProducts();
    const byUrl = new Map();
    [...structured, ...fallback].forEach((item) => {
      if (!item.url) return;
      const current = byUrl.get(item.url) || {};
      byUrl.set(item.url, { ...current, ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== '')) });
    });
    const items = [...byUrl.values()].slice(0, MAX_ITEMS);
    const strategy = structured.length ? 'json-ld+semantic-links' : 'semantic-links';
    const url = new URL(location.href);
    const query = url.searchParams.get('text') || url.searchParams.get('from_global') || undefined;
    return {
      source: 'OZON_PUBLIC_PAGE',
      pageType: pageType(),
      pageUrl: location.href,
      query: cleanText(query, 500) || undefined,
      capturedAt: new Date().toISOString(),
      locale: document.documentElement.lang || navigator.language,
      pageTitle: cleanText(document.title),
      parserVersion: VERSION,
      extensionVersion: chrome.runtime.getManifest().version,
      confidence: confidence(items, strategy),
      pageEvidence: {
        strategy,
        warnings: items.length ? [] : ['当前视口未识别到可见商品，请滚动到商品列表后重试。']
      },
      items
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SHOPMATE_CAPTURE_VISIBLE_OZON') return;
    try {
      sendResponse({ ok: true, payload: capture() });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
})();
