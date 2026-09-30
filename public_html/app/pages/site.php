<?php
/** Public marketing website: home, services, work, case studies, process, pricing, about, blog, FAQ, contact, booking, help, legal. */
defined('FEP') or exit;

/** Shared by every public page: the page's own vars plus the script bundle. */
function site_page(string $view, array $vars, array $meta, int $status = 200): never
{
    render_page('site', 'site/' . $view, $vars + ['scripts' => ['js/site.js']], $meta, $status);
}

function portfolio_items(array $opts = []): array
{
    return array_map('work_item', list_public_portfolio($opts));
}

page('/', function (Ctx $c) {
    $site = get_site_context();
    $s = get_settings($site['workspaceId'], ['hero', 'process']);
    site_page('home', [
        'site' => $site, 'hero' => $s['hero'], 'process' => $s['process'], 'stats' => get_public_stats(), 'services' => list_public_services(),
        'work' => portfolio_items(['featured' => true, 'limit' => 6]), 'testimonials' => list_public_testimonials(['limit' => 3]), 'plans' => list_public_plans(), 'faqs' => list_public_faqs(),
    ], [
        'title' => $site['business']['name'] . ' — Professional video editing for creators and brands', 'absoluteTitle' => true, 'description' => $site['seo']['defaultDescription'], 'path' => '/', 'image' => $site['seo']['ogImage'] ?: null,
        'jsonLd' => ld(array_filter(['@type' => 'ProfessionalService', 'name' => $site['business']['name'], 'description' => $site['business']['tagline'], 'url' => app_url(), 'email' => $site['business']['email'] ?: null, 'telephone' => $site['business']['phone'] ?: null,
            'sameAs' => array_values(array_filter((array)($site['business']['socials'] ?? [])))])),
    ]);
});

page('/services', function (Ctx $c) {
    site_page('services', ['services' => list_public_services()], ['title' => 'Video editing services', 'description' => 'Short-form, YouTube, podcast, real estate, corporate, SaaS, VSL, UGC, motion graphics and more — each with a fixed-scope quote and a transparent process.', 'path' => '/services']);
});

page('/services/{slug}', function (Ctx $c) {
    $slug = $c->params['slug'];
    $s = get_public_service($slug) ?? Pages::notFound();
    $site = get_site_context();
    $categoryFor = ['short-form-video-editing' => 'Short Form', 'youtube-video-editing' => 'Long Form', 'podcast-editing' => 'Podcast', 'real-estate-video-editing' => 'Real Estate', 'vsl-editing' => 'VSL', 'saas-video-editing' => 'SaaS',
        'corporate-video-editing' => 'Corporate', 'gaming-content-editing' => 'Gaming', 'ugc-editing' => 'Ads', 'ad-creative-editing' => 'Ads'];
    $byService = list_public_faqs(['serviceSlug' => $slug]);
    $byCategory = $s['faqCategory'] ? list_public_faqs(['category' => $s['faqCategory']]) : [];
    $have = array_column($byService, 'id');
    $faqs = array_slice(array_merge($byService, array_values(array_filter($byCategory, fn($f) => !in_array($f['id'], $have, true)))), 0, 8);
    $looking = app_data('site-defaults')['SERVICE_TO_LOOKING_FOR'][$slug] ?? null;
    site_page('service', [
        's' => $s, 'site' => $site, 'faqs' => $faqs, 'work' => isset($categoryFor[$slug]) ? portfolio_items(['category' => $categoryFor[$slug], 'limit' => 3]) : [],
        'startHref' => '/start-project?service=' . rawurlencode($slug) . ($looking ? '&looking_for=' . rawurlencode($looking) : ''),
    ], [
        'title' => $s['seoTitle'] ?: $s['title'] . ' — video editing service', 'description' => $s['seoDescription'] ?: $s['shortDescription'], 'path' => '/services/' . $s['slug'], 'image' => $s['heroImage'] ?: null,
        'jsonLd' => ld(['@type' => 'Service', 'name' => $s['title'], 'description' => $s['shortDescription'], 'provider' => ['@type' => 'ProfessionalService', 'name' => $site['business']['name'], 'url' => app_url()], 'areaServed' => 'Worldwide', 'serviceType' => 'Video editing']),
    ]);
});

page('/work', function (Ctx $c) {
    $cats = array_column(list_portfolio_categories(), 'category');
    sort($cats);
    site_page('work', ['items' => portfolio_items(), 'categories' => $cats], ['title' => 'Our work — video editing portfolio', 'description' => 'Browse recent projects across real estate, podcasts, finance, SaaS, gaming, ads and more, with before/after comparisons and case studies.', 'path' => '/work']);
});

page('/case-studies', function (Ctx $c) {
    site_page('cases', ['cases' => list_public_case_studies()], ['title' => 'Case studies', 'description' => 'How we solved real content problems: the brief, the strategy, and the results — with only verified numbers.', 'path' => '/case-studies']);
});

page('/case-studies/{slug}', function (Ctx $c) {
    $cs = get_public_case_study($c->params['slug']) ?? Pages::notFound();
    // Only metrics the admin actually entered are shown — nothing is inferred or filled in.
    $results = [];
    $add = function ($k, $v) use (&$results) {
        if (is_string($k) && trim($k) !== '' && (is_string($v) || is_int($v) || is_float($v)) && trim((string)$v) !== '') {
            $results[] = [$k, (string)$v];
        }
    };
    $raw = $cs['results'];
    if (is_array($raw)) {
        if (array_is_list($raw)) {
            foreach ($raw as $r) {
                $add(is_array($r) ? ($r['label'] ?? null) : null, is_array($r) ? ($r['value'] ?? null) : null);
            }
        } else {
            foreach ($raw as $k => $v) {
                $add($k, $v);
            }
        }
    }
    site_page('case', ['c' => $cs, 'results' => $results], [
        'title' => $cs['seoTitle'] ?: $cs['title'] . ' — case study', 'description' => $cs['seoDescription'] ?: excerpt_text($cs['summary'] ?? $cs['problem']), 'path' => '/case-studies/' . $cs['slug'], 'image' => $cs['heroImage'] ?: null, 'type' => 'article',
        'jsonLd' => ld(array_filter(['@type' => 'Article', 'headline' => $cs['title'], 'description' => excerpt_text($cs['summary'] ?? $cs['problem']), 'image' => $cs['heroImage'] ?: null, 'datePublished' => $cs['createdAt'], 'dateModified' => $cs['updatedAt']])),
    ]);
});

page('/process', function (Ctx $c) {
    $p = get_settings(workspace_id(), ['process'])['process'];
    site_page('process', ['process' => $p], ['title' => 'Our process — from brief to final delivery', 'description' => 'Seven clear steps: tell us what you need, get a quote, onboard, edit, review with timestamped feedback, and download your final files.', 'path' => '/process']);
});

page('/pricing', function (Ctx $c) {
    site_page('pricing', ['plans' => list_public_plans(), 'faqs' => list_public_faqs(['category' => 'Pricing']), 'site' => get_site_context()],
        ['title' => 'Pricing', 'description' => 'Flexible video editing pricing: one-time projects, per-video or per-short rates, monthly retainers, hourly work and custom quotes.', 'path' => '/pricing']);
});

page('/about', function (Ctx $c) {
    $site = get_site_context();
    site_page('about', ['about' => get_settings($site['workspaceId'], ['about'])['about'], 'site' => $site], ['title' => 'About the studio', 'description' => 'A video editing studio with its own production system — built for clarity, craft and honest scope.', 'path' => '/about']);
});

page('/blog', function (Ctx $c) {
    $category = preg_match('/^[a-z0-9-]{1,80}$/', (string)($c->query['category'] ?? '')) ? $c->query['category'] : null;
    $posts = list_public_posts(['category' => $category, 'page' => (int)($c->query['page'] ?? 1)]);
    site_page('blog', ['posts' => $posts, 'cats' => list_blog_categories(), 'category' => $category], ['title' => 'Blog & resources', 'description' => 'Editing tips, creator resources, video marketing insights and guides.', 'path' => '/blog']);
});

page('/blog/{slug}', function (Ctx $c) {
    $p = get_public_post($c->params['slug']) ?? Pages::notFound();
    $site = get_site_context();
    $desc = $p['metaDescription'] ?: ($p['excerpt'] ?: excerpt_text($p['content']));
    site_page('post', ['p' => $p], [
        'title' => $p['seoTitle'] ?: $p['title'], 'description' => $desc, 'path' => '/blog/' . $p['slug'], 'image' => $p['featuredImage'] ?: null, 'type' => 'article', 'publishedTime' => $p['publishedAt'],
        'jsonLd' => ld(array_filter(['@type' => 'BlogPosting', 'headline' => $p['title'], 'description' => $desc, 'image' => $p['featuredImage'] ?: null, 'datePublished' => $p['publishedAt'], 'dateModified' => $p['updatedAt'],
            'author' => ['@type' => 'Person', 'name' => $p['authorName'] ?: $site['business']['name']], 'publisher' => ['@type' => 'Organization', 'name' => $site['business']['name'], 'url' => app_url()]])),
    ]);
});

page('/faq', function (Ctx $c) {
    $faqs = list_public_faqs();
    $known = app_data('cms-resources')['FAQ_CATEGORIES'];
    $present = array_unique(array_column($faqs, 'category'));
    $cats = array_merge(array_values(array_filter($known, fn($k) => in_array($k, $present, true))), array_values(array_diff($present, $known)));
    site_page('faq', ['faqs' => $faqs, 'cats' => $cats], [
        'title' => 'Frequently asked questions', 'description' => 'Answers about pricing, turnaround, revisions, files, payments, editing, retainers and contracts.', 'path' => '/faq',
        'jsonLd' => ld(['@type' => 'FAQPage', 'mainEntity' => array_map(fn($f) => ['@type' => 'Question', 'name' => $f['question'], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => excerpt_text($f['answer'], 500)]], array_slice($faqs, 0, 30))]),
    ]);
});

page('/contact', function (Ctx $c) {
    $reason = strtoupper((string)($c->query['reason'] ?? ''));
    site_page('contact', ['site' => get_site_context(), 'reason' => in_array($reason, ['GENERAL', 'PROJECT', 'PARTNERSHIP', 'AGENCY', 'CAREER'], true) ? $reason : 'GENERAL'],
        ['title' => 'Contact', 'description' => 'Get in touch about a project, a partnership, or working together.', 'path' => '/contact']);
});

page('/book', function (Ctx $c) {
    $booking = get_settings(workspace_id(), ['booking'])['booking'];
    if (!$booking['enabled']) {
        Pages::notFound();
    }
    site_page('book', ['types' => $booking['types']], ['title' => 'Book a call', 'description' => 'Book a discovery call, project consultation or strategy call.', 'path' => '/book']);
});

page('/help', function (Ctx $c) {
    site_page('help', ['articles' => list_kb_articles()], ['title' => 'Help center', 'description' => 'How to upload footage, request revisions, understand turnaround, approve videos and pay invoices.', 'path' => '/help']);
});

page('/privacy', function (Ctx $c) {
    site_page('legal', ['heading' => 'Privacy policy', 'text' => get_settings(workspace_id(), ['legal'])['legal']['privacy']], ['title' => 'Privacy policy', 'description' => 'How we collect, use and protect your information.', 'path' => '/privacy']);
});

page('/terms', function (Ctx $c) {
    site_page('legal', ['heading' => 'Terms of service', 'text' => get_settings(workspace_id(), ['legal'])['legal']['terms']], ['title' => 'Terms of service', 'description' => 'The terms that govern use of this website and the studio\'s services.', 'path' => '/terms']);
});
