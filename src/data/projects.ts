// Every statement here is sourced. Sources: Colby's current resume (PDF, 2026-11-04), his earlier
// resume (DOCX, 2023), the public GitHub repos (code, commit dates, releases), and Aspicio's own
// docs (docs/accuracy.md, git history as of 2026-10-14). Career-stage labels come from his education
// history: UNF Aug 2020 - May 2021, FSU Aug 2021 - May 2024.

export type PreviewMode = "live" | "original" | "simulated" | "contribution" | "career";

export interface TechGroup {
  label: string;
  items: string[];
}

export interface Metric {
  value: string;
  label: string;
}

export interface Entry {
  slug: string;
  kind: "project" | "career";
  year: number;
  /** Header line, left part: the date. */
  date: string;
  /** Header line, right part: where Colby was in school or career. */
  stage: string;
  title: string;
  /** Shorter title for the timeline rail (defaults to title). */
  railTitle?: string;
  /** Short line used in the timeline rail. */
  tagline: string;
  summary: string;
  built: string[];
  tech: TechGroup[];
  preview: {
    mode: PreviewMode;
    /** iframe URL (omitted for career entries). */
    url?: string;
    /** If set, the client appends today's date and time in this IANA zone (date=YYYY-MM-DD&time=HH:MM). */
    stampNow?: string;
    /** Optional quick routes inside the preview (the first one is `url`). */
    routes?: { label: string; url: string; address: string }[];
    /** What the fake address bar shows. */
    address: string;
    /** One honest sentence about what is running. */
    note: string;
  };
  metrics?: Metric[];
  links: { label: string; href: string }[];
}

export const MODE_LABEL: Record<PreviewMode, string> = {
  live: "Live site",
  original: "Original code, running",
  simulated: "Real interface, simulated system",
  contribution: "My contribution",
  career: "Professional work",
};

export const entries: Entry[] = [
  {
    slug: "summoner",
    kind: "project",
    year: 2021,
    date: "July 2021",
    stage: "Summer after 1st year of college",
    title: "Summoner Spell Generator",
    tagline: "League of Legends spell randomizer",
    summary:
      "A randomizer for League of Legends summoner spells: choose a map mode, switch off the spells you don't want, and roll a pair for your next game.",
    built: [
      "Express server that renders an EJS page with a random opening pair, never the same spell twice.",
      "Client-side rules: Mark only exists in ARAM, and spells you switch off never come up.",
      "Bootstrap 5 layout around the original spell artwork.",
    ],
    tech: [
      { label: "Frontend", items: ["JavaScript", "EJS", "Bootstrap 5"] },
      { label: "Backend", items: ["Node.js", "Express"] },
    ],
    preview: {
      mode: "original",
      url: "/previews/summoner/",
      address: "summoner-spell-generator · 2021 build",
      note: "The original 2021 page, styles and script, served as static files. The server's random first roll now runs in the browser using the same functions, and the spell icons gained keyboard support.",
    },
    links: [{ label: "Source code", href: "https://github.com/Colbyco/summoner-spell-generator" }],
  },
  {
    slug: "weather",
    kind: "project",
    year: 2021,
    date: "August 2021",
    stage: "Summer after 1st year of college",
    title: "Weather Database",
    tagline: "City weather lookups saved to Postgres",
    summary:
      "Look up a city's current weather and save it as an observation. A server-rendered table keeps every earlier search.",
    built: [
      "Express routes that call a weather API and store each result in PostgreSQL.",
      "Knex migrations for the schema, run automatically on every Heroku deploy.",
      "EJS and Bootstrap results table of all saved observations.",
    ],
    tech: [
      { label: "Backend", items: ["Node.js", "Express", "Axios"] },
      { label: "Data", items: ["PostgreSQL", "Knex migrations"] },
      { label: "Frontend", items: ["EJS", "Bootstrap 5"] },
    ],
    preview: {
      mode: "original",
      url: "/api/weather/",
      address: "weather-database-website · 2021 server code",
      note: "The original 2021 Express and EJS app runs live on a serverless function, on in-memory PostgreSQL (PGlite) built by its original migrations. Lookups use keyless Open-Meteo in place of the keyed OpenWeatherMap call, and the data resets every hour.",
    },
    links: [{ label: "Source code", href: "https://github.com/Colbyco/weather-database-website" }],
  },
  {
    slug: "openai-chatbot",
    kind: "project",
    year: 2022,
    date: "June 2022",
    stage: "Summer after 2nd year of college",
    title: "OpenAI Chatbot",
    tagline: "A chat UI on GPT-3.5, before ChatGPT",
    summary:
      "A chat interface on OpenAI's text-davinci-002 completion model, built five months before ChatGPT launched.",
    built: [
      "Prompt engineering that makes a completion model behave like a chat partner.",
      "Vue 3 and Vuetify 3 single-page app built with Vite, with temperature and length controls in a settings drawer.",
      "Bring-your-own-key design: the key stays in memory and is validated against the API before chatting.",
      "Deployed on Cloudflare Pages, where the 2022 build is still online.",
    ],
    tech: [
      { label: "Frontend", items: ["Vue 3", "Vuetify 3", "Vite"] },
      { label: "AI", items: ["OpenAI API", "text-davinci-002"] },
      { label: "Hosting", items: ["Cloudflare Pages"] },
    ],
    preview: {
      mode: "original",
      url: "/previews/openai-chatbot/",
      address: "openai-chat-bot · 2022 build",
      note: "Rebuilt from the 2022 lockfile; unmodified, it is byte-identical to the live 2022 deployment. OpenAI shut text-davinci-002 down in January 2024, so the app's original prompt and settings now go to gpt-3.5-turbo-0613, its closest surviving GPT-3.5 relative. Chat live, no key needed.",
    },
    links: [
      { label: "Source code", href: "https://github.com/Colbyco/OpenAI-Chat-Bot" },
      { label: "2022 deployment", href: "https://openai-chat-bot.pages.dev/" },
    ],
  },
  {
    slug: "library",
    kind: "project",
    year: 2022,
    date: "July 2022",
    stage: "Summer after 2nd year of college",
    title: "Library Relational Database API",
    railTitle: "Library Database API",
    tagline: "REST API over a relational catalog",
    summary:
      "A REST API for a library catalog: authors, books and inventory in a relational PostgreSQL schema.",
    built: [
      "CRUD endpoints in Express, backed by Knex queries.",
      "Knex migrations that build the schema and populate it with starter data.",
      "Relational design linking authors, books and inventory.",
    ],
    tech: [
      { label: "Backend", items: ["Node.js", "Express"] },
      { label: "Data", items: ["PostgreSQL", "Knex", "SQL"] },
    ],
    preview: {
      mode: "original",
      url: "/previews/library/",
      address: "library-relational-database-api · 2022 routes",
      note: "The original 2022 Express and Knex routes run live on sandboxed in-memory PostgreSQL (PGlite) built by their original migrations, plus one disclosed schema fix so the write routes work. It resets every 30 minutes; the console was added for this portfolio.",
    },
    links: [{ label: "Source code", href: "https://github.com/Colbyco/library-relational-database-api" }],
  },
  {
    slug: "cvs-intern",
    kind: "career",
    year: 2023,
    date: "May – August 2023",
    stage: "Summer after 3rd year of college",
    title: "Digital Engineering Intern, CVS Health",
    railTitle: "Intern · CVS Health",
    tagline: "First enterprise engineering role",
    summary:
      "My first engineering role, on CVS Health's API development team, working within enterprise API standards and processes.",
    built: [
      "Built a self-service metrics dashboard that let leadership find and export data on their own, replacing manual requests to developers.",
      "Front end in React, TypeScript and Chakra UI over data from a MySQL database, with quick toggles for selecting, filtering and downloading data.",
      "Worked with SwaggerHub, Apigee Edge, Jenkins and Splunk inside the enterprise API process.",
    ],
    tech: [
      { label: "Frontend", items: ["React", "TypeScript", "Chakra UI"] },
      { label: "Data", items: ["MySQL"] },
      { label: "Platform", items: ["SwaggerHub", "Apigee Edge", "Jenkins", "Splunk"] },
    ],
    preview: {
      mode: "career",
      address: "CVS Health · internal",
      note: "Internal work. Described from my resume; no code or screens are public.",
    },
    metrics: [
      { value: "Self-serve", label: "metrics and exports for leadership, replacing manual requests to developers" },
    ],
    links: [],
  },
  {
    slug: "proshop",
    kind: "project",
    year: 2024,
    date: "April 2024",
    stage: "4th year of college",
    title: "ProShop course project",
    tagline: "My changes to a MERN e-commerce app",
    summary:
      "A college course project built on Brad Traversy's ProShop e-commerce app. The viewer shows only my changes.",
    built: [
      "Ten code-smell fixes across React screens in one pull request: PropTypes, merged duplicate imports, stable list keys instead of array indexes, and nested loading/error ternaries flattened.",
      "Google and Facebook sign-in logic on the login screen.",
      "17 commits in April 2024 on a team fork of the course codebase.",
    ],
    tech: [
      { label: "Frontend", items: ["React", "Redux Toolkit"] },
      { label: "Backend", items: ["Node.js", "Express"] },
      { label: "Data", items: ["MongoDB"] },
    ],
    preview: {
      mode: "contribution",
      url: "/previews/proshop/",
      address: "proshop-v2 · my pull request and commits",
      note: "The course app is Brad Traversy's. This view shows my pull request and commits, with diffs from GitHub.",
    },
    links: [
      { label: "Course project source", href: "https://github.com/Colbyco/proshop-v2" },
      { label: "My pull request", href: "https://github.com/Colbyco/proshop-v2/pull/1" },
    ],
  },
  {
    slug: "cvs-scheduling",
    kind: "career",
    year: 2024,
    date: "2024 – 2026",
    stage: "Software Engineer, full time",
    title: "API Scheduling Team, CVS Health",
    railTitle: "API Scheduling · CVS",
    tagline: "Appointment APIs for in-person and virtual care",
    summary:
      "APIs and data flows behind appointment scheduling for CVS Health's in-person and virtual care. I also owned releases and built the team's tracing, test speedups and an LLM triage bot.",
    built: [
      "Release owner for 19 months. Built automation that opens promotion PRs from the latest CI image tags, which shipped an 11-service UAT release wave in one day.",
      "Built structured logging and cross-service request tracing (correlation IDs, parent spans, OpenTelemetry) across all 3 core scheduling services. A 16.5k-event audit found and fixed lost correlation on 1.6% of outbound calls.",
      "Cut the scheduling API's full test suite 58% (5m33s → 2m22s) and one test group 97% (185 s → 6 s) by removing per-test Spring context rebuilds and test-state leaks.",
      "Built an LLM triage bot for lower-environment tickets. It maps 44 GraphQL queries, 22 mutations and 60+ downstream APIs into a knowledge graph, routes log traces through a gatekeeper model to 8 domain-expert nodes, and posts the root cause and owning team to Slack. Mentored a newly hired engineer through his first project on it.",
      "Shipped earliest-availability and distance ranking for employer-sponsored provider search to production.",
      "Carried preferred-pharmacy selections across 6 services through booking, confirmation and rescheduling, persisted to Cassandra and MySQL.",
      "Migrated 10 codebases to GitHub Actions and remediated dependency vulnerabilities across 17 scheduling repositories, taking one API from 33 findings to 0.",
      "Root-caused 15+ defects, including a Netty bitmask bug that rejected valid URIs containing \"J\" or \"M\".",
    ],
    tech: [
      { label: "Backend", items: ["Java", "Spring Boot", "GraphQL", "REST"] },
      { label: "Data", items: ["Cassandra", "MySQL"] },
      { label: "Delivery", items: ["GitHub Actions", "Harness", "Snyk"] },
      { label: "Observability", items: ["OpenTelemetry", "Splunk", "Structured logging"] },
      { label: "AI tooling", items: ["Python", "LLM routing", "Slack integration"] },
    ],
    preview: {
      mode: "career",
      address: "CVS Health · internal",
      note: "Internal work, described in general terms. No code or screens are public.",
    },
    metrics: [
      { value: "58%", label: "faster full test suite (5m33s → 2m22s); one group 185 s → 6 s" },
      { value: "19 mo", label: "release owner; 11 services shipped to UAT in one day with my automation" },
      { value: "1.6%", label: "lost trace correlation found and fixed in a 16.5k-event audit" },
      { value: "17", label: "scheduling repositories cleared of dependency vulnerabilities" },
    ],
    links: [],
  },
  {
    slug: "music-search",
    kind: "project",
    year: 2024,
    date: "December 2024",
    stage: "First year as a software engineer",
    title: "Music Search App",
    tagline: "Java MP3 indexer over ID3 tags",
    summary:
      "A Java tool that walks the folders you choose, reads every MP3's ID3v1 and ID3v2 tags, and indexes the songs by title and artist.",
    built: [
      "Recursive folder walk with java.nio's Files.walkFileTree.",
      "Tag reading with mp3agic for both ID3 versions, plus length, bitrate, sample rate and channel mode.",
      "Songs indexed by title and artist; built with Maven.",
    ],
    tech: [
      { label: "Language", items: ["Java"] },
      { label: "Libraries", items: ["mp3agic", "java.nio"] },
      { label: "Build", items: ["Maven"] },
    ],
    preview: {
      mode: "original",
      url: "/previews/music-search/",
      address: "music-search-app · 2024 Java code",
      note: "The original, unmodified Java classes running in your browser on CheerpJ, a Java virtual machine in WebAssembly, over a bundled sample library of tagged MP3s.",
    },
    links: [{ label: "Source code", href: "https://github.com/Colbyco/music-search-app" }],
  },
  {
    slug: "cvs-ai-assistant",
    kind: "career",
    year: 2026,
    date: "2026 – present",
    stage: "Software Engineer, full time",
    title: "Health Agent AI Team, CVS Health",
    railTitle: "Health Agent AI · CVS",
    tagline: "The patient-facing AI health assistant",
    summary:
      "The patient-facing AI health assistant in CVS Health's consumer health app. I built its debugging platform, improved answer accuracy and speed, and built the evaluation that gated new designs.",
    built: [
      "Built a session-debugging platform (React, FastAPI, SQLite, Splunk) that rebuilds any patient conversation turn by turn from 8 log sources searched in parallel. Adopted by about 30–40% of the team without a formal rollout.",
      "Cut the platform's cold loads from ~55 s to ~25 s (under 200 ms cached) and its payloads about 2,600×. Then studied 153 defects, 213 fix PRs and 296 manual log queries to choose 13 new debugging features.",
      "Raised lab-question recall from 84.3% to 92.1%, measured on 554 real lab panels from 62 production profiles.",
      "Cut the welcome-turn response time by ~16.5 s, measured end to end, by replacing three sequential LLM calls with a deterministic route.",
      "Designed and validated 7 feature-flagged domain specialists with a ~32k-line offline evaluation platform. In evaluation, two lab-answer defects fell from 25% and 43% of responses to zero, and blinded reviewers preferred the new answers 64% of the time (p = 0.0083). Piloted across 5 domains in staging.",
      "Shipped a recent-health-summary feature end to end across a Python LangGraph agent and a TypeScript card service: a 5-domain parallel fetch, LLM synthesis and next-step chips (14 merged PRs).",
      "Designed and built field-level envelope encryption and header redaction for PHI/PII in application logs, with decryption isolated to the diagnostics tool.",
      "Fixed 15+ patient-facing correctness and safety defects, including false crisis-hotline banners and abnormal labs summarized as normal.",
    ],
    tech: [
      { label: "AI systems", items: ["LangGraph", "Multi-agent routing", "Offline evaluation", "Guardrails"] },
      { label: "Tooling", items: ["React", "TypeScript", "FastAPI", "SQLite"] },
      { label: "Observability", items: ["Splunk", "Structured events", "Session timelines"] },
      { label: "Security", items: ["Envelope encryption", "PHI/PII redaction"] },
    ],
    preview: {
      mode: "career",
      address: "CVS Health · internal",
      note: "Internal work, described in general terms. No code or screens are public.",
    },
    metrics: [
      { value: "92.1%", label: "lab-question recall, up from 84.3%, measured on 554 real lab panels" },
      { value: "≈16.5 s", label: "faster welcome turn, measured end to end" },
      { value: "30–40%", label: "of the team adopted my debugging platform without a formal rollout" },
      { value: "64%", label: "blinded reviewer preference for specialist answers (p = 0.0083)" },
    ],
    links: [],
  },
  {
    slug: "aspicio",
    kind: "project",
    year: 2026,
    date: "July 2026",
    stage: "While working full time at CVS Health",
    title: "Aspicio",
    tagline: "Astrology platform on NASA JPL data",
    summary:
      "An astrology platform with interactive birth charts, a 3D sky and relocation maps. Its positions match NASA JPL Horizons to within 0.0005″ in every cell of a 1,250-cell test grid.",
    built: [
      "An ephemeris engine that reads NASA JPL's DE441 with IAU 2006 precession and IAU 2000A nutation, so the sky and the charts print the same numbers.",
      "Dozens of tools, from birth charts, transits and returns to electional search and family charts.",
      "A 3D sky in Three.js and relocation maps with MapLibre and self-hosted PMTiles.",
      "Over 1,700 commits and 600 test files between July 30 and mid-October 2026.",
    ],
    tech: [
      { label: "Frontend", items: ["Next.js", "React", "TypeScript", "Three.js"] },
      { label: "Maps", items: ["MapLibre GL", "PMTiles"] },
      { label: "Data", items: ["Supabase", "PostgreSQL", "NASA JPL DE441"] },
      { label: "Hosting", items: ["Vercel"] },
    ],
    preview: {
      mode: "live",
      url: "https://aspicio.app/chart?loc=Seattle&lat=47.6062&lng=-122.3321&tz=America/Los_Angeles&scroll=chart",
      stampNow: "America/Los_Angeles",
      routes: [
        { label: "Birth chart", url: "https://aspicio.app/chart?loc=Seattle&lat=47.6062&lng=-122.3321&tz=America/Los_Angeles&scroll=chart", address: "aspicio.app/chart · Seattle, right now" },
        { label: "3D sky", url: "https://aspicio.app/sky", address: "aspicio.app/sky" },
        { label: "Places map", url: "https://aspicio.app/places", address: "aspicio.app/places" },
        { label: "Accuracy", url: "https://aspicio.app/accuracy", address: "aspicio.app/accuracy" },
      ],
      address: "aspicio.app/chart · Seattle, right now",
      note: "The real production site, embedded 1:1 and opened on a chart of the sky over Seattle at this moment. Use its own menus to explore the 3D sky, maps and every other tool.",
    },
    links: [
      { label: "Open Aspicio", href: "https://aspicio.app/" },
      { label: "3D sky", href: "https://aspicio.app/sky" },
      { label: "Accuracy report", href: "https://aspicio.app/accuracy" },
    ],
  },
  {
    slug: "spotify-classic-lyrics",
    kind: "project",
    year: 2026,
    date: "October 2026",
    stage: "While working full time at CVS Health",
    title: "Spotify Classic Lyrics",
    tagline: "One-click desktop fix for Spotify's lyrics",
    summary:
      "A one-click desktop fix that puts Spotify's lyrics back beside your library and playback controls, on Windows and macOS.",
    built: [
      "Electron app that changes Spotify's local preferences, with Undo to restore the previous setting.",
      "Local diagnostics and a reviewable problem report; nothing is sent without permission.",
      "Automatic updates on Windows and a GitHub Actions release pipeline: four releases, v1.0.1 to v1.0.4, in October 2026.",
    ],
    tech: [
      { label: "Desktop", items: ["Electron", "Node.js"] },
      { label: "Storage", items: ["LevelDB (classic-level)"] },
      { label: "Delivery", items: ["GitHub Actions", "electron-updater"] },
    ],
    preview: {
      mode: "simulated",
      url: "/previews/spotify-classic-lyrics/",
      address: "Classic Lyrics · v1.0.4 interface",
      note: "The app's real interface and its own main-process code, with only Electron, the settings store and the operating system simulated. Nothing on your computer is changed.",
    },
    links: [
      { label: "Download v1.0.4", href: "https://github.com/Colbyco/spotify-classic-lyrics/releases/latest" },
      { label: "Source code", href: "https://github.com/Colbyco/spotify-classic-lyrics" },
    ],
  },
];

export const FEATURED = "aspicio";

export const impact: Metric[] = [
  { value: "≈16.5 s", label: "faster welcome turn in CVS's AI health assistant, measured end to end" },
  { value: "92.1%", label: "lab-question recall in the assistant, up from 84.3%" },
  { value: "58%", label: "faster scheduling test suite, 5m33s to 2m22s" },
  { value: "427", label: "merged PRs and 402 code reviews at CVS Health" },
];

export const skills: TechGroup[] = [
  { label: "Languages and frameworks", items: ["Java", "Python", "TypeScript", "JavaScript", "SQL", "Spring Boot", "FastAPI", "React", "LangGraph", "REST", "GraphQL"] },
  { label: "AI systems", items: ["LLM applications", "Multi-agent routing", "Offline evaluation", "Guardrails"] },
  { label: "Security and delivery", items: ["Snyk", "Software composition analysis", "GitHub Actions", "Harness", "Argo CD", "Kubernetes"] },
  { label: "Data and observability", items: ["MySQL", "PostgreSQL", "Cassandra", "Redis", "Splunk", "OpenTelemetry"] },
];
