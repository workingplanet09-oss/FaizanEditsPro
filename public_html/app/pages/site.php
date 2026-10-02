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
        'work' => portfolio_items(['featured' => true, 'limit' => 3]), 'testimonials' => list_public_testimonials(['limit' => 3]), 'plans' => list_public_plans(), 'faqs' => list_public_faqs(),
    ], [
        'title' => $site['business']['name'] . ($site['business']['descriptor'] ? ' — ' . $site['business']['descriptor'] : ' — Video editing'), 'absoluteTitle' => true, 'description' => $site['seo']['defaultDescription'], 'path' => '/', 'image' => $site['seo']['ogImage'] ?: null,
        'jsonLd' => ld(array_filter(['@type' => 'ProfessionalService', 'name' => $site['business']['name'], 'alternateName' => $site['business']['handle'] ?: null, 'description' => $site['business']['tagline'], 'image' => $site['business']['portraitUrl'] ?: null, 'url' => app_url(), 'email' => $site['business']['email'] ?: null, 'telephone' => $site['business']['phone'] ?: null,
            'sameAs' => array_values(array_filter((array)($site['business']['socials'] ?? [])))])),
    ]);
});

page('/services', function (Ctx $c) {
    site_page('services', ['services' => list_public_services()], ['title' => 'Video editing services', 'description' => 'Short-form editing, long-form and podcast editing, and motion graphics, each with clear deliverables and a fixed-scope quote.', 'path' => '/services']);
});

page('/services/{slug}', function (Ctx $c) {
    $slug = $c->params['slug'];
    $s = get_public_service($slug) ?? Pages::notFound();
    $site = get_site_context();
    // which portfolio categories show up as examples under each service
    $categoryFor = ['short-form-video-editing' => ['Short-form'], 'long-form-podcast-editing' => ['YouTube', 'Podcast'], 'youtube-video-editing' => ['YouTube'], 'podcast-editing' => ['Podcast'], 'real-estate-video-editing' => ['Real Estate'],
        'vsl-editing' => ['VSL'], 'saas-video-editing' => ['SaaS'], 'corporate-video-editing' => ['Corporate'], 'ugc-editing' => ['Ads'], 'ad-creative-editing' => ['Ads']];
    $byService = list_public_faqs(['serviceSlug' => $slug]);
    $byCategory = $s['faqCategory'] ? list_public_faqs(['category' => $s['faqCategory']]) : [];
    $have = array_column($byService, 'id');
    $faqs = array_slice(array_merge($byService, array_values(array_filter($byCategory, fn($f) => !in_array($f['id'], $have, true)))), 0, 8);
    $looking = app_data('site-defaults')['SERVICE_TO_LOOKING_FOR'][$slug] ?? null;
    site_page('service', [
        's' => $s, 'site' => $site, 'faqs' => $faqs, 'work' => isset($categoryFor[$slug]) ? portfolio_items(['categories' => $categoryFor[$slug], 'limit' => 3]) : [],
        'startHref' => '/start-project?service=' . rawurlencode($slug) . ($looking ? '&looking_for=' . rawurlencode($looking) : ''),
    ], [
        'title' => $s['seoTitle'] ?: $s['title'], 'description' => $s['seoDescription'] ?: $s['shortDescription'], 'path' => '/services/' . $s['slug'], 'image' => $s['heroImage'] ?: null,
        'jsonLd' => ld(['@type' => 'Service', 'name' => $s['title'], 'description' => $s['shortDescription'], 'provider' => ['@type' => 'ProfessionalService', 'name' => $site['business']['name'], 'url' => app_url()], 'areaServed' => 'Worldwide', 'serviceType' => $s['title']]),
    ]);
});

page('/work', function (Ctx $c) {
    $cats = array_column(list_portfolio_categories(), 'category');
    sort($cats);
    site_page('work', ['items' => portfolio_items(), 'categories' => $cats], ['title' => 'View my work', 'description' => 'Selected video editing projects: short-form, long-form, podcast and business content, with before/after comparisons and case studies.', 'path' => '/work']);
});

page('/case-studies', function (Ctx $c) {
    site_page('cases', ['cases' => list_public_case_studies()], ['title' => 'Case studies', 'description' => 'The client goal, my process, the deliverables and the results, using only numbers the client has verified.', 'path' => '/case-studies']);
});

page('/case-studies/{slug}', function (Ctx $c) {
    $cs = get_public_case_study($c->params['slug']) ?? Pages::notFound();
    // Only metrics the owner actually entered are shown — nothing is inferred or filled in.
    $results = public_results($cs['results']);
    site_page('case', ['c' => $cs, 'results' => $results], [
        'title' => $cs['seoTitle'] ?: $cs['title'] . ' — case study', 'description' => $cs['seoDescription'] ?: excerpt_text($cs['summary'] ?? $cs['problem']), 'path' => '/case-studies/' . $cs['slug'], 'image' => $cs['heroImage'] ?: null, 'type' => 'article',
        'jsonLd' => ld(array_filter(['@type' => 'Article', 'headline' => $cs['title'], 'description' => excerpt_text($cs['summary'] ?? $cs['problem']), 'image' => $cs['heroImage'] ?: null, 'datePublished' => $cs['createdAt'], 'dateModified' => $cs['updatedAt']])),
    ]);
});

page('/process', function (Ctx $c) {
    $p = get_settings(workspace_id(), ['process'])['process'];
    site_page('process', ['process' => $p], ['title' => 'My process: brief, footage, editing, feedback, delivery', 'description' => 'Five clear steps from your first message to final files: brief, footage, editing, timestamped feedback and delivery.', 'path' => '/process']);
});

page('/pricing', function (Ctx $c) {
    site_page('pricing', ['plans' => list_public_plans(), 'faqs' => list_public_faqs(['category' => 'Pricing']), 'site' => get_site_context()],
        ['title' => 'Pricing', 'description' => 'Video editing pricing: one-time projects, per-video or per-short rates, monthly retainers and custom quotes, always with a fixed-scope quote first.', 'path' => '/pricing']);
});

page('/about', function (Ctx $c) {
    $site = get_site_context();
    site_page('about', ['about' => get_settings($site['workspaceId'], ['about'])['about'], 'site' => $site], ['title' => 'About me', 'description' => $site['business']['tagline'] . ' ' . ($site['business']['descriptor'] ?? '') . '. How I work, and who I work with.', 'path' => '/about']);
});

page('/blog', function (Ctx $c) {
    $category = preg_match('/^[a-z0-9-]{1,80}$/', (string)($c->query['category'] ?? '')) ? $c->query['category'] : null;
    $posts = list_public_posts(['category' => $category, 'page' => (int)($c->query['page'] ?? 1)]);
    site_page('blog', ['posts' => $posts, 'cats' => list_blog_categories(), 'category' => $category], ['title' => 'Blog', 'description' => 'Editing tips, creator resources and guides from Faizan Ali.', 'path' => '/blog']);
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
        ['title' => 'Contact', 'description' => 'Discuss your project with Faizan Ali, or ask a question about working together.', 'path' => '/contact']);
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
