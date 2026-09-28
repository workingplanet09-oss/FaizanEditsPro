/**
 * Default site configuration. Everything here is overridable from Admin → Settings / Website content and is
 * stored in the `settings` table. Nothing in this file is a claim about real business results.
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface StatConfig {
  key: string;
  label: string;
  /** auto = computed from real database values; manual = value typed by admin; hidden = never shown */
  mode: "auto" | "manual" | "hidden";
  value?: string;
  suffix?: string;
}

export const SETTING_DEFAULTS = {
  business: {
    name: "FaizanEdits Pro",
    legalName: "FaizanEdits Pro",
    tagline: "Video editing studio for creators, brands and teams.",
    email: "hello@faizaneditspro.com",
    phone: "",
    address: "",
    logoUrl: "",
    faviconUrl: "",
    website: "",
    socials: { instagram: "", youtube: "", linkedin: "", tiktok: "", x: "", behance: "" } as Record<string, string>,
    defaultCurrency: "USD",
    currencies: ["USD", "EUR", "GBP", "AED", "PKR", "CAD", "AUD"],
    timezone: "UTC",
    defaultTurnaround: "3–5 business days",
    revisionPolicy:
      "Every project includes two rounds of revisions. A round is one consolidated set of notes on a draft. Additional rounds or changes to the agreed scope are quoted separately.",
  },
  theme: {
    accent: "#FF5B2E",
    accentContrast: "#0B0B0C",
  },
  hero: {
    eyebrow: "Video editing studio",
    headline: "Your Footage.\nOur Edit.\nContent People Remember.",
    subheadline:
      "Professional video editing for creators, brands, businesses, podcasts, and teams that want their content to look sharper, sound better, and perform harder.",
    primaryCta: { label: "Start a Project", href: "/start-project" },
    secondaryCta: { label: "View Our Work", href: "/work" },
    showreelUrl: "",
    posterUrl: "",
    trustPoints: ["Fixed-scope quotes", "Timestamped review", "Clear turnaround"],
    floatingCards: [
      { icon: "check", title: "Project Delivered", sub: "Final files ready" },
      { icon: "message", title: "Revision Approved", sub: "Version 2 · approved" },
      { icon: "clock", title: "48h Turnaround", sub: "On rush projects" },
      { icon: "film", title: "4K Export", sub: "Master + social cuts" },
    ],
  },
  stats: {
    heading: "",
    items: [
      { key: "clients", label: "Clients served", mode: "auto" },
      { key: "projects", label: "Projects completed", mode: "auto" },
      { key: "years", label: "Years of experience", mode: "manual", value: "", suffix: "+" },
      { key: "turnaround", label: "Average turnaround", mode: "auto" },
      { key: "satisfaction", label: "Client satisfaction", mode: "auto" },
      { key: "content", label: "Files delivered", mode: "auto" },
    ] as StatConfig[],
  },
  nav: {
    links: [
      { label: "Services", href: "/services" },
      { label: "Work", href: "/work" },
      { label: "Process", href: "/process" },
      { label: "Pricing", href: "/pricing" },
      { label: "About", href: "/about" },
      { label: "Case Studies", href: "/case-studies" },
      { label: "Resources", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ] as NavLink[],
    loginLabel: "Login",
    ctaLabel: "Start a Project",
  },
  footer: {
    description: "A video editing studio with its own production system — so every project is organised, reviewable and delivered on time.",
    columns: [
      {
        title: "Services",
        links: [
          { label: "Short-Form Editing", href: "/services/short-form-video-editing" },
          { label: "YouTube Editing", href: "/services/youtube-video-editing" },
          { label: "Podcast Editing", href: "/services/podcast-editing" },
          { label: "Real Estate Video", href: "/services/real-estate-video-editing" },
          { label: "All services", href: "/services" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "About", href: "/about" },
          { label: "Process", href: "/process" },
          { label: "Pricing", href: "/pricing" },
          { label: "Contact", href: "/contact" },
          { label: "Book a call", href: "/book" },
        ],
      },
      {
        title: "Resources",
        links: [
          { label: "Blog", href: "/blog" },
          { label: "Case studies", href: "/case-studies" },
          { label: "FAQ", href: "/faq" },
          { label: "Help center", href: "/help" },
        ],
      },
    ] as { title: string; links: NavLink[] }[],
    newsletter: true,
  },
  process: {
    heading: "A production process you can actually see",
    intro: "Seven clear steps from first message to final files. At every stage you know what happened, what's happening and what we need from you.",
    steps: [
      {
        title: "Tell us what you need",
        summary: "A short guided request — not a giant form.",
        detail:
          "Start with a few tap-friendly questions about your project, your audience and your goals. The questions adapt to your niche — a real-estate listing and a podcast need very different information — so you only answer what matters.",
        youDo: "Answer the guided questions (about 3 minutes) and attach any references.",
        weDo: "Capture everything in a structured request so nothing is lost in DMs.",
      },
      {
        title: "We review your requirements",
        summary: "A real person reads your request.",
        detail:
          "We review scope, footage, style references and timeline, and flag anything that could affect quality or delivery. If a discovery call would help, we'll suggest a time.",
        youDo: "Watch for our reply — usually within one business day.",
        weDo: "Assess scope, complexity and the best editor for the job.",
      },
      {
        title: "You receive a quote",
        summary: "Fixed scope, clear price, no surprises.",
        detail:
          "You get an itemised quote in your client portal: deliverables, quantity, turnaround, revision rounds and total. Accept it with one click. Need a change? Reply and we'll adjust it.",
        youDo: "Review and accept the quote in your portal.",
        weDo: "Prepare a fixed-scope quote and agreement.",
      },
      {
        title: "Project onboarding",
        summary: "Sign, pay, and brief us once.",
        detail:
          "Sign the agreement, pay the invoice and complete a detailed project brief. Your brand kit is saved so repeat projects are faster. Upload footage, logos, scripts and music straight to your project.",
        youDo: "Sign, pay and fill in the project brief; upload your files.",
        weDo: "Generate your project brief, folders, tasks and assign your editor.",
      },
      {
        title: "Editing begins",
        summary: "Your editor gets to work.",
        detail:
          "Your project moves to production with a dedicated editor. You can follow status, milestones and the expected draft date at any time — and message the team right inside the project.",
        youDo: "Answer any quick questions from your editor.",
        weDo: "Cut, colour, sound-design, caption and prepare the first draft.",
      },
      {
        title: "You review and request revisions",
        summary: "Comment on the exact frame.",
        detail:
          "Watch the draft in our review player and click the timeline to leave timestamped feedback. Submit your notes as a revision round; every version is kept so you can compare V1, V2 and beyond.",
        youDo: "Leave timestamped notes and send them as a revision — or approve.",
        weDo: "Respond to each note, resolve it, and upload the next version.",
      },
      {
        title: "Final delivery",
        summary: "Approve and download everything.",
        detail:
          "Approve the version you're happy with. Your final deliverables — masters, social cuts, captions, thumbnails and source files where included — appear on a delivery page ready to download. Then we'll ask how we did.",
        youDo: "Approve the final version and download your files.",
        weDo: "Prepare deliverables, close out the project and keep your assets organised for next time.",
      },
    ],
  },
  about: {
    headline: "A studio built around your content — and a system built around you.",
    story:
      "We started as editors who were tired of chaotic feedback threads, lost files and unclear timelines. So we built the studio we wished existed: a creative team with a real production process behind it.\n\nEvery project runs through the same visible pipeline — brief, production, review, revision, approval, delivery — so clients always know what's happening and editors always know what's needed.",
    values: [
      { title: "Clarity over chaos", body: "One place for briefs, files, feedback and invoices." },
      { title: "Craft over templates", body: "Edits shaped around your audience, not a preset." },
      { title: "Honest scope", body: "Fixed quotes, defined revisions, no surprise bills." },
      { title: "Respect for your time", body: "Fast replies, predictable turnarounds, easy approvals." },
    ],
    team: [] as { name: string; role: string; bio?: string; imageUrl?: string }[],
  },
  contactInfo: {
    heading: "Tell us about your project",
    intro: "Prefer to talk first? Book a discovery call. Otherwise send a message and we'll reply within one business day.",
    responseTime: "Within 1 business day",
  },
  legal: {
    terms:
      "These Terms of Service are a starting template. Replace this text with terms reviewed by a qualified professional before going live.\n\n1. Services. The studio provides video editing services as described in each accepted quote and agreement.\n2. Payment. Fees are due according to the invoice schedule in the agreement.\n3. Revisions. Included revision rounds are stated in the agreement; extra work is quoted separately.\n4. Ownership. Final deliverables are licensed to the client on full payment.\n5. Confidentiality. Client materials are kept confidential and used only for the project.",
    privacy:
      "This Privacy Policy is a starting template. Replace it with a policy reviewed by a qualified professional before going live.\n\nWe collect the information you submit (name, email, project details, files) to respond to your request, deliver services and manage your account. We do not sell personal information. Files are stored in access-controlled cloud storage and are only available to you and the team members working on your project.",
  },
  invoice: {
    prefix: "INV",
    dueDays: 7,
    notes: "Thank you for your business.",
    paymentInstructions: "",
    taxRateBps: 0,
  },
  quote: {
    prefix: "Q",
    validDays: 14,
    defaultDepositPercent: 50,
    taxRateBps: 0,
    terms: "Prices are fixed for the scope described. Additional work or scope changes are quoted separately. This quote is valid until the date shown.",
  },
  workflow: {
    requireInternalReview: false,
    requirePaymentBeforeDelivery: true,
    autoInvoiceOnContractSigned: true,
    rushFeePercent: 25,
    referralsEnabled: true,
    referralReward: "10% off your next project",
    timeTrackingEnabled: true,
    testimonialRequestOnDelivery: true,
    maxUploadMb: 20480,
  },
  booking: {
    enabled: true,
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
    slotMinutes: 30,
    timezone: "UTC",
    minNoticeHours: 12,
    horizonDays: 21,
    types: {
      DISCOVERY_CALL: { label: "Discovery Call", minutes: 30, description: "Tell us about your project and see if we're a fit." },
      PROJECT_CONSULTATION: { label: "Project Consultation", minutes: 45, description: "Scope a specific project in detail." },
      STRATEGY_CALL: { label: "Strategy Call", minutes: 45, description: "Plan an ongoing content system or retainer." },
      CLIENT_REVIEW_CALL: { label: "Client Review Call", minutes: 30, description: "Walk through a draft together (existing clients)." },
    } as Record<string, { label: string; minutes: number; description: string }>,
  },
  seo: {
    titleTemplate: "%s | FaizanEdits Pro",
    defaultDescription: "Professional video editing for creators, brands and businesses — with a client portal for briefs, timestamped review and delivery.",
    ogImage: "",
  },
  notifications: {
    adminEmail: "",
  },
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = typeof SETTING_DEFAULTS;

/** Contract template. `{{vars}}` are filled from the project, client and studio settings; admin can edit every clause per contract. */
export const CONTRACT_TEMPLATE: { key: string; title: string; body: string }[] = [
  {
    key: "parties",
    title: "1. Parties",
    body: "This agreement is between {{studio_name}} (the “Studio”) and {{client_name}} of {{company}} (the “Client”), effective on the date the Client signs below.",
  },
  {
    key: "scope",
    title: "2. Project scope",
    body: "The Studio will provide video editing services for the project “{{project_name}}” as described here:\n{{scope}}",
  },
  { key: "deliverables", title: "3. Deliverables", body: "The Studio will deliver:\n{{deliverables}}" },
  {
    key: "turnaround",
    title: "4. Turnaround",
    body: "The first draft will be delivered within {{turnaround}} of the Studio receiving all required assets and the completed project brief. Delays in receiving assets or feedback extend the timeline accordingly.",
  },
  {
    key: "payment",
    title: "5. Payment terms",
    body: "Total fee: {{total}}. A deposit of {{deposit}} is due on signing; any remaining balance of {{balance}} is due before final files are released, unless otherwise agreed in writing. Work begins once payment conditions for the deposit are met.",
  },
  {
    key: "revisions",
    title: "6. Revisions",
    body: "This agreement includes {{revision_rounds}} round(s) of revisions. A round is one consolidated set of notes on a delivered draft. Additional rounds, or changes to the agreed scope after production has started, are handled as a change request and may be quoted separately.",
  },
  {
    key: "usage",
    title: "7. Usage rights",
    body: "On receipt of full payment the Studio grants the Client a perpetual, worldwide licence to use the final deliverables for the Client's business purposes. The Studio may display non-confidential excerpts in its portfolio unless the Client requests otherwise in writing.",
  },
  {
    key: "confidentiality",
    title: "8. Confidentiality",
    body: "Each party will keep the other's non-public materials confidential and use them only for this project. Client footage and assets are stored in access-controlled storage and only shared with team members working on the project.",
  },
  {
    key: "cancellation",
    title: "9. Cancellation",
    body: "Either party may cancel with written notice. Work completed to the date of cancellation is billable. Deposits cover time reserved and work performed.",
  },
  {
    key: "refunds",
    title: "10. Refunds",
    body: "Because the Studio reserves time and begins work on payment, deposits are non-refundable once production has started. If the Studio cannot deliver the agreed scope, the Client will receive a refund for the undelivered portion.",
  },
  {
    key: "ownership",
    title: "11. Ownership",
    body: "The Client retains ownership of all supplied footage, brand assets and materials. The Studio retains ownership of its working files, templates and methods, except where source files are listed as deliverables.",
  },
  {
    key: "approval",
    title: "12. Approval",
    body: "Approval of a version in the Studio's review portal confirms the deliverable meets the agreed requirements. After approval, further changes are treated as a new request.",
  },
];

export const DEFAULT_PROJECT_FOLDERS: { key: string; name: string }[] = [
  { key: "raw-footage", name: "Raw Footage" },
  { key: "audio", name: "Audio" },
  { key: "brand-assets", name: "Brand Assets" },
  { key: "logos", name: "Logos" },
  { key: "references", name: "References" },
  { key: "scripts", name: "Scripts" },
  { key: "voiceovers", name: "Voiceovers" },
  { key: "music", name: "Music" },
  { key: "graphics", name: "Graphics" },
  { key: "final-exports", name: "Final Exports" },
];

export const LEAD_SOURCES: { key: string; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "referral", label: "Referral" },
  { key: "google", label: "Google" },
  { key: "email", label: "Email" },
  { key: "direct", label: "Direct" },
  { key: "advertisement", label: "Advertisement" },
  { key: "portal", label: "Client portal" },
  { key: "booking", label: "Call booking" },
  { key: "other", label: "Other" },
];

export const BUDGET_RANGES: { value: string; label: string; maxUsd: number }[] = [
  { value: "under_250", label: "Under $250", maxUsd: 250 },
  { value: "250_500", label: "$250 – $500", maxUsd: 500 },
  { value: "500_1000", label: "$500 – $1,000", maxUsd: 1000 },
  { value: "1000_2500", label: "$1,000 – $2,500", maxUsd: 2500 },
  { value: "2500_5000", label: "$2,500 – $5,000", maxUsd: 5000 },
  { value: "5000_plus", label: "$5,000+", maxUsd: 10000 },
  { value: "not_sure", label: "Not sure yet", maxUsd: 0 },
];

/** Maps a public service slug to the wizard's first-step value. */
export const SERVICE_TO_LOOKING_FOR: Record<string, string> = {
  "short-form-video-editing": "short_form",
  "youtube-video-editing": "long_form",
  "podcast-editing": "podcast",
  "real-estate-video-editing": "real_estate",
  "vsl-editing": "vsl",
  "saas-video-editing": "video_editing",
  "corporate-video-editing": "video_editing",
  "ugc-editing": "short_form",
  "social-media-clips": "social_media",
  "motion-graphics": "motion_graphics",
  "talking-head-editing": "video_editing",
  "gaming-content-editing": "short_form",
  "event-video-editing": "video_editing",
  "ad-creative-editing": "ads",
};
