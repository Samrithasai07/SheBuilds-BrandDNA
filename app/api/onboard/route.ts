import { isIP } from "node:net";
import { PDFParse } from "pdf-parse";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_WEB_BYTES = 1_500_000;
const urlField = z
  .string()
  .trim()
  .max(300)
  .transform((value) =>
    value && !/^https?:\/\//i.test(value) ? `https://${value}` : value,
  )
  .pipe(z.string().url());
type SearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
  kind?: "answer";
};
type BrandProfile = {
  name: string;
  industry: string;
  audience: string;
  tone: string[];
  values: string[];
  vocabulary: string[];
  summary: string;
};
type Language = "en" | "hi" | "ta";
const languageName: Record<Language, string> = {
  en: "English",
  hi: "natural native Hindi in Devanagari",
  ta: "natural native Tamil script",
};

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function visibleText(html: string) {
  return decodeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}
function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(
    html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
        `i`,
      ),
    )?.[1] ||
      html.match(
        new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
          `i`,
        ),
      )?.[1] ||
      "",
  ).trim();
}
async function fetchRetry(
  input: string | URL,
  init?: RequestInit,
  attempts = 2,
) {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      last = error;
      if (attempt + 1 < attempts)
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
    }
  }
  throw last;
}

function assertPublicUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only HTTP or HTTPS websites are supported.");
  if (host === "localhost" || host.endsWith(".local") || isIP(host))
    throw new Error("Local or private network addresses are not supported.");
  return url;
}

async function readWebsite(value: string) {
  const url = assertPublicUrl(value);
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "BrandDNA-AI/1.0 website-profile" },
  });
  if (!response.ok)
    throw new Error(`${url.hostname} returned HTTP ${response.status}.`);
  if (!(response.headers.get("content-type") || "").includes("text/html"))
    throw new Error(`${url.hostname} did not return a web page.`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_WEB_BYTES)
    throw new Error(`${url.hostname} page is too large to analyze.`);
  const html = (await response.text()).slice(0, MAX_WEB_BYTES);
  const text = visibleText(html);
  if (text.length < 80)
    throw new Error(`${url.hostname} did not expose enough readable content.`);
  const host = url.hostname.replace(/^www\./, "");
  const title = decodeHtml(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
  ).trim();
  const rawName =
    meta(html, "og:site_name") ||
    title.split(/[|–—-]/)[0].trim() ||
    host.split(".")[0];
  return {
    url: url.toString(),
    host,
    name: titleCase(rawName),
    text,
    description: meta(html, "description") || meta(html, "og:description"),
  };
}

async function readWebsiteFlexible(value: string) {
  let directText = "";
  try {
    const direct = await readWebsite(value);
    directText = direct.text;
    throw new Error(
      "Use independent website research for consistent category analysis.",
    );
  } catch (directError) {
    const url = assertPublicUrl(value);
    const host = url.hostname.replace(/^www\./, "");
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw directError;
    const response = await fetchRetry("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `What product or service does ${host} offer and who is its target customer?`,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
      }),
    });
    if (!response.ok) throw directError;
    const payload = (await response.json()) as {
      answer?: string;
      results?: SearchResult[];
    };
    const resultText = (payload.results || [])
      .map((item) => `${item.title}. ${item.content}`)
      .join(" ");
    const text = (
      payload.answer && payload.answer.length >= 80
        ? payload.answer
        : resultText
    )
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 80) throw directError;
    const name = titleCase(baseDomain(host).split(".")[0]);
    return {
      url: url.toString(),
      host,
      name,
      text: `${text} ${directText.slice(0, 700)} ${resultText.slice(0, 900)}`,
      description: payload.answer || text.slice(0, 240),
    };
  }
}

async function searchWeb(
  query: string,
  excludedDomain: string,
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "rss");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "BrandDNA-AI/1.0 competitor-research" },
    });
    if (!response.ok)
      throw new Error(
        `Public competitor search returned HTTP ${response.status}.`,
      );
    const xml = await response.text();
    return [
      ...xml.matchAll(
        /<item><title>([\s\S]*?)<\/title><link>([\s\S]*?)<\/link><description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/gi,
      ),
    ]
      .map((match, index) => ({
        title: decodeHtml(match[1]),
        url: decodeHtml(match[2]),
        content: visibleText(match[3]),
        score: Math.max(0.3, 0.85 - index * 0.04),
      }))
      .filter((item) => {
        try {
          return (
            new URL(item.url).hostname.replace(/^www\./, "") !== excludedDomain
          );
        } catch {
          return false;
        }
      });
  }
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: 20,
      include_answer: "advanced",
      include_raw_content: false,
      exclude_domains: [
        excludedDomain,
        "amazon.in",
        "flipkart.com",
        "instagram.com",
        "facebook.com",
        "linkedin.com",
        "youtube.com",
        "wikipedia.org",
      ],
    }),
  });
  if (!response.ok)
    throw new Error(
      `Competitor search failed with HTTP ${response.status}. Check the Tavily API key and quota.`,
    );
  const payload = (await response.json()) as {
    answer?: string;
    results?: SearchResult[];
  };
  const results = (payload.results || []).filter((item) => item.score >= 0.25);
  return payload.answer
    ? [
        {
          title: "Competitor research summary",
          url: `https://${excludedDomain}/`,
          content: payload.answer,
          score: 1,
          kind: "answer" as const,
        },
        ...results,
      ]
    : results;
}

function rootUrl(value: string) {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}/`;
}
function baseDomain(host: string) {
  const parts = host.replace(/^www\./, "").split(".");
  return parts.slice(-2).join(".");
}
type ResearchedCompetitor = {
  name: string;
  official_url: string;
  reason: string;
};
function parseResearchAnswer(answer: string): ResearchedCompetitor[] {
  const cleaned = answer
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      competitors?: unknown;
    };
    if (!Array.isArray(parsed.competitors)) return [];
    return parsed.competitors.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (
        typeof item.name !== "string" ||
        typeof item.official_url !== "string" ||
        typeof item.reason !== "string"
      )
        return [];
      try {
        const url = assertPublicUrl(item.official_url);
        return [
          {
            name: item.name.trim(),
            official_url: rootUrl(url.toString()),
            reason: item.reason.trim(),
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

async function researchCompetitors(query: string, excludedDomain: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey)
    throw new Error("Automatic competitor discovery requires TAVILY_API_KEY.");
  const response = await fetchRetry("https://api.tavily.com/search", {
    method: "POST",
    signal: AbortSignal.timeout(25_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: 12,
      include_answer: "advanced",
      include_raw_content: false,
      exclude_domains: [excludedDomain],
    }),
  });
  if (!response.ok)
    throw new Error(
      `Competitor research returned HTTP ${response.status}. Check the Tavily key and quota.`,
    );
  const payload = (await response.json()) as { answer?: string };
  return parseResearchAnswer(payload.answer || "");
}
async function researchProfile(
  site: Awaited<ReturnType<typeof readWebsiteFlexible>>,
  language: Language,
): Promise<BrandProfile | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  const evidence = `${site.description} ${site.text}`
    .replace(/\s+/g, " ")
    .slice(0, 180);
  const query = `Analyze ${site.host}. Evidence: ${evidence}. Return every descriptive value in ${languageName[language]}; keep only the proper brand name unchanged. JSON only {"name":"","industry":"","audience":"","tone":[],"values":[],"vocabulary":[],"summary":""}. Evidence-based, specific, fluent and native; no transliteration and no slogans.`;
  try {
    const response = await fetchRetry("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: 8,
        include_answer: "advanced",
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { answer?: string };
    const clean = (payload.answer || "")
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "");
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    const value = JSON.parse(
      clean.slice(start, end + 1),
    ) as Partial<BrandProfile>;
    if (!value.name || !value.industry || !value.audience || !value.summary)
      return null;
    return {
      name: String(value.name),
      industry: String(value.industry),
      audience: String(value.audience),
      tone: Array.isArray(value.tone) ? value.tone.map(String).slice(0, 4) : [],
      values: Array.isArray(value.values)
        ? value.values.map(String).slice(0, 5)
        : [],
      vocabulary: Array.isArray(value.vocabulary)
        ? value.vocabulary.map(String).slice(0, 8)
        : [],
      summary: String(value.summary),
    };
  } catch {
    return null;
  }
}
async function discoverCompetitors(
  brandSite: Awaited<ReturnType<typeof readWebsite>>,
  brandText: string,
  language: Language,
) {
  const identity = `${brandSite.description} ${brandSite.text.slice(0, 60)}`
    .replace(/\s+/g, " ")
    .slice(0, 70);
  const brandToken = brandSite.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const categoryClues = topWords(brandText, 12)
    .filter(
      (word) =>
        !["offers", "provides", "customers", brandToken].includes(
          word.toLowerCase().replace(/[^a-z0-9]/g, ""),
        ),
    )
    .slice(0, 6)
    .join(", ");
  const market = /\b(india|indian|rupee|₹)\b/i.test(brandText)
    ? "India"
    : "the brand's primary geographic market";
  const ownDomain = baseDomain(brandSite.host);
  const rules = `Write every reason in ${languageName[language]} using fluent native wording; keep brand names unchanged. JSON only {"competitors":[{"name":"","official_url":"","reason":""}]}. Direct brands; canonical homepages only.`;
  const queries = [
    `Established well-known direct brands in ${market}. Category: ${categoryClues}. ${rules}`,
    `Recognizable ${market} brands customers compare with this product: ${identity}. Category: ${categoryClues}. ${rules}`,
    `Leading mainstream and D2C substitute brands in ${market}. Category: ${categoryClues}. ${rules}`,
  ];
  const settled = await Promise.allSettled(
    queries.map((query) => researchCompetitors(query, ownDomain)),
  );
  const batches = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (!batches.length)
    throw new Error(
      "Competitor research is temporarily unavailable. Please retry in a moment.",
    );
  const grouped = new Map<
    string,
    { items: ResearchedCompetitor[]; passes: Set<number> }
  >();
  batches.forEach((batch, pass) =>
    batch.forEach((item) => {
      const domain = baseDomain(new URL(item.official_url).hostname);
      if (domain === ownDomain) return;
      const current = grouped.get(domain) || {
        items: [],
        passes: new Set<number>(),
      };
      current.items.push(item);
      current.passes.add(pass);
      grouped.set(domain, current);
    }),
  );
  return [...grouped.entries()]
    .filter(([, value]) => value.passes.size >= 1)
    .map(([domain, value]) => {
      const votes = new Map<string, number>();
      value.items.forEach((item) =>
        votes.set(item.name, (votes.get(item.name) || 0) + 1),
      );
      const name = [...votes].sort((a, b) => b[1] - a[1])[0][0];
      const item =
        value.items.find((candidate) => candidate.name === name) ||
        value.items[0];
      const agreement = value.passes.size;
      const lexical = compare(
        brandText,
        value.items.map((candidate) => candidate.reason).join(" "),
      );
      const evidence =
        language === "ta"
          ? agreement >= 2
            ? `${agreement} தனித்தனி ஆய்வுச் சுற்றுகளால் உறுதிப்படுத்தப்பட்டது.`
            : "அதே துறையை மையமாகக் கொண்ட சந்தை ஆய்வில் கண்டறியப்பட்டது."
          : language === "hi"
            ? agreement >= 2
              ? `${agreement} स्वतंत्र शोध जाँचों से पुष्टि हुई।`
              : "समान श्रेणी पर केंद्रित बाज़ार शोध में पहचाना गया।"
            : agreement >= 2
              ? `Confirmed by ${agreement} independent research passes.`
              : "Identified in focused same-category market research.";
      return {
        name,
        url: item.official_url,
        score: agreement === 3 ? 94 : agreement === 2 ? 84 : 72,
        reason: `${evidence} ${item.reason}`,
        domain,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .filter(
      (item, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            item.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        ) === index,
    )
    .slice(0, 12)
    .map(({ domain: _, ...item }) => item);
}

const stop = new Set([
  "about",
  "after",
  "again",
  "also",
  "brand",
  "content",
  "from",
  "have",
  "into",
  "more",
  "that",
  "their",
  "them",
  "they",
  "this",
  "with",
  "your",
  "will",
  "what",
  "when",
  "where",
  "which",
  "than",
  "using",
  "home",
  "shop",
  "products",
  "product",
  "privacy",
  "terms",
  "login",
  "account",
  "search",
]);
function wordCounts(text: string) {
  const map = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])
    if (!stop.has(word)) map.set(word, (map.get(word) || 0) + 1);
  return map;
}
function topWords(text: string, count = 5) {
  return [...wordCounts(text)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => titleCase(word));
}
function compare(brandText: string, competitorText: string) {
  const brand = wordCounts(brandText),
    competitor = wordCounts(competitorText);
  const shared = [...brand.keys()]
    .filter((word) => competitor.has(word))
    .map((word) => ({
      word,
      weight: Math.min(brand.get(word) || 0, competitor.get(word) || 0),
    }))
    .sort((a, b) => b.weight - a.weight);
  const brandTop = new Set(
    [...brand]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([word]) => word),
  );
  const competitorTop = new Set(
    [...competitor]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([word]) => word),
  );
  const intersection = [...brandTop].filter((word) =>
    competitorTop.has(word),
  ).length;
  const union = new Set([...brandTop, ...competitorTop]).size;
  const score = Math.round(
    Math.min(95, Math.max(18, (intersection / Math.max(1, union)) * 190 + 20)),
  );
  const evidence = shared.slice(0, 3).map((item) => item.word);
  return {
    score,
    reason: evidence.length
      ? `Shared themes: ${evidence.join(", ")}. Calculated from visible website copy.`
      : "Low messaging overlap in the visible website copy.",
  };
}
function inferCategory(text: string) {
  const words = topWords(text, 3);
  return words.length
    ? `${words.join(" / ")} market`
    : "Category inferred from website";
}
async function indexInVectorKb(
  brandId: string,
  source: string,
  kind: "brand" | "competitor",
  texts: string[],
) {
  try {
    const response = await fetch("http://127.0.0.1:8000/index", {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: brandId, source, kind, texts }),
    });
    if (!response.ok) return 0;
    const payload = (await response.json()) as { indexed?: number };
    return payload.indexed || 0;
  } catch {
    return 0;
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const languageValue = String(form.get("language") || "en");
    const language: Language =
      languageValue === "hi" || languageValue === "ta" ? languageValue : "en";
    const websiteInput = urlField.safeParse(form.get("url")?.toString() || "");
    if (!websiteInput.success)
      return Response.json(
        { error: "Enter a valid public brand website." },
        { status: 400 },
      );

    const files = form
      .getAll("files")
      .filter(
        (value): value is File => value instanceof File && value.size > 0,
      );
    if (files.length > 6 || files.some((file) => file.size > MAX_FILE_SIZE))
      return Response.json(
        { error: "Use up to 6 files, each smaller than 10 MB." },
        { status: 413 },
      );
    let fileText = "";
    let pages = 0;
    for (const file of files) {
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const parser = new PDFParse({
          data: new Uint8Array(await file.arrayBuffer()),
        });
        try {
          const result = await parser.getText();
          fileText += `\n${result.text}`;
          pages += result.total || 0;
        } finally {
          await parser.destroy();
        }
      } else if (
        /\.(txt|md)$/i.test(file.name) ||
        file.type.startsWith("text/")
      )
        fileText += `\n${await file.text()}`;
      else
        return Response.json(
          { error: `${file.name} is not a supported PDF or text file.` },
          { status: 415 },
        );
    }

    const brandSite = await readWebsiteFlexible(websiteInput.data);
    const researchedProfile = await researchProfile(brandSite, language);
    const resolvedSite = researchedProfile
      ? { ...brandSite, name: researchedProfile.name }
      : brandSite;
    const discoveryText = `${brandSite.description} ${brandSite.text}`;
    const brandText = `${discoveryText} ${fileText}`;
    const keywords = topWords(brandText, 6);
    const industry = inferCategory(discoveryText);
    const tone = /(bold|fearless|powerful|strong)/i.test(brandText)
      ? ["Bold", "Direct", "Confident"]
      : ["Clear", "Human", "Reassuring"];
    const ranked = (
      await discoverCompetitors(resolvedSite, discoveryText, language)
    ).filter((item) => {
      const candidate = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const self = resolvedSite.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        candidate !== self &&
        candidate !== `my${self}` &&
        `my${candidate}` !== self
      );
    });
    if (!ranked.length)
      throw new Error(
        "No candidates passed official-site verification and the relevance threshold. Try adding richer brand guidelines.",
      );
    const allCharacters = brandText.length;
    const chunks = Math.max(1, Math.ceil(allCharacters / 900));
    const evidenceChunks = (
      brandText.match(/[\s\S]{1,700}(?:\s|$)/g) || [brandText]
    )
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .slice(0, 8);
    const localizedFallback =
      language === "ta"
        ? {
            industry: "இணையதள ஆதாரங்களிலிருந்து கண்டறியப்பட்ட டிஜிட்டல் துறை",
            audience: `${brandSite.name} சேவைகளை நாடும் இலக்கு வாடிக்கையாளர்கள் மற்றும் நிறுவனங்கள்`,
            tone: ["தெளிவான", "இயல்பான", "நம்பிக்கையூட்டும்"],
            values: ["நம்பகத்தன்மை", "பயனர் தொடர்பு", "பிராந்திய பொருத்தம்"],
            vocabulary: [brandSite.name, "சேவைகள்", "பயனர்கள்", "தகவல்"],
            summary: `${brandSite.name} சமர்ப்பிக்கப்பட்ட ஆதாரங்களின் அடிப்படையில் தனது டிஜிட்டல் துறையில் சேவைகளை வழங்கும் பிராண்ட் ஆகும்.`,
          }
        : language === "hi"
          ? {
              industry: "वेबसाइट प्रमाणों से पहचाना गया डिजिटल क्षेत्र",
              audience: `${brandSite.name} की सेवाएँ चाहने वाले लक्षित ग्राहक और व्यवसाय`,
              tone: ["स्पष्ट", "स्वाभाविक", "भरोसा देने वाला"],
              values: ["विश्वसनीयता", "ग्राहक जुड़ाव", "क्षेत्रीय प्रासंगिकता"],
              vocabulary: [brandSite.name, "सेवाएँ", "ग्राहक", "जानकारी"],
              summary: `${brandSite.name} प्रस्तुत प्रमाणों के आधार पर अपने डिजिटल क्षेत्र में सेवाएँ देने वाला ब्रांड है।`,
            }
          : {
              industry,
              audience: `Customers seeking ${keywords.slice(0, 3).join(", ").toLowerCase()}`,
              tone,
              values: keywords.slice(0, 3),
              vocabulary: keywords.slice(0, 5),
              summary: `${brandSite.name} operates in ${industry.toLowerCase()}, based on the submitted evidence.`,
            };
    const finalProfile = researchedProfile || {
      name: brandSite.name,
      ...localizedFallback,
    };
    const brandId = finalProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const indexed = [
      await indexInVectorKb(brandId, brandSite.url, "brand", evidenceChunks),
      await indexInVectorKb(
        brandId,
        "verified-competitor-set",
        "competitor",
        ranked.map((item) => `${item.name}: ${item.reason}`),
      ),
    ];
    const vectorCount = indexed.reduce((sum, value) => sum + value, 0);
    return Response.json({
      profile: { ...finalProfile, restricted: [] },
      competitors: ranked,
      evidenceChunks,
      stats: {
        pages,
        characters: allCharacters,
        chunks,
        vectors: vectorCount || chunks,
        vectorBackend: vectorCount ? "qdrant" : "fallback",
      },
      sources: [
        ...files.map((file) => file.name),
        brandSite.url,
        ...ranked.map((item) => item.url),
      ],
    });
  } catch (reason) {
    console.error("Brand onboarding failed", reason);
    const message =
      reason instanceof Error
        ? reason.message
        : "A submitted website could not be analyzed.";
    return Response.json(
      { error: `Website analysis failed: ${message}` },
      { status: 400 },
    );
  }
}
