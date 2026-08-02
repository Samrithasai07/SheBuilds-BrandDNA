"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Check,
  FileImage,
  FileText,
  FileVideo,
  Globe2,
  LoaderCircle,
  Mic,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

type Result = {
  profile: {
    name: string;
    industry: string;
    audience: string;
    tone: string[];
    values: string[];
    vocabulary: string[];
    restricted: string[];
    summary: string;
  };
  competitors: { name: string; url: string; score: number; reason: string }[];
  stats: {
    pages: number;
    characters: number;
    chunks: number;
    vectors: number;
    vectorBackend?: "qdrant" | "fallback";
    mediaAssets?: { pdfs: number; images: number; videos: number };
  };
  sources: string[];
  evidenceChunks?: string[];
};
type Evaluation = {
  total: number;
  weights: {
    brandAlignment: number;
    originality: number;
    authenticity: number;
    policy: number;
  };
  confidence: { score: number; level: string; basis: string };
  scores: {
    brandAlignment: number;
    originality: number;
    authenticity: number;
    policy: number | null;
  };
  evidence: {
    brandMatchType: string;
    brandLexicalCoverage: number;
    brandMatches: { source: string; excerpt: string; similarity: number }[];
    competitorMatches: {
      name: string;
      url: string;
      reason: string;
      similarity: number;
      rawSimilarity?: number;
      evidenceExcerpt?: string;
      matchType?: string;
    }[];
    clicheMatches: string[];
    policy: {
      applicable: boolean;
      forbidden: string[];
      preferred: string[];
      legalTextDetected: boolean;
    };
  };
  insight: {
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
  method: string;
};

const steps = ["Assets", "Brand profile", "Competitors", "Knowledge base"];

type Language = "en" | "hi" | "ta";
const messages = {
  en: {
    startOver: "Start over",
    brandIntelligence: "Brand intelligence",
    contentScoring: "Content scoring",
    validation: "Validation & improvements",
    phase1: "Phase 1 · Brand intelligence",
    phase2: "Phase 2 · Content scoring",
    phase3: "Phase 3 · Validation & improvement",
    buildTitle: "Build your brand’s intelligence layer.",
    buildBody:
      "Turn guidelines, campaigns and a website into a structured brand profile, ranked competitor set and searchable knowledge base.",
    addSources: "Add your brand sources",
    sourceHelp:
      "Add up to 6 brand assets: PDFs and images up to 10 MB, videos up to 50 MB.",
    uploadPdf: "Upload PDFs",
    uploadImage: "Upload images",
    uploadVideo: "Upload videos",
    dropSources: "Drop guidelines or campaigns here",
    browse: "or click to browse files",
    brandWebsite: "Brand website",
    discover: "Discover my competitive set",
    automatic: "Competitors are discovered automatically",
    backPhase1: "← Phase 1 · Brand intelligence",
    scoreContent: "Score campaign content.",
    scoreHelp:
      "Paste or dictate copy, or upload campaign images, videos and PDFs. PDF text is extracted automatically.",
    placeholder: "Paste or dictate meaningful campaign content…",
    addMedia: "Add images, videos or PDFs",
    mediaHelp:
      "For image or video campaigns, add the caption, script or spoken message above for semantic scoring. Maximum 6 files.",
    calculate: "Calculate distinctiveness score",
    processing: "Extracting and running four engines…",
    continuePhase2: "Continue to Phase 2 · Evaluate content",
    continuePhase3: "Continue to Phase 3 · Validate score and improve →",
    backPhase2: "← Phase 2 · Content score",
    whyScore: "Why the score is",
    componentValidation: "Component-by-component validation",
    ideaCompetitor: "Idea-to-competitor similarity",
    distinctIdea: "What makes the idea distinct",
    strengths: "Validated strengths",
    weaknesses: "Validated weaknesses",
    improvementPlan: "Prioritized distinctiveness plan",
    brandAlignment: "Brand alignment",
    originality: "Originality",
    authenticity: "Authenticity",
    policy: "Policy compliance",
    scoreAnother: "Score another draft",
    language: "Language",
    fourSignals: "Four measurable signals.",
    scoringComplete: "Phase 2 · Scoring complete",
    distinctivenessScore: "Brand Distinctiveness Score",
    estimateConfidence: "Estimate confidence",
    scoringSummary:
      "Scoring is complete. Continue to Phase 3 for detailed validation, evidence, confidence and brand-specific improvements.",
    why: "Why",
    improve: "Improve",
    validationMethod: "Validation method",
    knowledgeReady: "Knowledge base ready",
    records: "records",
    qdrantSynced: "Qdrant synced",
    openPhase2: "Open Phase 2 →",
    structuredProfile: "Structured brand profile",
    industry: "Industry",
    audience: "Audience",
    tone: "Tone of voice",
    coreValues: "Core values",
    preferredVocabulary: "Preferred vocabulary",
    restrictedWords: "Restricted words",
    verifiedCompetitors: "Verified competitive set",
    automaticDiscovery: "Automatic live discovery",
    match: "match",
    sourceData: "Source data",
    textExtracted: "Text extracted",
    retrievalChunks: "Retrieval chunks",
    vectorRecords: "Vector records",
    characters: "characters",
    assets: "Assets",
    brandProfile: "Brand profile",
    competitors: "Competitors",
    knowledgeBase: "Knowledge base",
  },
  hi: {
    startOver: "फिर से शुरू करें",
    brandIntelligence: "ब्रांड जानकारी",
    contentScoring: "कंटेंट मूल्यांकन",
    validation: "सत्यापन और सुधार",
    phase1: "चरण 1 · ब्रांड जानकारी",
    phase2: "चरण 2 · कंटेंट मूल्यांकन",
    phase3: "चरण 3 · सत्यापन और सुधार",
    buildTitle: "अपने ब्रांड की इंटेलिजेंस परत बनाएँ।",
    buildBody:
      "दिशानिर्देशों, अभियानों और वेबसाइट को संरचित ब्रांड प्रोफ़ाइल, क्रमबद्ध प्रतिस्पर्धी समूह और खोज योग्य नॉलेज बेस में बदलें।",
    addSources: "अपने ब्रांड के स्रोत जोड़ें",
    sourceHelp:
      "अधिकतम 6 ब्रांड फ़ाइलें जोड़ें: PDF और तस्वीरें 10 MB तक, वीडियो 50 MB तक।",
    uploadPdf: "PDF अपलोड करें",
    uploadImage: "तस्वीरें अपलोड करें",
    uploadVideo: "वीडियो अपलोड करें",
    dropSources: "दिशानिर्देश या अभियान यहाँ छोड़ें",
    browse: "या फ़ाइल चुनने के लिए क्लिक करें",
    brandWebsite: "ब्रांड वेबसाइट",
    discover: "मेरे प्रतिस्पर्धियों को खोजें",
    automatic: "प्रतिस्पर्धियों की खोज अपने-आप होती है",
    backPhase1: "← चरण 1 · ब्रांड जानकारी",
    scoreContent: "अभियान के कंटेंट का मूल्यांकन करें।",
    scoreHelp:
      "कंटेंट लिखें या बोलकर दर्ज करें, अथवा अभियान की तस्वीरें, वीडियो और PDF अपलोड करें। PDF का टेक्स्ट अपने-आप निकाला जाएगा।",
    placeholder: "सार्थक अभियान कंटेंट लिखें या बोलकर दर्ज करें…",
    addMedia: "तस्वीरें, वीडियो या PDF जोड़ें",
    mediaHelp:
      "तस्वीर या वीडियो अभियान के लिए ऊपर कैप्शन, स्क्रिप्ट या बोले गए संदेश का टेक्स्ट जोड़ें। अधिकतम 6 फ़ाइलें।",
    calculate: "विशिष्टता स्कोर निकालें",
    processing: "कंटेंट निकालकर चारों इंजनों से जाँच की जा रही है…",
    continuePhase2: "चरण 2 पर जाएँ · कंटेंट का मूल्यांकन करें",
    continuePhase3: "चरण 3 पर जाएँ · स्कोर सत्यापित करें और सुधारें →",
    backPhase2: "← चरण 2 · कंटेंट स्कोर",
    whyScore: "यह स्कोर क्यों मिला:",
    componentValidation: "हर घटक का विस्तृत सत्यापन",
    ideaCompetitor: "विचार और प्रतिस्पर्धियों की समानता",
    distinctIdea: "इस विचार को अलग क्या बनाता है",
    strengths: "सत्यापित खूबियाँ",
    weaknesses: "सत्यापित कमियाँ",
    improvementPlan: "प्राथमिकता के अनुसार विशिष्टता सुधार योजना",
    brandAlignment: "ब्रांड अनुरूपता",
    originality: "मौलिकता",
    authenticity: "प्रामाणिकता",
    policy: "नीति अनुपालन",
    scoreAnother: "दूसरे ड्राफ़्ट का मूल्यांकन करें",
    language: "भाषा",
    fourSignals: "चार मापने योग्य संकेत।",
    scoringComplete: "चरण 2 · मूल्यांकन पूरा हुआ",
    distinctivenessScore: "ब्रांड विशिष्टता स्कोर",
    estimateConfidence: "अनुमान की विश्वसनीयता",
    scoringSummary:
      "मूल्यांकन पूरा हुआ। विस्तृत सत्यापन, प्रमाण, विश्वसनीयता और ब्रांड-विशिष्ट सुधारों के लिए चरण 3 पर जाएँ।",
    why: "कारण",
    improve: "सुधार",
    validationMethod: "सत्यापन विधि",
    knowledgeReady: "नॉलेज बेस तैयार है",
    records: "रिकॉर्ड",
    qdrantSynced: "Qdrant से जुड़ा",
    openPhase2: "चरण 2 खोलें →",
    structuredProfile: "संरचित ब्रांड प्रोफ़ाइल",
    industry: "उद्योग",
    audience: "लक्षित दर्शक",
    tone: "भाषा का अंदाज़",
    coreValues: "मुख्य मूल्य",
    preferredVocabulary: "पसंदीदा शब्दावली",
    restrictedWords: "प्रतिबंधित शब्द",
    verifiedCompetitors: "सत्यापित प्रतिस्पर्धी समूह",
    automaticDiscovery: "स्वचालित लाइव खोज",
    match: "समानता",
    sourceData: "स्रोत डेटा",
    textExtracted: "निकाला गया टेक्स्ट",
    retrievalChunks: "खोज खंड",
    vectorRecords: "वेक्टर रिकॉर्ड",
    characters: "अक्षर",
    assets: "स्रोत सामग्री",
    brandProfile: "ब्रांड प्रोफ़ाइल",
    competitors: "प्रतिस्पर्धी",
    knowledgeBase: "नॉलेज बेस",
  },
  ta: {
    startOver: "மீண்டும் தொடங்கவும்",
    brandIntelligence: "பிராண்ட் நுண்ணறிவு",
    contentScoring: "உள்ளடக்க மதிப்பீடு",
    validation: "சரிபார்ப்பு மற்றும் மேம்பாடுகள்",
    phase1: "கட்டம் 1 · பிராண்ட் நுண்ணறிவு",
    phase2: "கட்டம் 2 · உள்ளடக்க மதிப்பீடு",
    phase3: "கட்டம் 3 · சரிபார்ப்பு மற்றும் மேம்பாடு",
    buildTitle: "உங்கள் பிராண்டின் நுண்ணறிவு அடுக்கை உருவாக்குங்கள்.",
    buildBody:
      "வழிகாட்டுதல்கள், பிரச்சாரங்கள் மற்றும் இணையதளத்தை கட்டமைக்கப்பட்ட பிராண்ட் சுயவிவரம், தரவரிசைப்படுத்தப்பட்ட போட்டியாளர் தொகுப்பு மற்றும் தேடக்கூடிய அறிவுத் தளமாக மாற்றுங்கள்.",
    addSources: "உங்கள் பிராண்ட் ஆதாரங்களைச் சேர்க்கவும்",
    sourceHelp:
      "அதிகபட்சம் 6 பிராண்ட் கோப்புகளைச் சேர்க்கவும்: PDF மற்றும் படங்கள் 10 MB வரை, வீடியோக்கள் 50 MB வரை.",
    uploadPdf: "PDF பதிவேற்றவும்",
    uploadImage: "படங்களைப் பதிவேற்றவும்",
    uploadVideo: "வீடியோக்களைப் பதிவேற்றவும்",
    dropSources: "வழிகாட்டுதல்கள் அல்லது பிரச்சாரங்களை இங்கே இடவும்",
    browse: "அல்லது கோப்புகளைத் தேர்ந்தெடுக்க கிளிக் செய்யவும்",
    brandWebsite: "பிராண்ட் இணையதளம்",
    discover: "எனது போட்டியாளர்களைக் கண்டறியவும்",
    automatic: "போட்டியாளர்கள் தானாகவே கண்டறியப்படுகிறார்கள்",
    backPhase1: "← கட்டம் 1 · பிராண்ட் நுண்ணறிவு",
    scoreContent: "பிரச்சார உள்ளடக்கத்தை மதிப்பிடுங்கள்.",
    scoreHelp:
      "உள்ளடக்கத்தை எழுதுங்கள் அல்லது குரலில் பதிவு செய்யுங்கள்; பிரச்சாரப் படங்கள், வீடியோக்கள் மற்றும் PDF கோப்புகளையும் பதிவேற்றலாம். PDF உரை தானாகப் பிரித்தெடுக்கப்படும்.",
    placeholder:
      "பொருளுள்ள பிரச்சார உள்ளடக்கத்தை எழுதுங்கள் அல்லது குரலில் பதிவு செய்யுங்கள்…",
    addMedia: "படங்கள், வீடியோக்கள் அல்லது PDF சேர்க்கவும்",
    mediaHelp:
      "படம் அல்லது வீடியோ பிரச்சாரத்திற்கு மேலே தலைப்பு, உரைநகல் அல்லது பேசப்பட்ட செய்தியைச் சேர்க்கவும். அதிகபட்சம் 6 கோப்புகள்.",
    calculate: "தனித்துவ மதிப்பெண்ணைக் கணக்கிடுங்கள்",
    processing:
      "உள்ளடக்கம் பிரித்தெடுக்கப்பட்டு நான்கு இயந்திரங்களிலும் மதிப்பிடப்படுகிறது…",
    continuePhase2: "கட்டம் 2-க்கு செல்லவும் · உள்ளடக்கத்தை மதிப்பிடுங்கள்",
    continuePhase3:
      "கட்டம் 3-க்கு செல்லவும் · மதிப்பெண்ணைச் சரிபார்த்து மேம்படுத்துங்கள் →",
    backPhase2: "← கட்டம் 2 · உள்ளடக்க மதிப்பெண்",
    whyScore: "இந்த மதிப்பெண் கிடைத்ததற்கான காரணம்:",
    componentValidation: "ஒவ்வொரு கூறின் விரிவான சரிபார்ப்பு",
    ideaCompetitor: "யோசனை மற்றும் போட்டியாளர் ஒற்றுமை",
    distinctIdea: "இந்த யோசனையைத் தனித்துவமாக்குவது என்ன",
    strengths: "சரிபார்க்கப்பட்ட பலங்கள்",
    weaknesses: "சரிபார்க்கப்பட்ட குறைகள்",
    improvementPlan: "முன்னுரிமைப்படுத்தப்பட்ட தனித்துவ மேம்பாட்டுத் திட்டம்",
    brandAlignment: "பிராண்ட் இணக்கம்",
    originality: "அசல் தன்மை",
    authenticity: "உண்மைத்தன்மை",
    policy: "கொள்கை இணக்கம்",
    scoreAnother: "மற்றொரு வரைவைக் மதிப்பிடுங்கள்",
    language: "மொழி",
    fourSignals: "அளவிடக்கூடிய நான்கு குறியீடுகள்.",
    scoringComplete: "கட்டம் 2 · மதிப்பீடு நிறைவடைந்தது",
    distinctivenessScore: "பிராண்ட் தனித்துவ மதிப்பெண்",
    estimateConfidence: "மதிப்பீட்டின் நம்பகத்தன்மை",
    scoringSummary:
      "மதிப்பீடு முடிந்தது. விரிவான சரிபார்ப்பு, ஆதாரம், நம்பகத்தன்மை மற்றும் பிராண்ட் சார்ந்த மேம்பாடுகளுக்கு கட்டம் 3-க்கு செல்லவும்.",
    why: "காரணம்",
    improve: "மேம்பாடு",
    validationMethod: "சரிபார்ப்பு முறை",
    knowledgeReady: "அறிவுத் தளம் தயார்",
    records: "பதிவுகள்",
    qdrantSynced: "Qdrant ஒத்திசைக்கப்பட்டது",
    openPhase2: "கட்டம் 2-ஐத் திறக்கவும் →",
    structuredProfile: "கட்டமைக்கப்பட்ட பிராண்ட் சுயவிவரம்",
    industry: "துறை",
    audience: "இலக்கு பயனர்கள்",
    tone: "மொழிநடை",
    coreValues: "முக்கிய மதிப்புகள்",
    preferredVocabulary: "விருப்பமான சொற்கள்",
    restrictedWords: "தவிர்க்க வேண்டிய சொற்கள்",
    verifiedCompetitors: "சரிபார்க்கப்பட்ட போட்டியாளர் தொகுப்பு",
    automaticDiscovery: "தானியங்கி நேரடி கண்டறிதல்",
    match: "ஒற்றுமை",
    sourceData: "மூலத் தரவு",
    textExtracted: "பிரித்தெடுக்கப்பட்ட உரை",
    retrievalChunks: "தேடல் துண்டுகள்",
    vectorRecords: "வெக்டர் பதிவுகள்",
    characters: "எழுத்துகள்",
    assets: "ஆதாரங்கள்",
    brandProfile: "பிராண்ட் சுயவிவரம்",
    competitors: "போட்டியாளர்கள்",
    knowledgeBase: "அறிவுத் தளம்",
  },
} as const;
type MessageKey = keyof typeof messages.en;
const LanguageContext = createContext({
  language: "en" as Language,
  t: (key: MessageKey) => messages.en[key] as string,
});
function useLanguage() {
  return useContext(LanguageContext);
}

export default function Home() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem("branddna-language") as Language | null;
    return saved && saved in messages ? saved : "en";
  });
  const t = (key: MessageKey) => messages[language][key];
  const input = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [phase2, setPhase2] = useState(false);
  const [phase3, setPhase3] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState<Evaluation | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [translating, setTranslating] = useState(false);
  const stage =
    status === "done"
      ? 4
      : status === "running"
        ? 2
        : files.length || url
          ? 1
          : 0;
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const params = new URLSearchParams(location.search);
        const saved = localStorage.getItem("branddna-phase1");
        if (saved) {
          setResult(JSON.parse(saved));
          setStatus("done");
          if (params.has("phase2")) setPhase2(true);
          if (params.has("phase3")) setPhase3(true);
        } else if (params.has("phase2") || params.has("phase3")) {
          setResult({
            profile: {
              name: "Mypakhi Demo",
              industry: "Organic bamboo menstrual care",
              audience:
                "Indian customers seeking comfortable sustainable period care",
              tone: ["Clear", "Human", "Confident"],
              values: ["Comfort", "Sustainability", "Freedom"],
              vocabulary: ["Bamboo", "Comfort", "Care"],
              restricted: [
                "Best-in-class",
                "Revolutionary",
                "Unlock potential",
              ],
              summary:
                "Premium organic bamboo sanitary pads focused on rash-free comfort and sustainable menstrual care.",
            },
            competitors: [
              {
                name: "Whisper",
                url: "https://www.whisperindia.com/",
                score: 84,
                reason: "Sanitary pads focused on comfort and protection.",
              },
              {
                name: "Carmesi",
                url: "https://www.carmesi.in/",
                score: 82,
                reason: "Premium eco-friendly menstrual care products.",
              },
            ],
            evidenceChunks: [
              "Pakhi creates ultra-soft organic bamboo sanitary pads for rash-free comfort, reliable protection and sustainable menstrual care.",
            ],
            stats: { pages: 1, characters: 1200, chunks: 5, vectors: 8 },
            sources: ["Demo brand guidelines"],
          });
          setStatus("done");
          setPhase2(params.has("phase2"));
          setPhase3(params.has("phase3"));
        }
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const check = () =>
      fetch("/api/architecture", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (active)
            setBackendOnline(
              data.status === "ok" &&
                Boolean(data.services?.fastapi?.active) &&
                Boolean(data.services?.qdrant?.active),
            );
        })
        .catch(() => {
          if (active) setBackendOnline(false);
        });
    check();
    const timer = window.setInterval(check, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);
  async function changeLanguage(value: Language) {
    setLanguage(value);
    localStorage.setItem("branddna-language", value);
    if (!result || value === "en") return;
    setTranslating(true);
    try {
      const response = await fetch("/api/localize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: value,
          profile: result.profile,
          competitors: result.competitors,
        }),
      });
      const localized = await response.json();
      if (response.ok) {
        const next = {
          ...result,
          profile: localized.profile,
          competitors: localized.competitors,
        };
        setResult(next);
        localStorage.setItem("branddna-phase1", JSON.stringify(next));
      }
    } finally {
      setTranslating(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, 6));
  }

  async function build() {
    if (!files.length && !url.trim()) return;
    setStatus("running");
    setError("");
    setResult(null);
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.append("url", url.trim());
    form.append("language", language);
    try {
      const response = await fetch("/api/onboard", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not build your BrandDNA.");
      setResult(payload);
      localStorage.setItem("branddna-phase1", JSON.stringify(payload));
      setStatus("done");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Something went wrong.",
      );
      setStatus("error");
    }
  }

  function reset() {
    setFiles([]);
    setUrl("");
    setResult(null);
    setStatus("idle");
    setError("");
    setPhase2(false);
    setPhase3(false);
    setLastEvaluation(null);
    localStorage.removeItem("branddna-phase1");
  }

  return (
    <LanguageContext.Provider value={{ language, t }}>
      <main className="min-h-screen bg-[#f6f7fb] text-[#151931]">
        <header className="border-b border-[#e6e8f0] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-[#202a68] text-white">
                <Sparkles size={19} />
              </div>
              <div>
                <div className="font-serif text-xl font-bold tracking-tight">
                  BrandDNA <span className="text-[#f36c21]">AI</span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[.19em] text-[#7f849a]">
                  Distinctiveness engine
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex rounded-xl border border-[#dfe2ed] bg-[#f7f8fc] p-1"
                aria-label={t("language")}
              >
                {(
                  [
                    ["en", "English"],
                    ["hi", "हिन्दी"],
                    ["ta", "தமிழ்"],
                  ] as const
                ).map(([code, label]) => (
                  <button
                    key={code}
                    disabled={translating}
                    onClick={() => changeLanguage(code)}
                    className={`rounded-lg px-3 py-2 text-sm font-bold transition ${language === code ? "bg-[#202a68] text-white shadow" : "text-[#4f566d] hover:bg-white"}`}
                    aria-pressed={language === code}
                  >
                    {translating && language === code ? "…" : label}
                  </button>
                ))}
              </div>
              <div
                className={`hidden rounded-full border px-3 py-1.5 text-xs font-bold lg:block ${backendOnline === false ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
              >
                <span
                  className={`mr-2 inline-block size-2 rounded-full ${backendOnline === false ? "bg-red-500" : "bg-emerald-500"}`}
                />
                {backendOnline === null
                  ? "Checking AI backend…"
                  : backendOnline
                    ? "AI backend synced"
                    : "AI backend offline · fallback active"}
              </div>
              <div className="hidden rounded-full border border-[#dfe2ed] bg-[#f9f9fc] px-3 py-1.5 text-xs font-semibold text-[#666d86] xl:block">
                {phase3 ? t("phase3") : phase2 ? t("phase2") : t("phase1")}
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-6 py-12">
          {!phase2 && !phase3 && (
            <div className="mb-10 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[.22em] text-[#f36c21]">
                  BrandDNA AI
                </p>
                <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                  {t("buildTitle")}
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-[#656b82]">
                  {t("buildBody")}
                </p>
              </div>
              <button onClick={reset} className="start-over-button self-start">
                ↻ {t("startOver")}
              </button>
            </div>
          )}

          {result && (
            <div className="sticky top-3 z-20 mb-8 flex items-stretch gap-2 rounded-2xl border border-[#dde1eb] bg-white/95 p-2 shadow-lg backdrop-blur">
              <nav
                className="flex min-w-0 flex-1 items-stretch gap-2"
                aria-label="Phase navigation"
              >
                <button
                  onClick={() => {
                    setPhase2(false);
                    setPhase3(false);
                  }}
                  className={`phase-tab ${!phase2 && !phase3 ? "phase-tab-active" : ""}`}
                >
                  <span>1</span>
                  {t("brandIntelligence")}
                </button>
                <button
                  onClick={() => {
                    setPhase2(true);
                    setPhase3(false);
                  }}
                  className={`phase-tab ${phase2 && !phase3 ? "phase-tab-active" : ""}`}
                >
                  <span>2</span>
                  {t("contentScoring")}
                </button>
                <button
                  disabled={!lastEvaluation}
                  onClick={() => {
                    if (lastEvaluation) {
                      setPhase3(true);
                      setPhase2(false);
                    }
                  }}
                  className={`phase-tab ${phase3 ? "phase-tab-active" : ""}`}
                >
                  <span>3</span>
                  {t("validation")}
                </button>
              </nav>
              <button onClick={reset} className="start-over-button shrink-0">
                ↻ <span className="hidden sm:inline">{t("startOver")}</span>
              </button>
            </div>
          )}

          {!phase2 && !phase3 && (
            <div className="mb-8 grid grid-cols-4 overflow-hidden rounded-2xl border border-[#e0e3ed] bg-white">
              {steps.map((label, index) => (
                <div
                  key={label}
                  className={`relative flex items-center gap-3 border-r border-[#eceef4] p-4 last:border-r-0 ${index <= stage ? "text-[#202a68]" : "text-[#a4a8b8]"}`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${index < stage || status === "done" ? "bg-[#202a68] text-white" : index === stage ? "bg-[#fff0e7] text-[#f36c21]" : "bg-[#f0f1f5]"}`}
                  >
                    {index < stage || status === "done" ? (
                      <Check size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="hidden text-sm font-bold sm:block">
                    {
                      [
                        t("assets"),
                        t("brandProfile"),
                        t("competitors"),
                        t("knowledgeBase"),
                      ][index]
                    }
                  </span>
                </div>
              ))}
            </div>
          )}

          <div
            key={phase3 ? "phase3" : phase2 ? "phase2" : "phase1"}
            className="phase-view"
          >
            {!result ? (
              <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
                <div className="rounded-3xl border border-[#e1e4ee] bg-white p-7 shadow-[0_12px_40px_rgba(24,31,75,.06)] sm:p-9">
                  <div className="mb-7">
                    <h2 className="font-serif text-2xl font-bold">
                      {t("addSources")}
                    </h2>
                    <p className="mt-2 text-sm text-[#73798e]">
                      {t("sourceHelp")}
                    </p>
                  </div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      addFiles(e.dataTransfer.files);
                    }}
                    className="rounded-2xl border-2 border-dashed border-[#cfd3e2] bg-[#fafbfe] p-5 transition hover:border-[#f36c21] hover:bg-[#fffaf7]"
                  >
                    <input
                      ref={input}
                      type="file"
                      multiple
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => addFiles(e.target.files)}
                    />
                    <input
                      ref={imageInput}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => addFiles(e.target.files)}
                    />
                    <input
                      ref={videoInput}
                      type="file"
                      multiple
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => addFiles(e.target.files)}
                    />
                    <div className="mb-4 text-center">
                      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-[#fff0e7] text-[#f36c21]">
                        <UploadCloud />
                      </div>
                      <p className="font-bold text-[#202a68]">
                        {t("dropSources")}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => input.current?.click()}
                        className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-[#dfe2eb] bg-white p-4 font-bold text-[#202a68] shadow-sm hover:border-[#f36c21]"
                      >
                        <FileText className="text-[#f36c21]" />
                        {t("uploadPdf")}
                      </button>
                      <button
                        type="button"
                        onClick={() => imageInput.current?.click()}
                        className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-[#dfe2eb] bg-white p-4 font-bold text-[#202a68] shadow-sm hover:border-[#f36c21]"
                      >
                        <FileImage className="text-[#f36c21]" />
                        {t("uploadImage")}
                      </button>
                      <button
                        type="button"
                        onClick={() => videoInput.current?.click()}
                        className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-[#dfe2eb] bg-white p-4 font-bold text-[#202a68] shadow-sm hover:border-[#f36c21]"
                      >
                        <FileVideo className="text-[#f36c21]" />
                        {t("uploadVideo")}
                      </button>
                    </div>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {files.map((file, i) => (
                        <div
                          key={`${file.name}-${i}`}
                          className="flex items-center gap-3 rounded-xl border border-[#e8eaf1] px-4 py-3"
                        >
                          {file.type.startsWith("image/") ? (
                            <FileImage size={18} className="text-[#f36c21]" />
                          ) : file.type.startsWith("video/") ? (
                            <FileVideo size={18} className="text-[#f36c21]" />
                          ) : (
                            <FileText size={18} className="text-[#f36c21]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {file.name}
                            </p>
                            <p className="text-xs text-[#999dae]">
                              {(file.size / 1024).toFixed(0)} KB
                            </p>
                          </div>
                          <button
                            aria-label={`Remove ${file.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFiles(files.filter((_, n) => n !== i));
                            }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="my-6 flex items-center gap-4 text-xs font-bold uppercase tracking-[.16em] text-[#a0a4b2]">
                    <span className="h-px flex-1 bg-[#e6e8ef]" />
                    and
                    <span className="h-px flex-1 bg-[#e6e8ef]" />
                  </div>
                  <label className="text-sm font-bold">
                    {t("brandWebsite")}
                  </label>
                  <div className="mt-2 flex items-center rounded-xl border border-[#dfe2eb] px-4 focus-within:border-[#202a68]">
                    <Globe2 size={18} className="text-[#969bad]" />
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://yourbrand.com"
                      className="h-12 flex-1 bg-transparent px-3 text-sm outline-none"
                    />
                  </div>
                  <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#dfe4f3] bg-[#f7f8fc] p-4">
                    <Search
                      className="mt-0.5 shrink-0 text-[#202a68]"
                      size={18}
                    />
                    <div>
                      <p className="text-sm font-bold text-[#202a68]">
                        {t("automatic")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#73798e]">
                        BrandDNA searches by category, product and audience,
                        verifies official websites, then ranks only
                        evidence-backed matches.
                      </p>
                    </div>
                  </div>
                  {error && (
                    <p className="mt-4 text-sm font-semibold text-red-600">
                      {error}
                    </p>
                  )}
                  <button
                    disabled={
                      (!files.length && !url.trim()) || status === "running"
                    }
                    onClick={build}
                    className="mt-7 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#202a68] px-5 font-bold text-white transition hover:bg-[#162052] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {status === "running" ? (
                      <>
                        <LoaderCircle className="animate-spin" size={19} />
                        Discovering and verifying brands…
                      </>
                    ) : (
                      <>
                        {t("discover")} <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </div>
                <aside className="rounded-3xl bg-[#202a68] p-8 text-white">
                  <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff9d68]">
                    What happens next
                  </p>
                  <h3 className="mt-4 font-serif text-3xl font-bold">
                    From raw assets to usable intelligence.
                  </h3>
                  <div className="mt-8 space-y-6">
                    {[
                      [
                        FileText,
                        "Extract",
                        "Read and clean the source content.",
                      ],
                      [
                        Sparkles,
                        "Understand",
                        "Identify tone, values and vocabulary.",
                      ],
                      [Search, "Discover", "Rank the closest competitors."],
                      [Check, "Index", "Create retrieval-ready chunks."],
                    ].map(([Icon, title, body], i) => {
                      const C = Icon as typeof FileText;
                      return (
                        <div key={String(title)} className="flex gap-4">
                          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
                            <C size={16} />
                          </div>
                          <div>
                            <p className="font-bold">
                              {i + 1}. {String(title)}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[#c4c9e4]">
                              {String(body)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-5 text-[#cbd0e7]">
                    This demo runs locally. Connect Claude, Tavily, Firecrawl
                    and Qdrant through the existing service boundary for
                    production.
                  </div>
                </aside>
              </div>
            ) : phase3 && lastEvaluation ? (
              <InsightPanel
                result={result}
                evaluation={lastEvaluation}
                onBack={() => {
                  setPhase3(false);
                  setPhase2(true);
                }}
              />
            ) : phase2 ? (
              <EvaluationPanel
                result={result}
                onBack={() => setPhase2(false)}
                evaluation={lastEvaluation}
                setEvaluation={setLastEvaluation}
                onValidate={() => {
                  setPhase3(true);
                  setPhase2(false);
                }}
              />
            ) : (
              <Dashboard
                result={result}
                totalSize={totalSize}
                onEvaluate={() => setPhase2(true)}
              />
            )}
          </div>
        </section>
      </main>
    </LanguageContext.Provider>
  );
}

function localizedProfile(
  profile: Result["profile"],
  language: Language,
): Result["profile"] {
  if (language === "en") return profile;
  const nativePattern = language === "hi" ? /[ऀ-ॿ]/ : /[஀-௿]/;
  const words: Record<string, [string, string]> = {
    clear: ["स्पष्ट", "தெளிவான"],
    human: ["स्वाभाविक", "இயல்பான"],
    reassuring: ["भरोसा देने वाला", "நம்பிக்கையூட்டும்"],
    informative: ["जानकारीपूर्ण", "தகவலளிக்கும்"],
    trustworthy: ["विश्वसनीय", "நம்பகமான"],
    regional: ["क्षेत्रीय", "பிராந்திய"],
    services: ["सेवाएँ", "சேவைகள்"],
    service: ["सेवा", "சேவை"],
    advertising: ["विज्ञापन", "விளம்பரம்"],
    audience: ["दर्शक", "பயனர்கள்"],
    market: ["बाज़ार", "சந்தை"],
    digital: ["डिजिटल", "டிஜிட்டல்"],
    media: ["मीडिया", "ஊடகம்"],
    tamil: ["तमिल", "தமிழ்"],
    connection: ["जुड़ाव", "இணைப்பு"],
    credibility: ["विश्वसनीयता", "நம்பகத்தன்மை"],
    community: ["समुदाय", "சமூகம்"],
    language: ["भाषा", "மொழி"],
  };
  const translate = (value: string) =>
    value
      .split(/(\W+)/)
      .map((part) => {
        const pair = words[part.toLowerCase()];
        return pair ? pair[language === "hi" ? 0 : 1] : part;
      })
      .join("");
  const list = (values: string[]) =>
    values.map((value) =>
      nativePattern.test(value) ? value : translate(value),
    );
  const summary = nativePattern.test(profile.summary)
    ? profile.summary
    : language === "hi"
      ? `${profile.name} प्रस्तुत प्रमाणों के आधार पर अपने डिजिटल क्षेत्र में सेवाएँ देने वाला ब्रांड है।`
      : `${profile.name} சமர்ப்பிக்கப்பட்ட ஆதாரங்களின் அடிப்படையில் தனது டிஜிட்டல் துறையில் சேவைகளை வழங்கும் பிராண்ட் ஆகும்.`;
  const audience = nativePattern.test(profile.audience)
    ? profile.audience
    : language === "hi"
      ? `${profile.name} की सेवाएँ चाहने वाले लक्षित ग्राहक और व्यवसाय।`
      : `${profile.name} சேவைகளை நாடும் இலக்கு வாடிக்கையாளர்கள் மற்றும் நிறுவனங்கள்.`;
  return {
    ...profile,
    summary,
    audience,
    industry: translate(profile.industry),
    tone: list(profile.tone),
    values: list(profile.values),
    vocabulary: list(profile.vocabulary),
  };
}

function localizedCompetitorReason(
  item: Result["competitors"][number],
  language: Language,
) {
  if (language === "en") return item.reason;
  return language === "hi"
    ? `${item.name} को समान श्रेणी के सत्यापित बाज़ार शोध में प्रासंगिक प्रतिस्पर्धी के रूप में पहचाना गया। इसकी ब्रांड और ग्राहक श्रेणी से ${item.score}% समानता है।`
    : `${item.name} அதே துறையைச் சேர்ந்த பொருத்தமான போட்டியாளராக சரிபார்க்கப்பட்ட சந்தை ஆய்வில் கண்டறியப்பட்டது. பிராண்ட் மற்றும் வாடிக்கையாளர் பிரிவுடன் ${item.score}% ஒற்றுமை உள்ளது.`;
}

function Dashboard({
  result,
  totalSize,
  onEvaluate,
}: {
  result: Result;
  totalSize: number;
  onEvaluate: () => void;
}) {
  const { t } = useLanguage();
  const { language } = useLanguage();
  const profile = localizedProfile(result.profile, language);
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-[#202a68] p-7 text-white sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-full bg-emerald-400/20 text-emerald-300">
            <Check />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#9ea6d4]">
              {t("knowledgeReady")}
            </p>
            <h2 className="mt-1 font-serif text-3xl font-bold">
              {profile.name}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
            {result.stats.vectors} {t("records")} ·{" "}
            {result.stats.vectorBackend === "qdrant"
              ? t("qdrantSynced")
              : "local fallback"}
          </div>
          <button
            onClick={onEvaluate}
            className="rounded-full bg-[#f36c21] px-5 py-2 text-sm font-bold"
          >
            {t("openPhase2")}
          </button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.08fr_.92fr]">
        <section className="rounded-3xl border border-[#e0e3ed] bg-white p-7">
          <p className="section-label">{t("structuredProfile")}</p>
          <p className="mt-5 text-lg leading-8 text-[#4f566d]">
            {profile.summary}
          </p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <Field label={t("industry")} value={profile.industry} />
            <Field label={t("audience")} value={profile.audience} />
            <Tags label={t("tone")} items={profile.tone} />
            <Tags label={t("coreValues")} items={profile.values} />
            <Tags label={t("preferredVocabulary")} items={profile.vocabulary} />
            <Tags
              label={t("restrictedWords")}
              items={profile.restricted}
              orange
            />
          </div>
        </section>
        <section className="rounded-3xl border border-[#e0e3ed] bg-white p-7">
          <div className="flex items-center justify-between">
            <p className="section-label">{t("verifiedCompetitors")}</p>
            <span className="text-xs font-semibold text-emerald-600">
              {t("automaticDiscovery")}
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {result.competitors.map((item, i) => (
              <div
                key={item.url}
                className="rounded-2xl border border-[#e9ebf2] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-full bg-[#f0f2f8] text-xs font-bold text-[#202a68]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{item.name}</p>
                        <p className="truncate text-[11px] text-[#9a9eae]">
                          {item.url}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#f36c21]">
                        {item.score}% {t("match")}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-[#666d84]">
                      {localizedCompetitorReason(item, language)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          [t("sourceData"), `${Math.max(1, totalSize / 1024).toFixed(0)} KB`],
          [
            t("textExtracted"),
            `${result.stats.characters.toLocaleString()} ${t("characters")}`,
          ],
          [t("retrievalChunks"), result.stats.chunks],
          [t("vectorRecords"), result.stats.vectors],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[#e0e3ed] bg-white p-5"
          >
            <p className="text-xs font-bold uppercase tracking-[.13em] text-[#9ba0b0]">
              {label}
            </p>
            <p className="mt-2 font-serif text-3xl font-bold text-[#202a68]">
              {value}
            </p>
          </div>
        ))}
      </div>
      <button
        onClick={onEvaluate}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#f36c21] px-4 text-lg font-bold text-white hover:bg-[#d95b15]"
      >
        {t("continuePhase2")} <ArrowRight size={18} />
      </button>
    </div>
  );
}

function EvaluationPanel({
  result,
  onBack,
  onValidate,
  evaluation,
  setEvaluation,
}: {
  result: Result;
  onBack: () => void;
  onValidate: () => void;
  evaluation: Evaluation | null;
  setEvaluation: (value: Evaluation | null) => void;
}) {
  const { t, language } = useLanguage();
  const l = (en: string, hi: string, ta: string) =>
    language === "hi" ? hi : language === "ta" ? ta : en;
  const [content, setContent] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  function dictate() {
    type Recognition = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      start: () => void;
      stop: () => void;
      onresult:
        | ((event: {
            results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
          }) => void)
        | null;
      onerror: ((event: { error?: string }) => void) | null;
      onend: (() => void) | null;
    };
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const RecognitionCtor =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setError(
        "Speech-to-text is not supported in this browser. Use Chrome or Edge.",
      );
      return;
    }
    const recognition = new RecognitionCtor();
    const startingText = content.trim();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    setListening(true);
    setLiveTranscript("");
    setError("");
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const text = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += `${text} `;
        else interimText += text;
      }
      const spoken = `${finalText}${interimText}`.trim();
      setLiveTranscript(interimText);
      if (spoken) setContent(`${startingText} ${spoken}`.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied. Allow microphone permission in the browser address bar and try again."
          : "Speech recognition stopped before transcription completed. Please try again.",
      );
    };
    recognition.onend = () => {
      setListening(false);
      setLiveTranscript("");
      recognitionRef.current = null;
    };
    recognition.start();
  }
  function addMedia(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const invalid = incoming.find(
      (file) =>
        !file.type.startsWith("image/") &&
        !file.type.startsWith("video/") &&
        file.type !== "application/pdf",
    );
    if (invalid) {
      setError(`${invalid.name} is not a supported image, video, or PDF.`);
      return;
    }
    setError("");
    setMediaFiles((current) => [...current, ...incoming].slice(0, 6));
  }
  async function evaluate() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("content", content);
      form.append("profile", JSON.stringify(result.profile));
      form.append("competitors", JSON.stringify(result.competitors));
      form.append(
        "evidenceChunks",
        JSON.stringify(result.evidenceChunks || []),
      );
      mediaFiles.forEach((file) => form.append("files", file));
      const response = await fetch("/api/evaluate", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setEvaluation(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evaluation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="phase-back-button">
        {t("backPhase1")}
      </button>
      {!evaluation ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            <section className="rounded-3xl border border-[#e0e3ed] bg-white p-8">
              <p className="section-label">{t("phase2")}</p>
              <h2 className="mt-3 font-serif text-4xl font-bold">
                {t("scoreContent")}
              </h2>
              <p className="mt-3 text-lg leading-8 text-[#6d7388]">
                {t("scoreHelp")}
              </p>
              <div className="relative mt-7">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-60 w-full rounded-2xl border border-[#dfe2eb] p-5 pr-20 text-lg leading-8 outline-none focus:border-[#202a68]"
                  placeholder={t("placeholder")}
                />
                <button
                  onClick={dictate}
                  type="button"
                  className={`absolute bottom-4 right-4 grid size-12 place-items-center rounded-full text-white shadow-lg ${listening ? "animate-pulse bg-red-500" : "bg-[#f36c21]"}`}
                  aria-label={listening ? "Stop dictation" : "Start dictation"}
                  title={listening ? "Stop dictation" : "Speech to text"}
                >
                  {listening ? <X size={21} /> : <Mic size={21} />}
                </button>
              </div>
              <p className="mt-2 text-sm text-[#7d8294]">
                {listening
                  ? `Listening… ${liveTranscript || "speak now"}. Tap the red button to stop.`
                  : "Tap the microphone to dictate. Chrome or Edge will request microphone permission."}
              </p>
              <input
                ref={mediaInput}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,application/pdf"
                className="hidden"
                onChange={(event) => addMedia(event.target.files)}
              />
              <button
                type="button"
                onClick={() => mediaInput.current?.click()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#cfd3e2] bg-[#fafbfe] p-5 font-bold text-[#202a68] transition hover:border-[#f36c21] hover:bg-[#fffaf7]"
              >
                <UploadCloud size={20} />
                {t("addMedia")}
              </button>
              {mediaFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {mediaFiles.map((file, index) => {
                    const Icon = file.type.startsWith("image/")
                      ? FileImage
                      : file.type.startsWith("video/")
                        ? FileVideo
                        : FileText;
                    return (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-3 rounded-xl border border-[#e4e7ef] bg-white px-4 py-3"
                      >
                        <Icon size={19} className="text-[#f36c21]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">
                            {file.name}
                          </p>
                          <p className="text-xs text-[#858a9c]">
                            {file.type.startsWith("image/")
                              ? "Image"
                              : file.type.startsWith("video/")
                                ? "Video"
                                : "PDF"}{" "}
                            · {(file.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={() =>
                            setMediaFiles((files) =>
                              files.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <X size={17} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-3 text-xs leading-5 text-[#7d8294]">
                {t("mediaHelp")}
              </p>
              {error && (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">
                  {error}
                </p>
              )}
              <button
                onClick={evaluate}
                disabled={
                  busy ||
                  (!content.trim() &&
                    !mediaFiles.some((file) => file.type === "application/pdf"))
                }
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#202a68] text-lg font-bold text-white disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <LoaderCircle className="animate-spin" size={18} />
                    {t("processing")}
                  </>
                ) : (
                  <>
                    {t("calculate")} <ArrowRight size={18} />
                  </>
                )}
              </button>
            </section>
            <aside className="rounded-3xl bg-[#202a68] p-8 text-white">
              <h3 className="font-serif text-3xl font-bold">
                {t("fourSignals")}
              </h3>
              <div className="mt-7 space-y-5">
                {[
                  [
                    t("brandAlignment"),
                    l(
                      "Similarity to the brand profile and vocabulary.",
                      "ब्रांड प्रोफ़ाइल और शब्दावली से समानता।",
                      "பிராண்ட் சுயவிவரம் மற்றும் சொற்களுடன் உள்ள ஒற்றுமை.",
                    ),
                  ],
                  [
                    t("originality"),
                    l(
                      "Inverse overlap with competitor evidence.",
                      "प्रतिस्पर्धी प्रमाण से समानता जितनी कम, मौलिकता उतनी अधिक।",
                      "போட்டியாளர் ஆதார ஒற்றுமை குறைந்தால் அசல் தன்மை அதிகம்.",
                    ),
                  ],
                  [
                    t("authenticity"),
                    l(
                      "Explainable matches to generic AI clichés.",
                      "सामान्य AI वाक्यांशों से स्पष्ट मिलान।",
                      "பொதுவான AI சொற்றொடர்களுடன் விளக்கக்கூடிய பொருத்தம்.",
                    ),
                  ],
                  [
                    t("policy"),
                    l(
                      "Forbidden and preferred-word checks.",
                      "प्रतिबंधित और पसंदीदा शब्दों की जाँच।",
                      "தவிர்க்க வேண்டிய மற்றும் விருப்பமான சொற்களின் சரிபார்ப்பு.",
                    ),
                  ],
                ].map(([a, b], i) => (
                  <div key={a} className="flex gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-bold">{a}</p>
                      <p className="mt-1 text-sm text-[#c5cae4]">{b}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </>
      ) : (
        <>
          <EvaluationReport
            value={evaluation}
            onAgain={() => setEvaluation(null)}
          />
          <button
            onClick={onValidate}
            className="mt-6 h-14 w-full rounded-xl bg-[#f36c21] text-lg font-bold text-white"
          >
            {t("continuePhase3")}
          </button>
        </>
      )}
    </div>
  );
}

function EvaluationReport({
  value,
  onAgain,
}: {
  value: Evaluation;
  onAgain: () => void;
}) {
  const { t, language } = useLanguage();
  const cards: [
    [string, number | null],
    [string, number | null],
    [string, number | null],
    [string, number | null],
  ] = [
    [t("brandAlignment"), value.scores.brandAlignment],
    [t("originality"), value.scores.originality],
    [t("authenticity"), value.scores.authenticity],
    [t("policy"), value.scores.policy],
  ];
  const weightText = `${Math.round(value.weights.brandAlignment * 100)}% ${t("brandAlignment")} · ${Math.round(value.weights.originality * 100)}% ${t("originality")} · ${Math.round(value.weights.authenticity * 100)}% ${t("authenticity")} · ${Math.round(value.weights.policy * 100)}% ${t("policy")}`;
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[#202a68] p-8 text-white">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff9d68]">
              {t("scoringComplete")}
            </p>
            <h2 className="mt-3 font-serif text-4xl font-bold">
              {t("distinctivenessScore")}
            </h2>
            <p className="mt-3 text-base text-[#c6cbe3]">{weightText}</p>
            <p className="mt-2 text-sm text-[#aeb5d8]">
              {t("estimateConfidence")}:{" "}
              {language === "hi"
                ? value.confidence.score >= 80
                  ? "उच्च"
                  : value.confidence.score >= 55
                    ? "मध्यम"
                    : "सीमित"
                : language === "ta"
                  ? value.confidence.score >= 80
                    ? "உயர்"
                    : value.confidence.score >= 55
                      ? "மிதமான"
                      : "குறைந்த"
                  : value.confidence.level}{" "}
              ({value.confidence.score}%)
            </p>
          </div>
          <div className="grid size-36 place-items-center rounded-full border-8 border-[#f36c21] bg-white/5">
            <div className="text-center">
              <span className="font-serif text-5xl font-bold">
                {value.total}
              </span>
              <p className="text-sm text-[#c6cbe3]">/ 100</p>
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map(([label, score]) => (
          <div
            key={label}
            className="rounded-2xl border border-[#e0e3ed] bg-white p-6"
          >
            <p className="text-xs font-bold uppercase tracking-[.1em] text-[#8d92a5]">
              {label}
            </p>
            <p className="mt-3 font-serif text-4xl font-bold text-[#202a68]">
              {score === null ? "N/A" : `${score}%`}
            </p>
          </div>
        ))}
      </div>
      <p className="rounded-2xl border border-[#dfe3ee] bg-white p-5 text-center text-base text-[#626980]">
        {t("scoringSummary")}
      </p>
      <button
        onClick={onAgain}
        className="h-12 w-full rounded-xl border border-[#202a68] font-bold text-[#202a68]"
      >
        {t("scoreAnother")}
      </button>
    </div>
  );
}
function Evidence({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-3xl border border-[#e0e3ed] bg-white p-6">
      <p className="section-label">{title}</p>
      <div className="mt-4 space-y-3">
        {items.map((item, i) => (
          <div
            key={`${item}-${i}`}
            className="flex gap-3 rounded-xl bg-[#f7f8fc] p-3 text-sm leading-6"
          >
            <span className="font-bold text-[#f36c21]">{i + 1}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightPanel({
  result,
  evaluation,
  onBack,
}: {
  result: Result;
  evaluation: Evaluation;
  onBack: () => void;
}) {
  const { t, language } = useLanguage();
  const l = (en: string, hi: string, ta: string) =>
    language === "hi" ? hi : language === "ta" ? ta : en;
  const topBrand = evaluation.evidence.brandMatches[0];
  const topRival = evaluation.evidence.competitorMatches[0];
  const validations = [
    {
      name: t("brandAlignment"),
      score: evaluation.scores.brandAlignment,
      why: topBrand
        ? l(
            `The closest brand evidence matched at ${topBrand.similarity}%, with ${evaluation.evidence.brandLexicalCoverage}% wording coverage.`,
            `सबसे निकट ब्रांड प्रमाण की समानता ${topBrand.similarity}% रही और शब्दावली कवरेज ${evaluation.evidence.brandLexicalCoverage}% था।`,
            `மிக நெருக்கமான பிராண்ட் ஆதாரம் ${topBrand.similarity}% ஒற்றுமையையும், ${evaluation.evidence.brandLexicalCoverage}% சொல் பயன்பாட்டையும் கொண்டுள்ளது.`,
          )
        : l(
            "No approved brand evidence produced a meaningful match.",
            "स्वीकृत ब्रांड प्रमाण से कोई सार्थक समानता नहीं मिली।",
            "அங்கீகரிக்கப்பட்ட பிராண்ட் ஆதாரத்துடன் பொருளுள்ள ஒற்றுமை கிடைக்கவில்லை.",
          ),
      action: l(
        `Use concrete ${result.profile.name} language such as ${result.profile.vocabulary.slice(0, 3).join(", ")}.`,
        `${result.profile.name} से जुड़ी ठोस शब्दावली अपनाएँ, जैसे: ${result.profile.vocabulary.slice(0, 3).join(", ")}।`,
        `${result.profile.name}-க்கு உரிய தெளிவான சொற்களைப் பயன்படுத்துங்கள்: ${result.profile.vocabulary.slice(0, 3).join(", ")}.`,
      ),
    },
    {
      name: t("originality"),
      score: evaluation.scores.originality,
      why: topRival
        ? l(
            `${topRival.name} is the closest competitor with ${topRival.similarity}% calibrated overlap.`,
            `${topRival.name} सबसे निकट प्रतिस्पर्धी है, जिसकी समायोजित समानता ${topRival.similarity}% है।`,
            `${topRival.name} மிக நெருக்கமான போட்டியாளர்; அளவுத்திருத்தப்பட்ட ஒற்றுமை ${topRival.similarity}%.`,
          )
        : l(
            "No meaningful competitor overlap was found.",
            "प्रतिस्पर्धियों से कोई सार्थक समानता नहीं मिली।",
            "போட்டியாளர்களுடன் பொருளுள்ள ஒற்றுமை எதுவும் கிடைக்கவில்லை.",
          ),
      action: topRival
        ? l(
            `Avoid claims shared with ${topRival.name}; lead with a proprietary benefit or proof point.`,
            `${topRival.name} जैसे दावों से बचें; अपने विशेष लाभ या प्रमाण को प्रमुखता दें।`,
            `${topRival.name} பகிரும் பொதுவான கூற்றுகளைத் தவிர்த்து, உங்களுக்கே உரிய பயன் அல்லது ஆதாரத்தை முன்னிலைப்படுத்துங்கள்.`,
          )
        : l(
            "Keep the distinctive product-specific claims.",
            "उत्पाद से जुड़े विशिष्ट दावों को बनाए रखें।",
            "தயாரிப்புக்கே உரிய தனித்துவமான கூற்றுகளைத் தொடருங்கள்.",
          ),
    },
    {
      name: t("authenticity"),
      score: evaluation.scores.authenticity,
      why: evaluation.evidence.clicheMatches.length
        ? l(
            `Generic AI-style phrases found: ${evaluation.evidence.clicheMatches.join(", ")}.`,
            `सामान्य AI-जैसे वाक्यांश मिले: ${evaluation.evidence.clicheMatches.join(", ")}।`,
            `பொதுவான AI பாணி சொற்றொடர்கள் கண்டறியப்பட்டன: ${evaluation.evidence.clicheMatches.join(", ")}.`,
          )
        : l(
            "No phrases matched the generic-AI phrase library.",
            "सामान्य AI वाक्यांश सूची से कोई मेल नहीं मिला।",
            "பொதுவான AI சொற்றொடர் பட்டியலுடன் எந்தப் பொருத்தமும் இல்லை.",
          ),
      action: evaluation.evidence.clicheMatches.length
        ? l(
            "Replace generic language with a specific action, feature or measurable outcome.",
            "सामान्य भाषा की जगह स्पष्ट कार्रवाई, विशेषता या मापने योग्य परिणाम लिखें।",
            "பொதுவான மொழிக்குப் பதிலாக குறிப்பிட்ட செயல், அம்சம் அல்லது அளவிடக்கூடிய முடிவைப் பயன்படுத்துங்கள்.",
          )
        : l(
            "Keep the current specific, human phrasing.",
            "मौजूदा स्पष्ट और स्वाभाविक भाषा बनाए रखें।",
            "தற்போதைய தெளிவான, இயல்பான மனித மொழிநடையைத் தொடருங்கள்.",
          ),
    },
    {
      name: t("policy"),
      score: evaluation.scores.policy,
      why: evaluation.evidence.policy.forbidden.length
        ? l(
            `Restricted terms found: ${evaluation.evidence.policy.forbidden.join(", ")}.`,
            `प्रतिबंधित शब्द मिले: ${evaluation.evidence.policy.forbidden.join(", ")}।`,
            `தவிர்க்க வேண்டிய சொற்கள் கண்டறியப்பட்டன: ${evaluation.evidence.policy.forbidden.join(", ")}.`,
          )
        : l(
            "No policy violations were detected; this check passes.",
            "कोई नीति उल्लंघन नहीं मिला; यह जाँच सफल है।",
            "கொள்கை மீறல் எதுவும் கண்டறியப்படவில்லை; இந்தச் சரிபார்ப்பு வெற்றி பெற்றது.",
          ),
      action: evaluation.evidence.policy.forbidden.length
        ? l(
            "Remove the restricted terms and use approved vocabulary.",
            "प्रतिबंधित शब्द हटाकर स्वीकृत शब्दावली का उपयोग करें।",
            "தவிர்க்க வேண்டிய சொற்களை நீக்கி, அங்கீகரிக்கப்பட்ட சொற்களைப் பயன்படுத்துங்கள்.",
          )
        : l(
            "Add explicit policy rules later if stricter checks are required.",
            "कड़ी जाँच के लिए बाद में स्पष्ट नीति नियम जोड़ें।",
            "கடுமையான சரிபார்ப்பு தேவைப்பட்டால் பின்னர் தெளிவான கொள்கை விதிகளைச் சேர்க்கவும்.",
          ),
    },
  ];
  const localizedStrengths = [
    evaluation.scores.brandAlignment >= 65
      ? l(
          "Strong alignment with approved brand evidence.",
          "स्वीकृत ब्रांड प्रमाण से मजबूत अनुरूपता।",
          "அங்கீகரிக்கப்பட்ட பிராண்ட் ஆதாரத்துடன் வலுவான இணக்கம்.",
        )
      : "",
    evaluation.scores.originality >= 70
      ? l(
          "Low overlap with competitor messaging.",
          "प्रतिस्पर्धी संदेशों से कम समानता।",
          "போட்டியாளர் செய்திகளுடன் குறைந்த ஒற்றுமை.",
        )
      : "",
    evaluation.scores.authenticity >= 80
      ? l(
          "The wording is specific and human.",
          "भाषा स्पष्ट और स्वाभाविक है।",
          "மொழிநடை தெளிவாகவும் இயல்பாகவும் உள்ளது.",
        )
      : "",
  ].filter(Boolean);
  const localizedWeaknesses = [
    evaluation.scores.brandAlignment < 65
      ? l(
          "The idea needs stronger brand-specific language.",
          "विचार में ब्रांड-विशिष्ट भाषा को और मजबूत करना होगा।",
          "யோசனையில் பிராண்டுக்கே உரிய மொழியை மேலும் வலுப்படுத்த வேண்டும்.",
        )
      : "",
    evaluation.scores.originality < 70 && topRival
      ? l(
          `Messaging overlaps with ${topRival.name}.`,
          `संदेश ${topRival.name} से मिलता-जुलता है।`,
          `செய்தி ${topRival.name}-உடன் ஒத்துள்ளது.`,
        )
      : "",
    evaluation.evidence.clicheMatches.length
      ? l(
          "Generic AI-style language reduces authenticity.",
          "सामान्य AI-जैसी भाषा प्रामाणिकता घटाती है।",
          "பொதுவான AI பாணி மொழி உண்மைத்தன்மையைக் குறைக்கிறது.",
        )
      : "",
  ].filter(Boolean);
  const distinctMoves = [
    validations[0].action,
    validations[1].action,
    validations[2].action,
    l(
      `Use approved vocabulary only when it states a concrete benefit: ${result.profile.vocabulary.slice(0, 4).join(", ")}.`,
      `स्वीकृत शब्दावली का उपयोग केवल ठोस लाभ बताते समय करें: ${result.profile.vocabulary.slice(0, 4).join(", ")}।`,
      `தெளிவான பயனைச் சொல்லும் இடங்களில் மட்டும் அங்கீகரிக்கப்பட்ட சொற்களைப் பயன்படுத்துங்கள்: ${result.profile.vocabulary.slice(0, 4).join(", ")}.`,
    ),
  ];
  const competitorItems = evaluation.evidence.competitorMatches.length
    ? evaluation.evidence.competitorMatches.map((x) =>
        language === "en"
          ? `${x.name} · ${x.similarity}% calibrated overlap · ${x.matchType || "semantic comparison"} · ${x.evidenceExcerpt || x.reason}`
          : l(
              "",
              `${x.name} · ${x.similarity}% समायोजित समानता · ${x.similarity >= 55 ? "सार्थक समानता" : x.similarity >= 20 ? "सीमित समानता" : "कोई सार्थक समानता नहीं"}`,
              `${x.name} · ${x.similarity}% அளவுத்திருத்தப்பட்ட ஒற்றுமை · ${x.similarity >= 55 ? "பொருளுள்ள ஒற்றுமை" : x.similarity >= 20 ? "குறைந்த ஒற்றுமை" : "பொருளுள்ள ஒற்றுமை இல்லை"}`,
            ),
      )
    : [
        l(
          "No meaningful competitor messaging overlap was retrieved.",
          "प्रतिस्पर्धी संदेशों से कोई सार्थक समानता नहीं मिली।",
          "போட்டியாளர் செய்திகளுடன் பொருளுள்ள ஒற்றுமை எதுவும் கிடைக்கவில்லை.",
        ),
      ];
  return (
    <div className="space-y-7">
      <button onClick={onBack} className="phase-back-button">
        {t("backPhase2")}
      </button>
      <section className="rounded-3xl bg-[#202a68] p-8 text-white">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff9d68]">
              {t("phase3")}
            </p>
            <h2 className="mt-3 font-serif text-4xl font-bold">
              {t("whyScore")} {evaluation.total}/100.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#c9cee5]">
              {l(
                "Every conclusion is tied to brand evidence, competitor similarity, generic phrases or policy rules.",
                "हर निष्कर्ष ब्रांड प्रमाण, प्रतिस्पर्धी समानता, सामान्य वाक्यांशों या नीति नियमों पर आधारित है।",
                "ஒவ்வொரு முடிவும் பிராண்ட் ஆதாரம், போட்டியாளர் ஒற்றுமை, பொதுவான சொற்றொடர்கள் அல்லது கொள்கை விதிகளை அடிப்படையாகக் கொண்டது.",
              )}
            </p>
            <p className="mt-3 text-base font-bold text-[#ffbd98]">
              {l(
                `${evaluation.confidence.level} confidence`,
                `${evaluation.confidence.score >= 80 ? "उच्च" : evaluation.confidence.score >= 55 ? "मध्यम" : "सीमित"} विश्वसनीयता`,
                `${evaluation.confidence.score >= 80 ? "உயர்" : evaluation.confidence.score >= 55 ? "மிதமான" : "குறைந்த"} நம்பகத்தன்மை`,
              )}{" "}
              · {evaluation.confidence.score}%
            </p>
          </div>
          <div className="grid size-32 shrink-0 place-items-center rounded-full border-8 border-[#f36c21]">
            <span className="font-serif text-5xl font-bold">
              {evaluation.total}
            </span>
          </div>
        </div>
      </section>
      <section>
        <p className="section-label">{t("componentValidation")}</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {validations.map((item) => (
            <article
              key={item.name}
              className="rounded-3xl border border-[#e0e3ed] bg-white p-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-2xl font-bold text-[#202a68]">
                  {item.name}
                </h3>
                <span className="rounded-full bg-[#eef0f7] px-4 py-2 font-bold text-[#202a68]">
                  {item.score === null ? "N/A" : `${item.score}%`}
                </span>
              </div>
              <p className="mt-5 text-base leading-7 text-[#555d74]">
                <b>{t("why")}:</b> {item.why}
              </p>
              <p className="mt-3 rounded-xl bg-[#fff5ef] p-4 text-base leading-7 text-[#8b421c]">
                <b>{t("improve")}:</b> {item.action}
              </p>
            </article>
          ))}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Evidence title={t("ideaCompetitor")} items={competitorItems} />
        <Evidence
          title={t("distinctIdea")}
          items={
            evaluation.scores.originality >= 75
              ? [
                  l(
                    `Originality is ${evaluation.scores.originality}% because competitor overlap is low.`,
                    `मौलिकता ${evaluation.scores.originality}% है क्योंकि प्रतिस्पर्धी समानता कम है।`,
                    `போட்டியாளர் ஒற்றுமை குறைவாக இருப்பதால் அசல் தன்மை ${evaluation.scores.originality}%.`,
                  ),
                  ...localizedStrengths,
                ]
              : distinctMoves
          }
        />
        <Evidence
          title={t("strengths")}
          items={
            localizedStrengths.length
              ? localizedStrengths
              : [
                  l(
                    "No strong evidence-backed strengths were detected.",
                    "प्रमाण-आधारित कोई मजबूत खूबी नहीं मिली।",
                    "ஆதாரத்தால் உறுதிப்படுத்தப்பட்ட வலுவான பலம் எதுவும் கண்டறியப்படவில்லை.",
                  ),
                ]
          }
        />
        <Evidence
          title={t("weaknesses")}
          items={
            localizedWeaknesses.length
              ? localizedWeaknesses
              : [
                  l(
                    "No critical evidence-backed weaknesses were detected.",
                    "प्रमाण-आधारित कोई गंभीर कमी नहीं मिली।",
                    "ஆதாரத்தால் உறுதிப்படுத்தப்பட்ட முக்கிய குறை எதுவும் கண்டறியப்படவில்லை.",
                  ),
                ]
          }
        />
      </div>
      <section className="rounded-3xl border border-[#f0d2c1] bg-[#fffaf7] p-7">
        <p className="section-label">{t("improvementPlan")}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[...new Set(distinctMoves)].filter(Boolean).map((item, i) => (
            <div
              key={item}
              className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f36c21] font-bold text-white">
                {i + 1}
              </span>
              <p className="text-base leading-7 text-[#3f465c]">{item}</p>
            </div>
          ))}
        </div>
      </section>
      <p className="rounded-xl border border-[#e0e3ed] bg-white p-4 text-sm text-[#71778b]">
        {t("validationMethod")}:{" "}
        {l(
          "Calibrated semantic similarity with deterministic policy checks.",
          "समायोजित अर्थ-समानता और निश्चित नीति जाँच।",
          "அளவுத்திருத்தப்பட்ட பொருள் ஒற்றுமை மற்றும் நிர்ணயிக்கப்பட்ட கொள்கைச் சரிபார்ப்புகள்.",
        )}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="mt-2 font-semibold text-[#31374f]">{value}</p>
    </div>
  );
}
function Tags({
  label,
  items,
  orange = false,
}: {
  label: string;
  items: string[];
  orange?: boolean;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${orange ? "bg-[#fff0e7] text-[#cc5312]" : "bg-[#eef0f7] text-[#303a74]"}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
