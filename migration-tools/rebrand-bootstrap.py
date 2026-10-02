#!/usr/bin/env python3
"""Applies the Faizan Ali personal-brand voice (website branding specification v1, 2 Oct 2026) to the DATA that ships with the site:

  public_html/app/data/site-defaults.json   the default settings (hero, navigation, footer, process, about, contact, legal, SEO…)
  public_html/database.sql                   workspace name, the three services, FAQs, help articles, e-mail templates, a few form labels
  public_html/database-demo.sql              the sample studio: business name and the services it points at

It is idempotent (running it twice changes nothing more) and was written once to re-voice the data that the old PostgreSQL seed produced.
Developer tool only — the hosting account never runs it.        python3 migration-tools/rebrand-bootstrap.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "public_html"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sqlrows as S  # noqa: E402

NAME = "Faizan Ali"
DESCRIPTOR = "Video Editor and Content Creator"
LINE = "Video editing that brings your message into focus."
INTRO = "I'm Faizan Ali, a video editor helping creators and businesses turn raw footage into engaging content."

# ───────────────────────────── default settings ─────────────────────────────
p = ROOT / "app/data/site-defaults.json"
d = json.loads(p.read_text(encoding="utf8"))
sd = d["SETTING_DEFAULTS"]

sd["business"].update({
    "name": NAME, "legalName": NAME, "descriptor": DESCRIPTOR, "tagline": LINE, "handle": "faizaneditspro", "portraitUrl": "/assets/img/faizan-ali.jpg",
    "email": "", "website": "",
})
# keep the key order readable: name, legalName, descriptor, tagline, handle, portraitUrl first
order = ["name", "legalName", "descriptor", "tagline", "handle", "portraitUrl"]
sd["business"] = {**{k: sd["business"][k] for k in order}, **{k: v for k, v in sd["business"].items() if k not in order}}
sd["theme"] = {"accent": "#2457E6", "accentContrast": "#FFFFFF"}
sd["hero"].update({
    "eyebrow": DESCRIPTOR,
    "headline": LINE,
    "subheadline": INTRO,
    "primaryCta": {"label": "Discuss your project", "href": "/start-project"},
    "secondaryCta": {"label": "View my work", "href": "/work"},
    "trustPoints": ["A fixed-scope quote before I start", "Timestamped feedback on every version", "A clear delivery date"],
    "floatingCards": [],
})
sd["nav"] = {
    "links": [
        {"label": "Services", "href": "/services"}, {"label": "Work", "href": "/work"}, {"label": "Case studies", "href": "/case-studies"},
        {"label": "Process", "href": "/process"}, {"label": "Pricing", "href": "/pricing"}, {"label": "About", "href": "/about"}, {"label": "Contact", "href": "/contact"},
    ],
    "loginLabel": "Log in", "ctaLabel": "Discuss your project",
}
sd["footer"] = {
    "description": "Video editing for creators, consultants and service businesses: short-form, long-form and podcast editing, and motion graphics.",
    "columns": [
        {"title": "Services", "links": [
            {"label": "Short-form editing", "href": "/services/short-form-video-editing"},
            {"label": "Long-form and podcast editing", "href": "/services/long-form-podcast-editing"},
            {"label": "Motion graphics", "href": "/services/motion-graphics"},
            {"label": "All services", "href": "/services"}]},
        {"title": "Explore", "links": [
            {"label": "View my work", "href": "/work"}, {"label": "Case studies", "href": "/case-studies"}, {"label": "Process", "href": "/process"},
            {"label": "Pricing", "href": "/pricing"}, {"label": "About", "href": "/about"}]},
        {"title": "Help", "links": [
            {"label": "Discuss your project", "href": "/start-project"}, {"label": "Book a call", "href": "/book"}, {"label": "Contact", "href": "/contact"},
            {"label": "FAQ", "href": "/faq"}, {"label": "Help center", "href": "/help"}, {"label": "Blog", "href": "/blog"}]},
    ],
    "newsletter": True,
}
sd["process"] = {
    "heading": "Brief, footage, editing, feedback, delivery",
    "intro": "Five clear steps from first message to final files. At every stage you know what has happened, what happens next and what I need from you.",
    "steps": [
        {"title": "Brief", "summary": "Tell me what you're making.",
         "detail": "Start with a short guided form about your project, audience and goals. The questions adapt to your type of content, so you only answer what matters. I read every request and reply within one business day, then send a fixed-scope quote with the deliverables, turnaround and revision rounds. You accept it, sign the agreement and pay the invoice in your client portal.",
         "youDo": "Answer the guided questions (about 3 minutes), then review and accept the quote.", "weDo": "I review your answers, suggest a call if it would help, and send a clear quote."},
        {"title": "Footage", "summary": "Send everything in one place.",
         "detail": "Upload footage, logos, scripts, references and music straight to your project. Your brand kit is saved, so repeat projects start faster. Once the brief is complete and your files are in, the schedule starts.",
         "youDo": "Upload your footage and assets and finish the project brief.", "weDo": "I check that everything arrived, set up your project folders and confirm the schedule."},
        {"title": "Editing", "summary": "I cut the story.",
         "detail": "I edit for story, pacing, captions and sound, then prepare the first draft. You can follow the status, milestones and expected draft date at any time, and message me inside the project.",
         "youDo": "Answer any quick questions I have.", "weDo": "I edit, add captions and sound, and prepare the first draft."},
        {"title": "Feedback", "summary": "Comment on the exact frame.",
         "detail": "Watch the draft in the review player and click the timeline to leave timestamped feedback. Send your notes as one revision round. Every version is kept, so you can compare V1, V2 and beyond.",
         "youDo": "Leave feedback, then send it as a revision, or approve.", "weDo": "I reply to each note, mark it resolved and upload the next version."},
        {"title": "Delivery", "summary": "Approve and download.",
         "detail": "Approve the version you're happy with. Your final files (the master, social cuts, captions and source files where included) appear on a delivery page, ready to download.",
         "youDo": "Approve the final version and download your final files.", "weDo": "I prepare the deliverables and keep your project organised for next time."},
    ],
}
sd["about"] = {
    "headline": "I turn raw footage into content people finish watching.",
    "story": "I'm Faizan Ali, a video editor and content creator. I work with creators, consultants and service businesses to turn raw footage into clear, engaging videos.\n\nEvery project follows the same visible path (brief, footage, editing, feedback, delivery), so you always know what is happening and what I need from you.",
    "values": [
        {"title": "Clear communication", "body": "One place for briefs, files, feedback and invoices."},
        {"title": "Craft over templates", "body": "Edits shaped around your audience, not a preset."},
        {"title": "Honest scope", "body": "Fixed quotes, defined revisions, no surprise bills."},
        {"title": "Respect for your time", "body": "Fast replies, predictable turnarounds, easy approvals."},
    ],
    "team": [],
}
sd["contactInfo"] = {
    "heading": "Discuss your project",
    "intro": "Tell me a little about what you're making. Prefer to talk first? Book a call. I reply within one business day.",
    "responseTime": "Within 1 business day",
}
sd["legal"]["terms"] = (
    "These Terms of Service are a starting template. Replace this text with terms reviewed by a qualified professional before going live.\n\n"
    "1. Services. I provide video editing services as described in each accepted quote and agreement.\n"
    "2. Payment. Fees are due according to the invoice schedule in the agreement.\n"
    "3. Revisions. Included revision rounds are stated in the agreement; extra work is quoted separately.\n"
    "4. Ownership. Final deliverables are licensed to the client on full payment.\n"
    "5. Confidentiality. Client materials are kept confidential and used only for the project."
)
sd["legal"]["privacy"] = (
    "This Privacy Policy is a starting template. Replace it with a policy reviewed by a qualified professional before going live.\n\n"
    "I collect the information you submit (name, email, project details, files) to respond to your request, deliver the work and manage your account. I do not sell personal information. "
    "Files are stored in access-controlled storage and are only available to you and to anyone I assign to your project."
)
sd["seo"].update({
    "titleTemplate": "%s | " + NAME,
    "defaultDescription": "I'm Faizan Ali, a video editor helping creators and businesses turn raw footage into engaging content. Short-form, long-form and podcast editing, and motion graphics.",
})
sd["booking"]["types"]["DISCOVERY_CALL"]["description"] = "Tell me about your project and see if we're a good fit."
for k in ("CONTRACT_TEMPLATE",):
    for sec in d[k]:
        sec["body"] = (sec["body"].replace("(the “Studio”)", "(the “Editor”)").replace("the Studio's", "the Editor's").replace("The Studio's", "The Editor's")
                       .replace("the Studio", "the Editor").replace("The Studio", "The Editor").replace("Studio's", "Editor's"))
d["SERVICE_TO_LOOKING_FOR"].update({"long-form-podcast-editing": "long_form"})
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf8")

# ───────────────────────────── database.sql ─────────────────────────────
f = ROOT / "database.sql"
t = f.read_text(encoding="utf8")
t = t.replace("-- FaizanEdits Pro — database structure", "-- Faizan Ali website — database structure").replace("-- FaizanEdits Pro — MySQL / MariaDB schema", "-- Faizan Ali website — MySQL / MariaDB schema")


def workspace(rows):
    for r in rows:
        r["name"] = NAME
    return rows


t = S.edit_table(t, "workspaces", workspace)

SERVICES = {
    "short-form-video-editing": dict(
        slug="short-form-video-editing", title="Short-form editing",
        shortDescription="Reels, Shorts and TikToks cut for pace, clarity and a strong first second.",
        description="Short-form lives or dies in the first two seconds. I edit for retention: a clear hook, tight pacing, readable captions, and sound and motion that support your message instead of distracting from it. Send me long recordings or raw clips and I return batches that are ready to post.",
        icon="smartphone", useCase="Creators, consultants and businesses publishing several vertical videos each week.",
        deliverables=["Vertical 9:16 exports", "Captions in your style", "Sound and music mix", "Hook and pacing edit", "Cover frames on request"],
        included=["9:16 export (plus 1:1 and 4:5 on request)", "Captions in your brand style", "Callouts and light motion graphics", "Sound mix and licensed music", "B-roll and transitions", "Colour correction", "Two included revision rounds"],
        whoFor=["Creators repurposing long videos into clips", "Consultants and coaches building authority", "Businesses running organic short-form", "Agencies that need a reliable vertical-video partner"],
        exampleDeliverables=["Reels cut from one interview", "A weekly Shorts batch from your podcast", "A product teaser series", "Client testimonial clips"],
        platforms=["TikTok", "Instagram Reels", "YouTube Shorts", "LinkedIn", "Vertical ads"],
        editingStyle="Fast, clear and readable on mute. I match your voice, from clean and minimal to high-energy with moving type.",
        addOns=["Cover frames", "Extra formats (1:1, 4:5)", "Rush delivery"],
        turnaround="Confirmed in your quote", priceLabel="Custom quote", published=1, featured=1, sortOrder=0),
    "long-form-podcast-editing": dict(
        slug="long-form-podcast-editing", title="Long-form and podcast editing",
        shortDescription="YouTube videos, interviews and podcast episodes edited for story, pacing and clean sound.",
        description="Long videos need structure. I shape your footage into a clear story: a strong opening, tight pacing, clean audio and graphics that help people follow along. For podcasts I sync and switch multi-camera recordings, level the sound and prepare the full episode and short clips for promotion.",
        icon="film", useCase="YouTube channels, podcasts, interviews, webinars and talks.",
        deliverables=["Full episode or video (16:9)", "Cleaned and levelled audio", "Titles, lower thirds and captions", "Chapters and thumbnails on request", "Short clips for promotion"],
        included=["Story and pacing edit", "Multi-camera sync and switching", "Audio cleanup and levelling", "Titles, lower thirds and captions", "Colour correction", "Licensed music where needed", "Two included revision rounds"],
        whoFor=["YouTube creators with a regular schedule", "Podcasters who record video", "Consultants publishing interviews and talks", "Teams with webinars to repurpose"],
        exampleDeliverables=["A weekly YouTube episode", "A full podcast episode plus three clips", "An interview with chapters", "A webinar cut down to the useful parts"],
        platforms=["YouTube", "Spotify video", "Apple Podcasts video", "LinkedIn", "Your website"],
        editingStyle="Clear and unhurried where it should be, tighter where attention drops. The edit serves the conversation.",
        addOns=["Thumbnails", "Chapters and descriptions", "Short clips from the episode", "Rush delivery"],
        turnaround="Confirmed in your quote", priceLabel="Custom quote", published=1, featured=1, sortOrder=10),
    "motion-graphics": dict(
        slug="motion-graphics", title="Motion graphics",
        shortDescription="Logo animations, lower thirds, animated captions and simple explainers that support the edit.",
        description="Motion should make a video easier to understand, not busier. I design and animate graphics that fit your brand: titles, lower thirds, kinetic type, logo stings and simple explainer sequences that sit naturally inside your edit.",
        icon="sparkles", useCase="Brands and creators who want a consistent, polished look across their videos.",
        deliverables=["Logo animation", "Lower thirds and titles", "Animated captions", "Simple explainer sequences", "Reusable templates on request"],
        included=["Graphics matched to your brand colours and fonts", "Animation at your delivery resolution", "Transparent versions where needed", "Two included revision rounds"],
        whoFor=["Creators who want a consistent visual identity", "Businesses with brand guidelines to follow", "Anyone with a video that needs clearer graphics"],
        exampleDeliverables=["A logo sting for your intro", "A lower-third pack", "Animated captions in your style", "A 30-second explainer sequence"],
        platforms=["YouTube", "Instagram", "TikTok", "LinkedIn", "Websites"],
        editingStyle="Simple, readable and on brand. Motion with a reason.",
        addOns=["Editable project files", "Extra sizes and formats", "Rush delivery"],
        turnaround="Confirmed in your quote", priceLabel="Custom quote", published=1, featured=1, sortOrder=20),
}
WORKFLOW = ["Send your footage and brief through your client portal", "I confirm scope and timeline in a fixed-price quote", "I send a first draft for timestamped feedback", "You leave feedback directly on the timeline", "You approve the final version and download your final files"]


ALIASES = {"youtube-video-editing": "long-form-podcast-editing"}   # the old slug of the long-form service


def services(rows):
    for r in rows:
        key = ALIASES.get(r["slug"], r["slug"])
        if key in SERVICES:
            new = SERVICES[key]
            for k, v in new.items():
                r[k] = json.dumps(v, ensure_ascii=False, separators=(",", ":")) if isinstance(v, list) else v
            r["workflow"] = json.dumps(WORKFLOW, ensure_ascii=False, separators=(",", ":"))
            r["revisionPolicy"] = None
        else:
            r["published"] = 0
            r["featured"] = 0
    return rows


t = S.edit_table(t, "services", services)

FAQS = {
    "How is pricing calculated?": ("Every project gets a fixed-scope quote based on what you need: the number and length of videos, complexity, deliverables and turnaround. You can also choose per-video or per-short pricing, or a monthly retainer for ongoing work. You see the full itemised price before anything starts."),
    "Do you offer monthly plans?": ("Yes. A retainer includes a set number of videos or shorts each month at a predictable price, with priority scheduling and usage tracking in your portal. Ask about a retainer when you discuss your project or book a call."),
    "Is there a deposit?": ("Projects usually start with a deposit (shown in your quote), and I invoice the balance when you approve the final version. Your quote states the exact split."),
    "How long does editing take?": ("Turnaround depends on the service and the length of the video, and I confirm it in your quote. The clock starts when your project brief is complete and your files are uploaded. Rush delivery may be available for an additional fee."),
    "What happens if I'm late sending files or feedback?": ("The timeline moves with you. I always show the expected draft date in your project, and I will remind you if I'm waiting on something."),
    "How many revisions are included?": ("Your quote and agreement state the included revision rounds. Two is my standard. A round is one consolidated set of notes on a draft: you leave timestamped comments on the video and send them as a single revision request."),
    "What if I want changes after approving?": ("Approval confirms the version meets the agreed requirements. After that, further changes are treated as a new request or a change order, which I quote separately."),
    "What counts as a scope change?": ("Changing the agreed deliverables, adding new footage or formats, or changing direction after production has started. Send a change request from your project and I will tell you whether it is included, or quote the extra cost."),
    "How do I send my footage?": ("Upload directly from your project's Files tab. Drag and drop with a progress bar into folders such as Raw Footage, Audio, Brand Assets and Music. Large files go straight to secure storage."),
    "What files should I send?": ("Raw footage or recordings, clean audio if it was recorded separately, your logo (PNG or SVG), brand colours and fonts, scripts or talking points, reference videos, and any music you want used. Your project setup form tells you exactly what I need for your type of video."),
    "Is my footage private?": ("Yes. Files are stored privately and served through short-lived signed links. Only you, your team members and anyone I assign to your project can open them."),
    "How long do you keep my files?": ("I keep your project files so repeat projects are quick. You can ask me to delete any project's files at any time."),
    "How does payment work?": ("After you accept a quote and sign the agreement, you receive an invoice in your portal. Payment starts your project. Any remaining balance is invoiced when you approve the final version."),
    "Which currencies and payment methods do you support?": ("Quotes and invoices can be issued in several currencies, always with the currency stated next to every amount. The payment methods available are shown at checkout."),
    "Can you match my existing style?": ("Yes. Save your brand kit (logos, colours, fonts and music preferences) and share reference videos, and I will keep your style consistent from project to project."),
    "Who edits my videos?": ("I do. You can message me directly inside your project. If I bring in another editor for a larger project, I will tell you in advance."),
    "Do you provide the project files?": ("Final videos, captions and the formats you asked for are always delivered. Editable source files can be included if I agree it in your quote."),
    "How do retainer allowances work?": ("A retainer includes a set number of videos, shorts or hours each month. Your dashboard shows what you've used, what's left, upcoming projects and your renewal date."),
    "Can I pause or cancel a retainer?": ("Yes. Retainers can be paused or cancelled according to your agreement. Message me from your portal and I will take care of it."),
    "Do I need to sign a contract?": ("Yes. Each project has a short agreement covering scope, deliverables, turnaround, payment terms, revision limits, usage rights, confidentiality and cancellation. You can read, download and e-sign it from your portal."),
    "Who owns the final videos?": ("You do. On full payment you receive a licence to use the final deliverables for your business, as described in your agreement."),
    "Can you edit podcasts with multiple cameras?": ("Yes. I sync and switch multi-camera footage, clean up the audio and produce the full episode, a YouTube version and short clips."),
    "What formats do you deliver short-form in?": ("9:16 vertical by default, plus 1:1 and 4:5 on request, with captions burned in or delivered as a caption file."),
    "Can you make MLS-compliant listing videos?": ("Real estate can be a portfolio category. If you need an MLS-compliant listing video, tell me your MLS requirements before we start and I will confirm whether I can meet them."),
}


def faqs(rows):
    for r in rows:
        r["answer"] = FAQS[r["question"]]
    return rows


t = S.edit_table(t, "faqs", faqs)

KB = {
    "How do I upload footage?": "Open your project and choose the **Files** tab. Drag files into the upload area (or click to browse). Pick the right folder (Raw Footage, Audio, Brand Assets or Music) so I can find everything quickly. Large files upload in pieces, so a dropped connection resumes where it stopped.",
    "How many revisions are included?": "The number of included revision rounds is stated in your quote, your agreement and your project header. Two is my standard. A *round* is one consolidated set of notes on a draft. Leave timestamped feedback on the video, then send it as a single revision request. Every version is kept.",
    "How long does editing take?": "Your project header shows the expected draft date. Turnaround starts once your project brief is complete and your files are uploaded. If anything is missing I will tell you what I need, and the date moves only by the time it took to arrive.",
    "What happens after I approve?": "Approving locks that version as final. If there is a remaining balance I will invoice it, and once the payment conditions are met your final files appear on the **Delivery** tab. Use **Download final files** to save them.",
    "What files should I send?": "Send raw footage, separate audio if you have it, your logo (PNG or SVG), brand colours and fonts, a script or talking points, references you like, and any music you want used. The project setup form lists exactly what I need for your type of video.",
    "How does payment work?": "1. Accept your quote.\n2. Sign the agreement.\n3. Pay the invoice. Your project starts straight away.\n4. Approve the final version and pay any remaining balance to unlock your final files.",
}


def kb(rows):
    for r in rows:
        if r["title"] in KB:
            r["content"] = KB[r["title"]]
    return rows


t = S.edit_table(t, "kb_articles", kb)

BTN = "[[%s|{{%s}}]]"
TEMPLATES = {
    "approval_required": ("Final approval needed — {{project_name}}", "Hi {{client_name}},\n\nThe final cut of {{project_name}} is ready. When you're happy with it, approve it and your final files will be released.\n\n" + BTN % ("Review and approve", "review_url") + "\n\n— Faizan"),
    "contact_received": ("Thanks for getting in touch", "Hi {{client_name}},\n\nThanks for your message. I'll get back to you within one business day.\n\n— Faizan"),
    "contract_sent": ("Your agreement for {{project_name}} is ready to sign", "Hi {{client_name}},\n\nYour agreement for {{project_name}} is ready. Please read it and sign so I can reserve your slot.\n\n" + BTN % ("Review and sign", "contract_url")),
    "contract_signed": ("Agreement signed — next step: payment", "Hi {{client_name}},\n\nThank you for signing the agreement for {{project_name}}. Your invoice is ready, and payment starts your project.\n\n" + BTN % ("View invoice", "invoice_url")),
    "deliverables_ready": ("Your final files are ready — {{project_name}}", "Hi {{client_name}},\n\nYour final files for {{project_name}} are ready.\n\n" + BTN % ("Download final files", "project_url")),
    "draft_ready": ("Your {{version_label}} of {{project_name}} is ready to review", "Hi {{client_name}},\n\n{{version_label}} of {{project_name}} is ready. Watch it, leave timestamped feedback on the timeline, then approve it or send your revision.\n\n" + BTN % ("Leave feedback", "review_url")),
    "file_request": ("Action required: {{detail}}", "Hi {{client_name}},\n\nTo keep {{project_name}} on schedule I need: {{detail}}.\n\n" + BTN % ("Upload it now", "project_url")),
    "invite": ("You're invited to {{business_name}}", "Hi {{client_name}},\n\nI've invited you to my client portal. Set your password to see your projects, files and invoices.\n\n" + BTN % ("Accept invite", "invite_url") + "\n\nThis invite is valid for 7 days."),
    "invoice_overdue": ("Invoice {{invoice_number}} is overdue", "Hi {{client_name}},\n\nInvoice {{invoice_number}} ({{amount}}) is now overdue. Please settle it when you can so I can keep your projects moving.\n\n" + BTN % ("View and pay invoice", "invoice_url") + "\n\nIf something is wrong, just reply and I'll help."),
    "invoice_reminder": ("Reminder: invoice {{invoice_number}} is due", "Hi {{client_name}},\n\nA friendly reminder that invoice {{invoice_number}} ({{amount}}) is due.\n\n" + BTN % ("View and pay invoice", "invoice_url") + "\n\nAlready paid? Thank you, and please ignore this note."),
    "invoice_sent": ("Invoice {{invoice_number}} — {{amount}}", "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{project_name}} is ready: {{amount}}.\n\n" + BTN % ("View and pay invoice", "invoice_url")),
    "lead_received": ("I've received your project details ({{request_id}})", "Hi {{client_name}},\n\nThanks for sending your project details. Here is what I received:\n\nRequest ID: {{request_id}}\nProject type: {{project_type}}\nExpected reply: {{response_time}}\n\nWhat happens next: I'll read your details and reply with next steps, usually a short call or a fixed-scope quote.\n\nKeep your request ID handy if you need to reach me."),
    "magic_link": ("Your sign-in link for {{business_name}}", "Hi {{client_name}},\n\nUse the button below to log in. The link works once and expires in 15 minutes.\n\n" + BTN % ("Log in", "magic_url") + "\n\nIf you didn't ask for this, you can safely ignore it."),
    "meeting_booked": ("Confirmed: {{meeting_type}} on {{meeting_time}}", "Hi {{client_name}},\n\nYour {{meeting_type}} is confirmed for {{meeting_time}}.\n\n" + BTN % ("Join the meeting", "meeting_url") + "\n\nNeed to reschedule? Just reply to this email."),
    "new_message": ("New message on {{project_name}}", "Hi {{client_name}},\n\nYou have a new message:\n\n“{{message_preview}}”\n\n" + BTN % ("Read and reply", "action_url")),
    "password_reset": ("Reset your {{business_name}} password", "Hi {{client_name}},\n\nI received a request to reset your password. The link below is valid for one hour.\n\n" + BTN % ("Choose a new password", "reset_url") + "\n\nIf you didn't ask for this, no action is needed."),
    "payment_received": ("Payment received — thank you", "Hi {{client_name}},\n\nI've received your payment of {{amount}} for invoice {{invoice_number}}. Thank you!\n\n" + BTN % ("Open your project", "project_url")),
    "project_approved": ("Approved — thank you, {{client_name}}", "Hi {{client_name}},\n\nYou approved {{project_name}}. I'm preparing your final files now and will let you know as soon as they are ready.\n\n" + BTN % ("Open project", "project_url")),
    "project_delivered": ("{{project_name}} has been delivered", "Hi {{client_name}},\n\n{{project_name}} is complete and delivered. Thank you for working with me. Need another video? Start a new project any time and I'll reuse your saved brand kit.\n\n" + BTN % ("Start a new project", "dashboard_url")),
    "project_started": ("Your project {{project_name}} has started", "Hi {{client_name}},\n\nPayment received: {{project_name}} ({{project_id}}) is now active. Next, complete the short project setup so I have everything I need.\n\n" + BTN % ("Send project details", "project_url")),
    "quote_accepted": ("Thanks — quote {{quote_number}} accepted", "Hi {{client_name}},\n\nThanks for accepting quote {{quote_number}} for {{project_name}}. Next I'll send the agreement for your signature.\n\n" + BTN % ("Open your project", "project_url")),
    "quote_sent": ("Your quote {{quote_number}} is ready", "Hi {{client_name}},\n\nYour quote for {{project_name}} is ready to review: {{amount}}.\n\n" + BTN % ("Review your quote", "quote_url") + "\n\nYou can accept it in one click, or reply with any questions."),
    "retainer_renewal": ("Your monthly plan has renewed", "Hi {{client_name}},\n\nYour monthly plan renewed and your new allowance is available. Invoice {{invoice_number}} ({{amount}}) is ready.\n\n" + BTN % ("View invoice", "invoice_url")),
    "revision_completed": ("Your revision is ready — {{project_name}}", "Hi {{client_name}},\n\nYour revision on {{project_name}} is done. {{version_label}} is ready to review.\n\n" + BTN % ("Review the new version", "review_url")),
    "revision_received": ("Revision request received — {{project_name}}", "Hi {{client_name}},\n\nI've got your feedback for {{project_name}} and I'm working on it. You'll be notified when the next version is ready.\n\n" + BTN % ("View project", "project_url")),
    "testimonial_request": ("How was your experience?", "Hi {{client_name}},\n\nThanks again for {{project_name}}. Would you share a quick rating and a line or two about working together? I only publish feedback with your permission.\n\n" + BTN % ("Leave feedback", "project_url")),
    "welcome": ("Welcome, {{client_name}}", "Hi {{client_name}},\n\nYour account is ready. From your portal you can discuss a new project, upload files, review edits and pay invoices, all in one place.\n\nPlease confirm your email address so I can connect your account to any projects I've set up for you:\n\n" + BTN % ("Confirm email", "verify_url") + "\n\nIf you didn't create this account, you can ignore this message."),
}


def templates(rows):
    for r in rows:
        if r["key"] in TEMPLATES:
            r["subject"], r["body"] = TEMPLATES[r["key"]]
    return rows


t = S.edit_table(t, "email_templates", templates)

# a few wizard / form labels that spoke in the plural
def sections(rows):
    for r in rows:
        for k in ("title", "description"):
            v = r.get(k)
            if isinstance(v, str):
                r[k] = (v.replace("Tell us about the project.", "Tell me about the project.").replace("How can we contact you?", "How can I contact you?")
                        .replace("helps us tailor the next questions", "helps me tailor the next questions").replace("So we can plan turnaround and capacity properly.", "So I can plan turnaround and capacity properly.")
                        .replace("helps us recommend the right setup", "helps me recommend the right setup").replace("We reply from a real inbox, usually within one business day.", "I reply from a real inbox, usually within one business day."))
    return rows


t = S.edit_table(t, "onboarding_sections", sections)


def questions(rows):
    for r in rows:
        for k in ("text", "helpText", "placeholder"):
            v = r.get(k)
            if isinstance(v, str):
                r[k] = (v.replace("We use this to ask the right follow-up questions.", "I use this to ask the right follow-up questions.")
                        .replace("How many client accounts will you send us?", "How many client accounts will you send me?").replace("What are we showcasing?", "What am I showcasing?")
                        .replace("Tell us about your project, goals, audience, references, and anything else we should know.", "Tell me about your project, goals, audience, references, and anything else I should know.")
                        .replace("Anything else we should know?", "Anything else I should know?"))
    return rows


t = S.edit_table(t, "onboarding_questions", questions)
f.write_text(t, encoding="utf8")

# ───────────────────────────── database-demo.sql ─────────────────────────────
g = ROOT / "database-demo.sql"
u = g.read_text(encoding="utf8")
for old in ("FaizanEdits Pro", "Faizanedits Pro"):
    u = u.replace(old, NAME)
for a, b in (("youtube-video-editing", "long-form-podcast-editing"),):
    u = u.replace(a, b)


def plans(rows):
    """sample plans: one editor, so no 'team' or 'dedicated editor' claims; brand call to action; no duplicated feature lines"""
    for r in rows:
        r["ctaLabel"] = "Discuss your project"
        r["dedicatedEditor"] = S.Raw("0")
        if r.get("tier") == "studio":
            r["description"] = "Higher monthly volume for creators and brands that publish often."
        feats = json.loads(r["features"]) if r.get("features") else []
        feats = [f for f in feats if f != "Dedicated editor"]
        if r.get("tier") == "starter":
            feats = [("Colour correction" if f == "Captions & colour" else f) for f in feats]
        feats = list(dict.fromkeys(feats))  # no duplicate lines, order kept (keeps this step idempotent)
        r["features"] = json.dumps(feats, separators=(",", ":"), ensure_ascii=False)
    return rows


u = S.edit_table(u, "pricing_plans", plans)
g.write_text(u, encoding="utf8")
print("rebranded: site-defaults.json, database.sql, database-demo.sql")
