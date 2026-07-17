export type CandidateRawEvidence = {
  source: string;
  url: string | null;
  title: string | null;
  snippet: string | null;
  query: string | null;
  scope: string | null;
  sourcingQueryZh: string | null;
  imageUrl: string | null;
  imageEvidenceUrl: string | null;
};

export type CandidatePresentationInput = {
  canonicalName: string;
  productType: string;
  displayNameZh?: unknown;
  rawSummary: unknown;
};

export type CandidatePrimaryImage = {
  imageUrl: string;
  evidenceUrl: string;
  source: string;
  title: string | null;
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedHostname(hostname: string): string {
  return hostname
    .toLocaleLowerCase("en-US")
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isNonPublicIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    return false;
  }
  const [first, second] = parts.map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isNonPublicHostname(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  ) {
    return true;
  }
  if (isNonPublicIpv4(host)) return true;
  if (!host.includes(":")) return false;
  return (
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]/.test(host) ||
    host.includes("::ffff:")
  );
}

export function safeHttpsUrl(value: unknown): string | null {
  const text = optionalText(value);
  if (!text || text.length > 4096) return null;
  try {
    const parsed = new URL(text);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      isNonPublicHostname(parsed.hostname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const MARKET_IMAGE_HOST_SUFFIXES = [
  "alicdn.com",
  "aliexpress-media.com",
  "ebayimg.com",
  "etsystatic.com",
  "gstatic.com",
  "kwcdn.com",
  "ozone.ru",
  "temu.com",
  "walmartimages.com",
] as const;

const MARKET_EVIDENCE_HOST_SUFFIXES = [
  "1688.com",
  "aliexpress.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "google.com",
  "ozon.ru",
  "temu.com",
  "walmart.com",
  "wildberries.ru",
] as const;

function matchesHostSuffix(url: string, suffixes: readonly string[]): boolean {
  const host = normalizedHostname(new URL(url).hostname);
  return suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function safeMarketUrl(
  value: unknown,
  suffixes: readonly string[],
): string | null {
  const url = safeHttpsUrl(value);
  return url && matchesHostSuffix(url, suffixes) ? url : null;
}

export function supplierOfferImageUrl(value: unknown): string | null {
  return safeMarketUrl(value, ["alicdn.com"]);
}

export function supplierOfferDetailUrl(value: unknown): string | null {
  const url = safeHttpsUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (
    normalizedHostname(parsed.hostname) !== "detail.1688.com" ||
    parsed.search ||
    parsed.hash ||
    !/^\/offer\/[1-9]\d{0,31}\.html$/u.test(parsed.pathname)
  ) {
    return null;
  }
  return parsed.toString();
}

export function candidateRawEvidence(
  rawSummary: unknown,
): CandidateRawEvidence[] {
  const evidence = objectRecord(rawSummary)?.evidence;
  if (!Array.isArray(evidence)) return [];
  return evidence.flatMap((item) => {
    const record = objectRecord(item);
    if (!record) return [];
    const source = optionalText(record.source);
    if (!source) return [];
    return [
      {
        source,
        url: optionalText(record.url),
        title: optionalText(record.title),
        snippet: optionalText(record.snippet),
        query: optionalText(record.query),
        scope: optionalText(record.scope),
        sourcingQueryZh: optionalText(record.sourcingQueryZh),
        imageUrl: optionalText(record.imageUrl),
        imageEvidenceUrl: optionalText(record.imageEvidenceUrl),
      },
    ];
  });
}

export function candidatePrimaryImage(
  rawSummary: unknown,
): CandidatePrimaryImage | null {
  for (const evidence of candidateRawEvidence(rawSummary)) {
    const imageUrl = safeMarketUrl(
      evidence.imageUrl,
      MARKET_IMAGE_HOST_SUFFIXES,
    );
    const evidenceUrl =
      safeMarketUrl(
        evidence.imageEvidenceUrl,
        MARKET_EVIDENCE_HOST_SUFFIXES,
      ) ?? safeMarketUrl(evidence.url, MARKET_EVIDENCE_HOST_SUFFIXES);
    if (!imageUrl || !evidenceUrl) continue;
    return {
      imageUrl,
      evidenceUrl,
      source: evidence.source,
      title: evidence.title,
    };
  }
  return null;
}

const PRODUCT_NAME_RULES: ReadonlyArray<
  readonly [readonly string[], string]
> = [
  [["dustpan", "brush"], "迷你簸箕刷套装"],
  [["waste", "bag", "dispenser"], "宠物拾便袋盒"],
  [["poop", "bag", "holder"], "宠物拾便袋盒"],
  [["poop", "bag"], "宠物拾便袋"],
  [["poop", "scooper"], "宠物拾便器"],
  [["travel", "storage", "bag"], "旅行收纳袋"],
  [["shoe", "storage", "bag"], "鞋子收纳袋"],
  [["laundry", "mesh", "bag"], "洗衣网袋"],
  [["jewelry", "storage", "pouch"], "首饰收纳袋"],
  [["chair", "leg", "protector"], "椅脚保护套"],
  [["furniture", "felt", "pad"], "家具毛毡垫"],
  [["door", "handle", "bumper"], "门把手防撞垫"],
  [["door", "handle", "stopper"], "门把手防撞垫"],
  [["pencil", "case"], "笔袋"],
  [["pencil", "pouch"], "笔袋"],
  [["pencil", "bag"], "笔袋"],
  [["passport", "holder"], "护照夹"],
  [["plant", "label"], "植物标签牌"],
  [["plant", "support", "clip"], "植物固定夹"],
  [["keyboard", "cleaning", "brush"], "键盘清洁刷"],
  [["screen", "cleaning", "brush"], "屏幕清洁刷"],
  [["toothpaste", "squeezer"], "牙膏挤压器"],
  [["soap", "mesh", "pouch"], "香皂网袋"],
  [["aluminum", "hard", "shell", "eyeglasses", "case"], "铝合金硬壳眼镜盒"],
  [["hard", "plastic", "badge", "holder"], "硬质塑料工牌卡套"],
  [["transparent", "badge", "holder"], "透明工牌卡套"],
  [["id", "tag", "work", "card", "sleeve"], "工牌卡套"],
  [["curtain", "tieback", "holder"], "窗帘绑带固定扣"],
  [["earphone", "storage", "case"], "耳机收纳盒"],
  [["glasses", "case"], "眼镜盒"],
  [["eyeglasses", "case"], "眼镜盒"],
  [["eyeglass", "case"], "眼镜盒"],
  [["badge", "holder"], "证件卡套"],
  [["earphone", "pouch"], "耳机收纳袋"],
  [["badge", "card", "holder"], "证件卡套"],
  [["zipper", "pull"], "拉链头"],
  [["crochet", "marker"], "编织记号扣"],
  [
    ["phone", "sock", "anti", "slip", "thigh", "pouch", "card", "holder"],
    "防滑大腿手机卡片收纳袋",
  ],
  [
    ["sewing", "thread", "storage", "box", "portable", "compartment"],
    "便携分格缝纫线收纳盒",
  ],
  [["sewing", "thread", "organizer"], "缝纫线收纳盒"],
  [["bed", "sheet", "clip"], "床单固定夹"],
  [["curtain", "clip"], "窗帘固定夹"],
  [["table", "purse", "hook"], "桌边包包挂钩"],
  [["wardrobe", "divider"], "衣柜分类牌"],
  [["cable", "label"], "线缆标签牌"],
  [["makeup", "brush", "protector"], "化妆刷保护套"],
  [["toothbrush", "head", "cover"], "牙刷头保护套"],
  [["toothbrush", "cover", "case"], "牙刷保护盒"],
  [["toothbrush", "cap"], "牙刷保护套"],
  [["toothbrush", "cover"], "牙刷保护套"],
  [["closet", "divider"], "衣柜分类牌"],
  [["purse", "hook"], "包包挂钩"],
  [["makeup", "bag"], "化妆包"],
  [["hook", "loop", "cable", "tie"], "魔术贴理线带"],
  [["cable", "strap"], "魔术贴扎带"],
  [["cable", "organizer"], "理线夹"],
  [["cable", "clip"], "理线夹"],
  [["drawer", "divider"], "抽屉分隔板"],
  [["drawer", "organizer"], "抽屉收纳盒"],
  [["seat", "gap", "organizer"], "汽车座椅缝隙收纳盒"],
  [["seat", "gap", "filler"], "汽车座椅缝隙塞"],
  [["pen", "holder"], "笔筒"],
  [["pen", "organizer"], "笔收纳盒"],
  [["desk", "organizer"], "桌面收纳盒"],
  [["desk", "holder"], "桌面收纳架"],
  [["luggage", "tag"], "行李牌"],
  [["furniture", "protector"], "家具防撞垫"],
  [["pill", "storage", "pouch"], "药片收纳袋"],
  [["storage", "pouch"], "收纳袋"],
];

function controlledChineseName(value: unknown): string | null {
  const text = optionalText(value);
  if (!text || text.length > 40) return null;
  const compact = text.replace(/[ \u3000]+/g, "");
  if (
    !/\p{Script=Han}/u.test(compact) ||
    !/^[\p{Script=Han}\d（）()·、，。/+-]+$/u.test(compact)
  ) {
    return null;
  }
  return compact;
}

function candidateTokens(candidate: CandidatePresentationInput): Set<string> {
  const source = [candidate.canonicalName, candidate.productType]
    .map(optionalText)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return new Set(
    source.toLocaleLowerCase("en-US").match(/[a-z0-9]+/g) ?? [],
  );
}

const VARIANT_PREFIX_RULES: ReadonlyArray<
  readonly [readonly string[], string]
> = [
  [["transparent"], "透明"],
  [["mesh"], "网纱"],
  [["double", "layer"], "双层"],
  [["stackable"], "可叠放"],
  [["mail"], "文件信件"],
  [["tray"], "托盘式"],
  [["bulk"], "批量装"],
  [["pu"], "人造革"],
];

function applyChineseVariant(
  baseName: string,
  tokens: ReadonlySet<string>,
): string {
  const prefixes = VARIANT_PREFIX_RULES.flatMap(([required, prefix]) =>
    required.every((token) => tokens.has(token)) && !baseName.includes(prefix)
      ? [prefix]
      : [],
  );
  return `${prefixes.join("")}${baseName}`;
}

export function candidateChineseName(
  candidate: CandidatePresentationInput,
): string {
  const explicitName =
    controlledChineseName(candidate.displayNameZh) ??
    controlledChineseName(objectRecord(candidate.rawSummary)?.displayNameZh);
  if (explicitName) return explicitName;

  const tokens = candidateTokens(candidate);
  for (const evidence of candidateRawEvidence(candidate.rawSummary)) {
    const controlled = controlledChineseName(evidence.sourcingQueryZh);
    if (controlled) return applyChineseVariant(controlled, tokens);
  }

  for (const [required, label] of PRODUCT_NAME_RULES) {
    if (required.every((token) => tokens.has(token))) {
      return applyChineseVariant(label, tokens);
    }
  }
  return "中文名称待确认";
}
