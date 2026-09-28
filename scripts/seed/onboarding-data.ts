/**
 * Onboarding question bank (seed data). Everything here lands in the database and is editable from
 * Admin → Onboarding forms — nothing in the app hard-codes a question.
 *
 *   cats:   which question groups (categories) show this question. Empty = always (COMMON is always active).
 *   logic:  extra show/hide rules against other answers.
 *   options: [value, label, categoriesAddedWhenSelected?, icon?, description?]
 */
import { BUDGET_RANGES } from "../../src/lib/site-defaults";

type Opt = string | [string, string] | [string, string, string[]] | [string, string, string[], string] | [string, string, string[], string, string];
export interface QSeed {
  section: string;
  key: string;
  text: string;
  type: "TEXT" | "TEXTAREA" | "SELECT" | "MULTI_SELECT" | "RADIO" | "CHECKBOX" | "DATE" | "TIME" | "NUMBER" | "CURRENCY" | "FILE" | "URL" | "EMAIL" | "PHONE" | "COLOR" | "RATING";
  required?: boolean;
  help?: string;
  placeholder?: string;
  cats?: string[];
  options?: Opt[];
  logic?: { all?: { field: string; op: string; value?: unknown }[]; any?: { field: string; op: string; value?: unknown }[] };
  meta?: Record<string, unknown>;
}

const q = (section: string, key: string, text: string, type: QSeed["type"], o: Partial<QSeed> = {}): QSeed => ({ section, key, text, type, ...o });
const YN: Opt[] = [["yes", "Yes"], ["no", "No"]];
const YNS: Opt[] = [["yes", "Yes"], ["no", "No"], ["not_sure", "Not sure"]];
const HAVE_NEED: Opt[] = [["have", "I have this ready"], ["need", "I need help with this"], ["none", "Not needed"]];

export const CATEGORIES: [string, string][] = [
  ["COMMON", "Common (everyone)"], ["CREATOR", "Creator"], ["YOUTUBE", "YouTube"], ["SHORT_FORM", "Short-form"], ["PODCAST", "Podcast"], ["REAL_ESTATE", "Real estate"], ["FINANCE", "Finance / investing"],
  ["SAAS", "SaaS / startup"], ["CORPORATE", "Corporate"], ["GAMING", "Gaming"], ["ECOMMERCE", "E-commerce"], ["FITNESS", "Fitness"], ["DENTAL", "Dental / medical"], ["VSL", "VSL / direct response"],
  ["AGENCY", "Agency"], ["WEDDING", "Wedding / events"], ["EDUCATION", "Education"], ["TRAVEL", "Travel"], ["FOOD", "Food / restaurant"], ["AUTOMOTIVE", "Automotive"], ["COACHING", "Coaching / consulting"],
  ["SOCIAL", "Social media management"], ["MOTION", "Motion graphics"], ["ADS", "Ad creative"],
];

// ───────────────────────────── INQUIRY FORM (public "Start a Project" wizard) ─────────────────────────────

export const INQUIRY_SECTIONS: { key: string; title: string; description?: string }[] = [
  { key: "looking_for", title: "What are you looking for?", description: "Pick the closest match — you can add details later." },
  { key: "client_type", title: "What type of client are you?", description: "This helps us tailor the next questions." },
  { key: "details", title: "Tell us about the project.", description: "The questions below adapt to your niche." },
  { key: "workflow", title: "What does your current workflow look like?", description: "So we can plan turnaround and capacity properly." },
  { key: "budget", title: "What's your budget?", description: "A rough range is fine. It just helps us recommend the right setup." },
  { key: "style", title: "What style are you looking for?", description: "Choose as many as you like." },
  { key: "contact", title: "How can we contact you?", description: "We reply from a real inbox, usually within one business day." },
  { key: "description", title: "Tell us about your project.", description: "Goals, audience, references — anything that helps us understand what great looks like." },
  { key: "uploads", title: "Add reference files (optional).", description: "Scripts, brand guides, example videos, raw clips — PDF, DOCX, images, ZIP, video or audio." },
];

const NICHES: Opt[] = [
  ["real_estate", "Real estate", ["REAL_ESTATE"]],
  ["podcast", "Podcast", ["PODCAST"]],
  ["youtube_creator", "YouTube creator", ["CREATOR", "YOUTUBE"]],
  ["short_form_creator", "Short-form creator", ["CREATOR", "SHORT_FORM"]],
  ["finance", "Finance / investing creator", ["FINANCE", "CREATOR"]],
  ["saas", "SaaS / startup", ["SAAS"]],
  ["corporate", "Corporate", ["CORPORATE"]],
  ["dental_medical", "Dental / medical marketing", ["DENTAL"]],
  ["fitness", "Fitness", ["FITNESS"]],
  ["ecommerce", "E-commerce", ["ECOMMERCE"]],
  ["gaming", "Gaming", ["GAMING", "CREATOR"]],
  ["vsl", "VSL / direct response", ["VSL"]],
  ["coaching", "Coaching / consulting", ["COACHING"]],
  ["personal_brand", "Personal brand", ["CREATOR"]],
  ["agency", "Agency", ["AGENCY"]],
  ["wedding_events", "Wedding / events", ["WEDDING"]],
  ["education", "Education", ["EDUCATION"]],
  ["travel", "Travel", ["TRAVEL"]],
  ["food", "Food / restaurant", ["FOOD"]],
  ["automotive", "Automotive", ["AUTOMOTIVE"]],
  ["social_media_mgmt", "Social media management", ["SOCIAL"]],
  ["other", "Other"],
];

export const INQUIRY_QUESTIONS: QSeed[] = [
  // 1 — what
  q("looking_for", "looking_for", "What are you looking for?", "RADIO", {
    required: true,
    meta: { leadField: "lookingFor", display: "cards" },
    options: [
      ["video_editing", "Video editing", [], "film", "General editing for any format"],
      ["short_form", "Short-form content", ["SHORT_FORM", "CREATOR"], "smartphone", "Reels, Shorts, TikToks"],
      ["long_form", "Long-form editing", ["CREATOR", "YOUTUBE"], "play", "YouTube & long videos"],
      ["podcast", "Podcast editing", ["PODCAST"], "mic", "Full episodes, clips, audio"],
      ["real_estate", "Real estate editing", ["REAL_ESTATE"], "home", "Listings, tours, agent reels"],
      ["motion_graphics", "Motion graphics", ["MOTION"], "sparkles", "Animation, titles, explainers"],
      ["vsl", "VSL", ["VSL"], "megaphone", "Video sales letters"],
      ["ads", "Ads", ["ADS"], "target", "Paid social & performance creative"],
      ["social_media", "Social media content", ["SOCIAL", "SHORT_FORM"], "share", "Ongoing content for brands"],
      ["other", "Something else", [], "more", "Tell us in your own words"],
    ],
  }),
  // 2 — client type
  q("client_type", "client_type", "What type of client are you?", "RADIO", {
    required: true,
    meta: { leadField: "clientType", display: "cards" },
    options: [
      ["creator", "Creator", ["CREATOR"], "video"],
      ["business", "Business", [], "briefcase"],
      ["agency", "Agency", ["AGENCY"], "users"],
      ["brand", "Brand", [], "star"],
      ["startup", "Startup", [], "rocket"],
      ["corporate", "Corporate", ["CORPORATE"], "building"],
      ["personal_brand", "Personal brand", ["CREATOR"], "user"],
      ["other", "Other", [], "more"],
    ],
  }),
  // 3 — details: common + niche-specific
  q("details", "niche", "What's your niche or industry?", "SELECT", { required: true, meta: { leadField: "industry" }, help: "We use this to ask the right follow-up questions.", options: NICHES }),
  q("details", "target_audience", "Who is this video for?", "TEXT", { placeholder: "e.g. first-time home buyers in Austin", help: "Your ideal viewer — the more specific, the better the edit." }),
  q("details", "platforms", "Where will it be published?", "MULTI_SELECT", { options: [["youtube", "YouTube"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["linkedin", "LinkedIn"], ["facebook", "Facebook"], ["x", "X / Twitter"], ["website", "Website / landing page"], ["paid_ads", "Paid ads"], ["other", "Other"]] }),
  q("details", "youtube_channel", "What's your YouTube channel URL?", "URL", { cats: ["YOUTUBE"], placeholder: "https://youtube.com/@yourchannel", logic: { all: [{ field: "platforms", op: "contains", value: "youtube" }] } }),
  q("details", "video_goal", "What's the main goal?", "SELECT", { options: [["awareness", "Build awareness"], ["leads", "Generate leads"], ["sales", "Drive sales"], ["education", "Educate / inform"], ["retention", "Grow & retain an audience"]] }),
  // Creator / short-form
  q("details", "shorts_count", "How many short videos per batch?", "NUMBER", { cats: ["SHORT_FORM"], meta: { min: 1, max: 500 }, placeholder: "e.g. 10" }),
  q("details", "short_length", "Typical length of each short?", "SELECT", { cats: ["SHORT_FORM"], options: [["15", "Up to 15 seconds"], ["30", "15–30 seconds"], ["60", "30–60 seconds"], ["90", "60–90 seconds"]] }),
  q("details", "hook_style", "What kind of hooks perform for you?", "SELECT", { cats: ["SHORT_FORM"], options: [["question", "A question"], ["bold_claim", "A bold claim"], ["pattern_interrupt", "Pattern interrupt"], ["story", "Story opener"], ["not_sure", "Not sure — advise me"]] }),
  q("details", "captions_style", "Caption style?", "SELECT", { cats: ["SHORT_FORM", "PODCAST"], options: [["animated", "Animated / word-by-word"], ["minimal", "Minimal"], ["branded", "Branded style"], ["none", "No captions"]] }),
  // Real estate
  q("details", "property_type", "Property type", "SELECT", { cats: ["REAL_ESTATE"], required: true, options: [["house", "House"], ["condo", "Condo / apartment"], ["townhouse", "Townhouse"], ["land", "Land"], ["commercial", "Commercial"], ["luxury", "Luxury estate"], ["multi_family", "Multi-family"]] }),
  q("details", "listing_location", "Listing location", "TEXT", { cats: ["REAL_ESTATE"], placeholder: "City, neighbourhood" }),
  q("details", "re_video_style", "Video style", "SELECT", { cats: ["REAL_ESTATE"], options: [["walkthrough", "Walkthrough tour"], ["cinematic", "Cinematic showcase"], ["social_reel", "Social reel"], ["agent_intro", "Agent intro + listing"], ["neighbourhood", "Neighbourhood highlight"]] }),
  q("details", "mls_requirements", "Do you need MLS-compliant and social versions?", "RADIO", { cats: ["REAL_ESTATE"], options: YNS }),
  q("details", "agent_branding", "Agent branding on the video?", "RADIO", { cats: ["REAL_ESTATE"], options: [["have", "Yes, I have branding"], ["need", "Yes, but I need help"], ["none", "No branding"]] }),
  q("details", "property_footage", "What footage do you have?", "SELECT", { cats: ["REAL_ESTATE"], options: [["video_photos", "Video + photos"], ["video", "Video only"], ["photos", "Photos only"], ["none", "Nothing yet"]] }),
  q("details", "drone_footage", "Is there drone footage?", "RADIO", { cats: ["REAL_ESTATE"], options: YN }),
  q("details", "orientation", "Video format", "MULTI_SELECT", { cats: ["REAL_ESTATE", "ADS", "SOCIAL"], options: [["vertical", "Vertical 9:16"], ["horizontal", "Horizontal 16:9"], ["square", "Square 1:1"]] }),
  q("details", "re_brand_assets", "Logo & brand colours available?", "RADIO", { cats: ["REAL_ESTATE"], options: HAVE_NEED }),
  q("details", "re_contact_details", "Contact details to show on screen", "TEXTAREA", { cats: ["REAL_ESTATE"], placeholder: "Name, phone, email, website" }),
  q("details", "re_cta", "Call to action", "TEXT", { cats: ["REAL_ESTATE", "SAAS", "FINANCE", "VSL", "ADS"], placeholder: "e.g. Book a viewing" }),
  // Podcast
  q("details", "podcast_name", "Podcast name", "TEXT", { cats: ["PODCAST"], required: true }),
  q("details", "host_names", "Host name(s)", "TEXT", { cats: ["PODCAST"] }),
  q("details", "guest_names", "Guest name(s) for this episode", "TEXT", { cats: ["PODCAST"] }),
  q("details", "podcast_scope", "What do you need edited?", "MULTI_SELECT", { cats: ["PODCAST"], options: [["full_episode", "Full episode"], ["youtube_version", "YouTube version"], ["shorts", "Shorts / reels"], ["audio_cleanup", "Audio cleanup"], ["audio_only", "Audio-only feed"]] }),
  q("details", "multicam", "Is it multicam?", "RADIO", { cats: ["PODCAST"], options: YN }),
  q("details", "camera_angles", "How many camera angles?", "NUMBER", { cats: ["PODCAST"], meta: { min: 1, max: 12 }, logic: { all: [{ field: "multicam", op: "eq", value: "yes" }] } }),
  q("details", "podcast_branding", "Branding, intro & outro", "SELECT", { cats: ["PODCAST"], options: [["have", "I have an intro/outro"], ["need", "Please create one"], ["none", "Not needed"]] }),
  q("details", "thumbnail_needed", "Do you need thumbnails?", "RADIO", { cats: ["PODCAST", "GAMING", "CREATOR"], options: YN }),
  q("details", "social_clips", "Social clips per episode", "NUMBER", { cats: ["PODCAST"], meta: { min: 0, max: 30 } }),
  q("details", "highlight_moments", "Any highlight moments to feature?", "TEXTAREA", { cats: ["PODCAST"], placeholder: "Timestamps or topics" }),
  // Finance
  q("details", "finance_topic", "Topic of the video", "TEXT", { cats: ["FINANCE"] }),
  q("details", "finance_subject", "Financial subject", "SELECT", { cats: ["FINANCE"], options: [["investing", "Investing"], ["crypto", "Crypto"], ["personal_finance", "Personal finance"], ["real_estate_investing", "Real estate investing"], ["trading", "Trading"], ["business_news", "Markets & business news"]] }),
  q("details", "broll_needs", "B-roll requirements", "MULTI_SELECT", { cats: ["FINANCE"], options: [["stock", "Stock footage"], ["charts", "Charts & graphs"], ["screen", "Screen recordings"], ["news", "News clips"], ["animation", "Animation"]] }),
  q("details", "finance_charts", "Do you need charts built?", "RADIO", { cats: ["FINANCE"], options: YN }),
  q("details", "finance_screenshots", "Will you provide screenshots?", "RADIO", { cats: ["FINANCE"], options: YN }),
  q("details", "news_footage", "Include news footage?", "RADIO", { cats: ["FINANCE"], options: YN }),
  q("details", "finance_brand_style", "Brand style notes", "TEXTAREA", { cats: ["FINANCE", "GAMING"] }),
  q("details", "disclaimer", "Do you need a compliance disclaimer on screen?", "RADIO", { cats: ["FINANCE", "DENTAL"], options: [["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]] }),
  q("details", "disclaimer_text", "Disclaimer wording", "TEXTAREA", { cats: ["FINANCE", "DENTAL"], logic: { all: [{ field: "disclaimer", op: "eq", value: "yes" }] } }),
  // SaaS
  q("details", "product_name", "Product / company name", "TEXT", { cats: ["SAAS"], required: true }),
  q("details", "product_url", "Product URL", "URL", { cats: ["SAAS", "ECOMMERCE"], placeholder: "https://" }),
  q("details", "target_customer", "Who is your target customer?", "TEXT", { cats: ["SAAS"] }),
  q("details", "explainer_style", "Explainer style", "SELECT", { cats: ["SAAS"], options: [["screen_demo", "Screen demo"], ["animated", "Animated explainer"], ["founder", "Founder-led"], ["testimonial", "Customer story"], ["launch", "Launch / announcement"]] }),
  q("details", "screen_recordings", "Screen recordings", "RADIO", { cats: ["SAAS"], options: HAVE_NEED }),
  q("details", "ui_animations", "UI animations needed?", "RADIO", { cats: ["SAAS"], options: YN }),
  q("details", "voiceover", "Voiceover", "SELECT", { cats: ["SAAS", "VSL", "EDUCATION", "MOTION"], options: [["have", "I have a voiceover"], ["ai", "Use a quality AI voice"], ["pro", "Hire a voice artist"], ["none", "No voiceover"]] }),
  q("details", "saas_motion", "Motion graphics needed?", "RADIO", { cats: ["SAAS", "CORPORATE"], options: YN }),
  q("details", "brand_guidelines", "Brand guidelines available?", "RADIO", { cats: ["SAAS", "CORPORATE", "AGENCY", "ECOMMERCE"], options: YN }),
  q("details", "product_screenshots", "Product screenshots?", "RADIO", { cats: ["SAAS"], options: YN }),
  q("details", "demo_footage", "Existing demo footage?", "RADIO", { cats: ["SAAS"], options: YN }),
  // Gaming
  q("details", "game_title", "Game title(s)", "TEXT", { cats: ["GAMING"], required: true }),
  q("details", "gameplay_style", "Gameplay style", "SELECT", { cats: ["GAMING"], options: [["highlights", "Fast-paced highlights"], ["comedy", "Comedy / meme"], ["tutorial", "Tutorial / guide"], ["cinematic", "Cinematic montage"], ["lets_play", "Let's play"]] }),
  q("details", "facecam", "Facecam?", "RADIO", { cats: ["GAMING"], options: YN }),
  q("details", "mic_audio", "Mic / audio quality", "SELECT", { cats: ["GAMING"], options: [["clean", "Clean"], ["needs_cleanup", "Needs cleanup"], ["none", "No commentary"]] }),
  q("details", "gaming_highlights", "What moments matter most?", "MULTI_SELECT", { cats: ["GAMING"], options: [["clutch", "Clutch plays"], ["funny", "Funny moments"], ["wins", "Wins"], ["fails", "Fails"], ["kills", "Kill moments"], ["tips", "Tips"]] }),
  q("details", "memes_sfx", "Memes & sound effects?", "RADIO", { cats: ["GAMING"], options: [["lots", "Yes, lots"], ["some", "A few"], ["none", "None"]] }),
  q("details", "stream_footage", "Stream / VOD footage available?", "RADIO", { cats: ["GAMING"], options: YN }),
  q("details", "vertical_clips", "Vertical clips too?", "RADIO", { cats: ["GAMING"], options: YN }),
  q("details", "music_style", "Music style", "SELECT", { cats: ["GAMING", "FITNESS", "TRAVEL", "WEDDING"], options: [["electronic", "Electronic"], ["hiphop", "Hip-hop"], ["cinematic", "Cinematic"], ["lofi", "Lo-fi"], ["acoustic", "Acoustic"], ["none", "No music / royalty-free"]] }),
  // Corporate / agency / others
  q("details", "corporate_purpose", "What is the video for?", "SELECT", { cats: ["CORPORATE"], options: [["internal", "Internal comms"], ["training", "Training"], ["recruitment", "Recruitment"], ["investor", "Investor / pitch"], ["brand_film", "Brand film"], ["event_recap", "Event recap"]] }),
  q("details", "compliance_review", "Does it need legal / brand review?", "RADIO", { cats: ["CORPORATE", "DENTAL"], options: YN }),
  q("details", "agency_clients", "How many client accounts will you send us?", "NUMBER", { cats: ["AGENCY"], meta: { min: 1, max: 500 } }),
  q("details", "white_label", "White-label delivery?", "RADIO", { cats: ["AGENCY"], options: YN }),
  q("details", "dental_service", "Which treatments?", "MULTI_SELECT", { cats: ["DENTAL"], options: [["implants", "Implants"], ["aligners", "Aligners"], ["whitening", "Whitening"], ["cosmetic", "Cosmetic"], ["general", "General dentistry"], ["kids", "Paediatric"]] }),
  q("details", "patient_consent", "Are patient consent forms in place?", "RADIO", { cats: ["DENTAL"], options: YNS }),
  q("details", "fitness_type", "Type of fitness content", "SELECT", { cats: ["FITNESS"], options: [["gym", "Gym / studio promo"], ["coaching", "Online coaching"], ["transformation", "Transformations"], ["tutorials", "Exercise tutorials"], ["supplements", "Supplements / product"]] }),
  q("details", "exercise_demos", "Exercise demos on camera?", "RADIO", { cats: ["FITNESS"], options: YN }),
  q("details", "product_category", "Product category", "TEXT", { cats: ["ECOMMERCE"] }),
  q("details", "ecom_ad_type", "What do you need?", "MULTI_SELECT", { cats: ["ECOMMERCE", "ADS"], options: [["ugc", "UGC-style ads"], ["demo", "Product demo"], ["unboxing", "Unboxing"], ["ad_creative", "Ad creatives"], ["lifestyle", "Lifestyle shots"]] }),
  q("details", "vsl_length", "Target VSL length", "SELECT", { cats: ["VSL"], options: [["3_5", "3–5 minutes"], ["5_10", "5–10 minutes"], ["10_20", "10–20 minutes"], ["20_plus", "20+ minutes"]] }),
  q("details", "script_status", "Script status", "SELECT", { cats: ["VSL", "SAAS", "EDUCATION", "ADS"], options: [["final", "Final script ready"], ["draft", "Draft — needs polish"], ["help", "Need help writing it"]] }),
  q("details", "vsl_style", "VSL style", "SELECT", { cats: ["VSL"], options: [["text", "Text-on-screen"], ["stock_vo", "Stock + voiceover"], ["talking_head", "Talking head"], ["hybrid", "Hybrid"]] }),
  q("details", "event_date", "Event date", "DATE", { cats: ["WEDDING"] }),
  q("details", "event_deliverables", "What do you need?", "MULTI_SELECT", { cats: ["WEDDING"], options: [["highlight", "Highlight film"], ["full", "Full film"], ["teaser", "Teaser"], ["speeches", "Speeches"], ["social", "Social clips"]] }),
  q("details", "course_topic", "Course / lesson topic", "TEXT", { cats: ["EDUCATION"] }),
  q("details", "lesson_count", "How many lessons?", "NUMBER", { cats: ["EDUCATION"], meta: { min: 1, max: 500 } }),
  q("details", "destinations", "Destination(s)", "TEXT", { cats: ["TRAVEL"] }),
  q("details", "travel_drone", "Drone footage?", "RADIO", { cats: ["TRAVEL", "AUTOMOTIVE"], options: YN }),
  q("details", "venue_type", "What kind of food business?", "SELECT", { cats: ["FOOD"], options: [["restaurant", "Restaurant"], ["cafe", "Café"], ["brand", "Food brand"], ["recipe", "Recipe creator"]] }),
  q("details", "vehicle_focus", "What are we showcasing?", "SELECT", { cats: ["AUTOMOTIVE"], options: [["dealership", "Dealership inventory"], ["detailing", "Detailing / wrap"], ["review", "Car review"], ["motorsport", "Motorsport"]] }),
  q("details", "coaching_offer", "What do you sell?", "TEXT", { cats: ["COACHING"], placeholder: "Program / service in one line" }),
  q("details", "coaching_content", "Content you need", "MULTI_SELECT", { cats: ["COACHING"], options: [["testimonials", "Client testimonials"], ["webinar", "Webinar edits"], ["course", "Course promos"], ["clips", "Social clips"]] }),
  q("details", "social_accounts", "How many accounts do you manage?", "NUMBER", { cats: ["SOCIAL"], meta: { min: 1, max: 200 } }),
  q("details", "motion_type", "What motion work do you need?", "MULTI_SELECT", { cats: ["MOTION"], options: [["logo", "Logo animation"], ["explainer", "Explainer"], ["lower_thirds", "Lower thirds"], ["kinetic", "Kinetic typography"], ["ads", "Animated ads"]] }),
  q("details", "ad_platforms", "Ad platforms", "MULTI_SELECT", { cats: ["ADS"], options: [["meta", "Meta"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["google", "Google"], ["linkedin", "LinkedIn"]] }),
  q("details", "ad_variants", "Variations per concept", "NUMBER", { cats: ["ADS"], meta: { min: 1, max: 30 } }),

  // 4 — workflow
  q("workflow", "video_frequency", "How often do you need videos?", "SELECT", { options: [["one_time", "Just this once"], ["occasionally", "Occasionally"], ["monthly", "About monthly"], ["few_per_month", "A few per month"], ["weekly", "Weekly"], ["ongoing", "Ongoing / daily"]] }),
  q("workflow", "videos_per_month", "How many videos per month?", "NUMBER", { meta: { min: 1, max: 1000 }, placeholder: "e.g. 8", logic: { all: [{ field: "video_frequency", op: "nin", value: ["one_time"] }] } }),
  q("workflow", "avg_length", "Average video length", "SELECT", { options: [["under_1", "Under 1 minute"], ["1_3", "1–3 minutes"], ["3_10", "3–10 minutes"], ["10_20", "10–20 minutes"], ["20_plus", "20+ minutes"]] }),
  q("workflow", "turnaround", "Expected turnaround", "SELECT", { options: [["rush", "Rush — within 48 hours"], ["standard", "Standard — 3–5 days"], ["flexible", "Flexible — 1–2 weeks"]] }),
  q("workflow", "scripts_by", "Who provides scripts?", "SELECT", { options: [["client", "I do"], ["studio", "The studio"], ["none", "No script needed"]] }),
  q("workflow", "voiceover_by", "Who provides voiceover?", "SELECT", { options: [["client", "I do"], ["studio", "The studio arranges it"], ["none", "No voiceover"]] }),
  q("workflow", "footage_by", "Who provides footage?", "SELECT", { options: [["client", "I do"], ["studio", "Studio sources stock"], ["mixed", "A mix"]] }),
  q("workflow", "graphics_by", "Who provides graphics?", "SELECT", { options: [["client", "I do"], ["studio", "The studio designs them"], ["mixed", "A mix"], ["none", "None needed"]] }),

  // 5 — budget
  q("budget", "budget", "What's your budget for this project?", "RADIO", { required: true, meta: { leadField: "budgetRange", display: "cards" }, options: BUDGET_RANGES.map((b) => [b.value, b.label] as Opt) }),

  // 6 — style
  q("style", "style", "Which styles feel right?", "MULTI_SELECT", {
    meta: { leadField: "stylePrefs" },
    options: [["minimal", "Minimal"], ["cinematic", "Cinematic"], ["fast_paced", "Fast-paced"], ["corporate", "Corporate"], ["luxury", "Luxury"], ["podcast", "Podcast"], ["social_media", "Social media"], ["educational", "Educational"], ["documentary", "Documentary"], ["high_energy", "High-energy"], ["clean", "Clean"], ["custom", "Custom"]],
  }),

  // 7 — contact
  q("contact", "name", "Your name", "TEXT", { required: true, meta: { leadField: "name" }, placeholder: "Full name" }),
  q("contact", "email", "Email", "EMAIL", { required: true, meta: { leadField: "email" }, placeholder: "you@company.com" }),
  q("contact", "phone", "Phone / WhatsApp", "PHONE", { meta: { leadField: "phone" }, placeholder: "+1 555 000 0000" }),
  q("contact", "company", "Company or channel name", "TEXT", { meta: { leadField: "company" } }),
  q("contact", "website", "Website", "URL", { meta: { leadField: "website" }, placeholder: "https://" }),
  q("contact", "instagram", "Instagram", "TEXT", { meta: { leadField: "instagram" }, placeholder: "@handle or URL" }),
  q("contact", "youtube", "YouTube", "URL", { meta: { leadField: "youtube" }, placeholder: "https://youtube.com/@…" }),
  q("contact", "linkedin", "LinkedIn", "URL", { meta: { leadField: "linkedin" }, placeholder: "https://linkedin.com/in/…" }),

  // 8 — description
  q("description", "project_description", "Tell us about your project, goals, audience, references, and anything else we should know.", "TEXTAREA", { required: true, meta: { leadField: "description", minLength: 20, maxLength: 6000 }, placeholder: "What are you making, who is it for, what should viewers feel or do, and which videos do you love?" }),

  // 9 — uploads
  q("uploads", "references", "Reference files", "FILE", { help: "PDF, DOCX, images, ZIP, video or audio · up to 10 files", meta: { accept: "pdf,docx,image,zip,video,audio" } }),
];

// ───────────────────────────── PROJECT ONBOARDING (after payment) ─────────────────────────────

export const PROJECT_SECTIONS: { key: string; title: string; description?: string }[] = [
  { key: "basics", title: "The basics", description: "The essentials your editor needs on day one." },
  { key: "brand", title: "Brand & look", description: "We'll reuse your saved brand kit — just confirm or override it for this project." },
  { key: "creative", title: "Creative direction", description: "Show us what good looks like." },
  { key: "materials", title: "Scripts, footage & graphics", description: "What you're providing and what you'd like us to create." },
  { key: "schedule", title: "Schedule", description: "When you need it and when it goes live." },
  { key: "specialized", title: "Specific to your project", description: "A few questions tailored to your type of video." },
];

const b = (briefSection: string, extra: Record<string, unknown> = {}) => ({ briefSection, ...extra });

export const PROJECT_QUESTIONS: QSeed[] = [
  q("basics", "project_name", "Project name", "TEXT", { required: true, meta: b("project") }),
  q("basics", "project_goal", "What is the goal of this video?", "TEXTAREA", { required: true, meta: b("project"), placeholder: "What should viewers think, feel or do afterwards?" }),
  q("basics", "target_audience", "Target audience", "TEXT", { required: true, meta: b("project") }),
  q("basics", "platforms", "Target platforms", "MULTI_SELECT", { required: true, meta: b("technical"), options: [["youtube", "YouTube"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["linkedin", "LinkedIn"], ["facebook", "Facebook"], ["x", "X / Twitter"], ["website", "Website"], ["paid_ads", "Paid ads"], ["other", "Other"]] }),
  q("basics", "video_duration", "Target video duration", "SELECT", { required: true, meta: b("technical"), options: [["under_30s", "Under 30 seconds"], ["30_60s", "30–60 seconds"], ["1_3m", "1–3 minutes"], ["3_10m", "3–10 minutes"], ["10_20m", "10–20 minutes"], ["20m_plus", "20+ minutes"]] }),
  q("basics", "aspect_ratio", "Aspect ratio(s)", "MULTI_SELECT", { required: true, meta: b("technical"), options: [["16_9", "16:9 (landscape)"], ["9_16", "9:16 (vertical)"], ["1_1", "1:1 (square)"], ["4_5", "4:5 (feed)"]] }),
  q("basics", "resolution", "Delivery resolution", "SELECT", { meta: b("technical"), options: [["1080p", "1080p Full HD"], ["4k", "4K UHD"], ["720p", "720p"]] }),

  q("brand", "brand_guidelines_link", "Link to brand guidelines (optional)", "URL", { meta: b("brand"), placeholder: "https://…" }),
  q("brand", "fonts", "Fonts", "TEXT", { meta: b("brand"), placeholder: "e.g. Inter Bold for titles" }),
  q("brand", "brand_color_primary", "Primary brand colour", "COLOR", { meta: b("brand") }),
  q("brand", "brand_color_secondary", "Secondary brand colour", "COLOR", { meta: b("brand") }),
  q("brand", "logo_status", "Logo", "SELECT", { meta: b("brand"), options: [["in_brand_kit", "It's in my brand kit"], ["will_upload", "I'll upload it to this project"], ["need_design", "I need one designed"]] }),

  q("creative", "reference_links", "Reference videos you like (links)", "TEXTAREA", { meta: b("references"), placeholder: "One link per line" }),
  q("creative", "examples", "What do you like about them?", "TEXTAREA", { meta: b("references") }),
  q("creative", "competitors", "Competitors or similar creators", "TEXTAREA", { meta: b("references") }),
  q("creative", "creative_direction", "Creative direction", "TEXTAREA", { required: true, meta: b("creative"), placeholder: "Pacing, feel, transitions, what to avoid…" }),
  q("creative", "tone", "Tone", "MULTI_SELECT", { meta: b("creative"), options: [["friendly", "Friendly"], ["authoritative", "Authoritative"], ["playful", "Playful"], ["serious", "Serious"], ["inspirational", "Inspirational"], ["luxurious", "Luxurious"]] }),
  q("creative", "music_preference", "Music preference", "TEXT", { meta: b("creative"), placeholder: "Genre, mood, or a reference track" }),
  q("creative", "voiceover", "Voiceover", "SELECT", { meta: b("creative"), options: [["none", "No voiceover"], ["client", "I'm providing it"], ["studio", "Studio arranges it"]] }),
  q("creative", "cta", "Call to action", "TEXT", { meta: b("creative"), placeholder: "What should viewers do next?" }),

  q("materials", "script_status", "Script", "SELECT", { meta: b("project"), options: [["uploaded", "Final script uploaded"], ["talking_points", "Talking points only"], ["studio", "Studio drafts it"], ["none", "No script"]] }),
  q("materials", "footage_status", "Footage", "SELECT", { required: true, meta: b("project"), options: [["all_ready", "All footage is ready to upload"], ["partial", "Some footage still coming"], ["none", "Studio should source stock"]] }),
  q("materials", "required_graphics", "Graphics needed", "TEXTAREA", { meta: b("project"), placeholder: "Lower thirds, charts, titles, logo animation…" }),
  q("materials", "special_instructions", "Anything else we should know?", "TEXTAREA", { meta: b("special") }),

  q("schedule", "deadline_date", "Deadline", "DATE", { meta: b("deadline") }),
  q("schedule", "publishing_date", "Publishing date", "DATE", { meta: b("deadline") }),

  // specialised by project type
  q("specialized", "episode_length", "Episode length", "SELECT", { cats: ["PODCAST"], meta: b("technical"), options: [["under_30", "Under 30 min"], ["30_60", "30–60 min"], ["60_90", "60–90 min"], ["90_plus", "90+ min"]] }),
  q("specialized", "audio_issues", "Known audio issues", "MULTI_SELECT", { cats: ["PODCAST"], meta: b("special"), options: [["noise", "Background noise"], ["echo", "Echo / room"], ["levels", "Uneven levels"], ["crosstalk", "Crosstalk"], ["none", "None"]] }),
  q("specialized", "chapters", "Chapters & show notes?", "RADIO", { cats: ["PODCAST"], meta: b("deliverables"), options: YN }),
  q("specialized", "property_address", "Property address", "TEXT", { cats: ["REAL_ESTATE"], meta: b("project") }),
  q("specialized", "key_features", "Key features to highlight", "TEXTAREA", { cats: ["REAL_ESTATE", "SAAS"], meta: b("creative") }),
  q("specialized", "agent_details", "Agent name, phone & brokerage", "TEXTAREA", { cats: ["REAL_ESTATE"], meta: b("brand") }),
  q("specialized", "show_price", "Show the listing price on screen?", "RADIO", { cats: ["REAL_ESTATE"], meta: b("creative"), options: YN }),
  q("specialized", "demo_flow", "Product flow to show (step by step)", "TEXTAREA", { cats: ["SAAS"], meta: b("creative") }),
  q("specialized", "competitor_urls", "Competitor products (URLs)", "TEXTAREA", { cats: ["SAAS"], meta: b("references") }),
  q("specialized", "data_points", "Key data points / claims to include", "TEXTAREA", { cats: ["FINANCE"], meta: b("creative") }),
  q("specialized", "final_disclaimer", "Final disclaimer text", "TEXTAREA", { cats: ["FINANCE", "DENTAL"], meta: b("special") }),
  q("specialized", "channel_catchphrases", "Catchphrases, running jokes & SFX you love", "TEXTAREA", { cats: ["GAMING"], meta: b("creative") }),
  q("specialized", "hook_examples", "Hooks you've used that worked", "TEXTAREA", { cats: ["SHORT_FORM"], meta: b("creative") }),
  q("specialized", "posting_cadence", "Posting cadence", "TEXT", { cats: ["SHORT_FORM", "SOCIAL"], meta: b("deadline") }),
  q("specialized", "approval_chain", "Who approves the final video?", "TEXT", { cats: ["CORPORATE"], meta: b("special") }),
  q("specialized", "offer_details", "The offer (price, bonuses, guarantee)", "TEXTAREA", { cats: ["VSL"], meta: b("creative") }),
  q("specialized", "proof_elements", "Proof to feature (results, testimonials)", "TEXTAREA", { cats: ["VSL", "COACHING"], meta: b("creative") }),
  q("specialized", "cta_url", "Where should the CTA point?", "URL", { cats: ["VSL", "ADS"], meta: b("creative") }),
  q("specialized", "event_details", "Event schedule & key moments", "TEXTAREA", { cats: ["WEDDING"], meta: b("creative") }),
];
