<?php
/**
 * Reads for the public website. Demo rows are only visible while the site is in demo mode, so a live database can never show
 * fictional content or metrics.
 */
defined('FEP') or exit;

function demo_only_sql(string $alias = ''): string
{
    $a = $alias !== '' ? "{$alias}." : '';
    return is_demo_mode() ? '' : " AND {$a}`isDemo` = 0";
}

/** Site-wide settings for the layout: business, theme, navigation, footer, SEO, contact info. Memoised per request. */
function get_site_context(): array
{
    static $ctx = null;
    if ($ctx !== null) {
        return $ctx;
    }
    try {
        $ws = workspace_id();
        $s = get_settings($ws, ['business', 'theme', 'nav', 'footer', 'seo', 'contactInfo', 'workflow', 'booking']);
    } catch (Throwable $e) {
        // No database yet (fresh upload before database.sql is imported, or a short outage): the error page still needs the brand shell.
        $d = app_data('site-defaults')['SETTING_DEFAULTS'];
        $ws = '';
        $s = array_intersect_key($d, array_flip(['business', 'theme', 'nav', 'footer', 'seo', 'contactInfo', 'workflow', 'booking']));
    }
    return $ctx = [
        'workspaceId' => $ws, 'business' => $s['business'], 'theme' => $s['theme'], 'nav' => $s['nav'], 'footer' => $s['footer'], 'seo' => $s['seo'], 'contactInfo' => $s['contactInfo'],
        'workflow' => ['referralsEnabled' => $s['workflow']['referralsEnabled']], 'booking' => ['enabled' => $s['booking']['enabled']], 'demoMode' => is_demo_mode(),
    ];
}

/** Real numbers from the database, or values the admin typed by hand. Anything without data is simply not shown. */
function get_public_stats(): array
{
    $ws = workspace_id();
    $stats = get_setting($ws, 'stats');
    $demoC = demo_only_sql();
    $out = [];
    foreach ($stats['items'] as $item) {
        if (($item['mode'] ?? '') === 'hidden') {
            continue;
        }
        if (($item['mode'] ?? '') === 'manual') {
            if (!empty($item['value']) && trim($item['value']) !== '') {
                $out[] = ['key' => $item['key'], 'label' => $item['label'], 'value' => trim($item['value']) . ($item['suffix'] ?? '')];
            }
            continue;
        }
        $value = null;
        switch ($item['key']) {
            case 'clients':
                $n = (int)Db::val("SELECT COUNT(*) FROM `clients` c WHERE c.`workspaceId` = ?" . demo_only_sql('c') . " AND EXISTS (SELECT 1 FROM `projects` p WHERE p.`clientId` = c.`id` AND p.`status` = 'DELIVERED')", [$ws]);
                $value = $n > 0 ? (string)$n : null;
                break;
            case 'projects':
                $n = (int)Db::val("SELECT COUNT(*) FROM `projects` WHERE `workspaceId` = ? AND `status` = 'DELIVERED'{$demoC}", [$ws]);
                $value = $n > 0 ? (string)$n : null;
                break;
            case 'turnaround':
                $rows = Db::rows("SELECT `startDate`, `deliveredAt` FROM `projects` WHERE `workspaceId` = ? AND `status` = 'DELIVERED' AND `startDate` IS NOT NULL AND `deliveredAt` IS NOT NULL{$demoC} LIMIT 500", [$ws]);
                if ($rows) {
                    $days = array_sum(array_map(fn($r) => ((int)ts_ms($r['deliveredAt']) - (int)ts_ms($r['startDate'])) / 86400000, $rows)) / count($rows);
                    $value = max(1, (int)round($days)) . ' days';
                }
                break;
            case 'satisfaction':
                $a = Db::rowRaw("SELECT AVG(`rating`) AS a, COUNT(*) AS n FROM `testimonials` WHERE `workspaceId` = ? AND `status` = 'APPROVED' AND `permissionToPublish` = 1{$demoC}", [$ws]);
                $value = (int)$a['n'] > 0 && $a['a'] ? number_format((float)$a['a'], 1) . '/5' : null;
                break;
            case 'content':
                $n = (int)Db::val("SELECT COUNT(*) FROM `assets` WHERE `workspaceId` = ? AND `isDeliverable` = 1 AND `visibleToClient` = 1 AND `status` = 'READY' AND `deletedAt` IS NULL{$demoC}", [$ws]);
                $value = $n > 0 ? (string)$n : null;
                break;
        }
        if ($value) {
            $out[] = ['key' => $item['key'], 'label' => $item['label'], 'value' => $value];
        }
    }
    return $out;
}

function list_public_services(array $opts = []): array
{
    return Db::find('services', ['sql' => '`workspaceId` = ? AND `published` = 1' . (!empty($opts['featured']) ? ' AND `featured` = 1' : ''), 'params' => [workspace_id()]], ['order' => '`sortOrder` ASC']);
}

function get_public_service(string $slug): ?array
{
    return Db::first('services', ['workspaceId' => workspace_id(), 'slug' => $slug, 'published' => true]);
}

function list_public_plans(): array
{
    return Db::find('pricing_plans', ['sql' => '`workspaceId` = ? AND `enabled` = 1' . demo_only_sql(), 'params' => [workspace_id()]], ['order' => '`sortOrder` ASC']);
}

/** $opts: category?, featured?, limit? — each row carries caseStudy {slug,status}|null */
function list_public_portfolio(array $opts = []): array
{
    $sql = "`workspaceId` = ? AND `status` = 'PUBLISHED'" . demo_only_sql();
    $params = [workspace_id()];
    if (!empty($opts['category'])) {
        $sql .= ' AND `category` = ?';
        $params[] = $opts['category'];
    }
    if (!empty($opts['featured'])) {
        $sql .= ' AND `featured` = 1';
    }
    $rows = Db::find('portfolio_projects', ['sql' => $sql, 'params' => $params], ['order' => '`featured` DESC, `sortOrder` ASC'] + (!empty($opts['limit']) ? ['limit' => (int)$opts['limit']] : []));
    foreach ($rows as &$r) {
        $cs = Db::first('case_studies', ['portfolioProjectId' => $r['id']], ['cols' => ['slug', 'status']]);
        $r['caseStudy'] = $cs;
    }
    return $rows;
}

function list_portfolio_categories(): array
{
    return array_map(fn($r) => ['category' => $r['category'], 'count' => (int)$r['n']], Db::rows("SELECT `category`, COUNT(*) AS n FROM `portfolio_projects` WHERE `workspaceId` = ? AND `status` = 'PUBLISHED'" . demo_only_sql() . ' GROUP BY `category`', [workspace_id()]));
}

function list_public_case_studies(): array
{
    return Db::find('case_studies', ['sql' => "`workspaceId` = ? AND `status` = 'PUBLISHED'" . demo_only_sql(), 'params' => [workspace_id()]], ['order' => '`createdAt` DESC']);
}

function get_public_case_study(string $slug): ?array
{
    $c = Db::first('case_studies', ['sql' => "`workspaceId` = ? AND `slug` = ? AND `status` = 'PUBLISHED'" . demo_only_sql(), 'params' => [workspace_id(), $slug]]);
    if ($c) {
        $c['portfolioProject'] = $c['portfolioProjectId'] ? Db::first('portfolio_projects', ['id' => $c['portfolioProjectId']]) : null;
    }
    return $c;
}

function list_public_testimonials(array $opts = []): array
{
    return Db::find('testimonials', ['sql' => "`workspaceId` = ? AND `status` = 'APPROVED' AND `permissionToPublish` = 1" . demo_only_sql() . (!empty($opts['featured']) ? ' AND `featured` = 1' : ''), 'params' => [workspace_id()]], ['order' => '`featured` DESC, `createdAt` DESC'] + (!empty($opts['limit']) ? ['limit' => (int)$opts['limit']] : []));
}

/** $opts: category?, serviceSlug? */
function list_public_faqs(array $opts = []): array
{
    $sql = '`workspaceId` = ? AND `published` = 1';
    $params = [workspace_id()];
    if (!empty($opts['category'])) {
        $sql .= ' AND `category` = ?';
        $params[] = $opts['category'];
    }
    if (!empty($opts['serviceSlug'])) {
        $sql .= ' AND JSON_CONTAINS(COALESCE(`serviceSlugs`, JSON_ARRAY()), JSON_QUOTE(?))';
        $params[] = $opts['serviceSlug'];
    }
    return Db::find('faqs', ['sql' => $sql, 'params' => $params], ['order' => '`category` ASC, `sortOrder` ASC']);
}

/** $opts: category (slug)?, page?, pageSize? */
function list_public_posts(array $opts = []): array
{
    $pageSize = (int)($opts['pageSize'] ?? 9) ?: 9;
    $page = max(1, (int)($opts['page'] ?? 1));
    $where = "b.`workspaceId` = ? AND b.`status` = 'PUBLISHED' AND b.`publishedAt` <= ?" . demo_only_sql('b');
    $params = [workspace_id(), db_dt()];
    if (!empty($opts['category'])) {
        $where .= ' AND c.`slug` = ?';
        $params[] = $opts['category'];
    }
    $from = 'FROM `blog_posts` b LEFT JOIN `blog_categories` c ON c.`id` = b.`categoryId`';
    $rows = Db::rows("SELECT b.*, c.`id` AS c_id, c.`name` AS c_name, c.`slug` AS c_slug, c.`workspaceId` AS c_ws {$from} WHERE {$where} ORDER BY b.`publishedAt` DESC LIMIT {$pageSize} OFFSET " . (($page - 1) * $pageSize), $params);
    $total = (int)Db::val("SELECT COUNT(*) {$from} WHERE {$where}", $params);
    $items = array_map(function ($r) {
        $p = Db::hydrate('blog_posts', array_intersect_key($r, Db::table('blog_posts')['cols']));
        $p['category'] = $r['c_id'] ? ['id' => $r['c_id'], 'name' => $r['c_name'], 'slug' => $r['c_slug'], 'workspaceId' => $r['c_ws']] : null;
        return $p;
    }, $rows);
    return ['items' => $items, 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / $pageSize))];
}

function get_public_post(string $slug): ?array
{
    $p = Db::first('blog_posts', ['sql' => "`workspaceId` = ? AND `slug` = ? AND `status` = 'PUBLISHED' AND `publishedAt` <= ?" . demo_only_sql(), 'params' => [workspace_id(), $slug, db_dt()]]);
    if ($p) {
        $p['category'] = $p['categoryId'] ? Db::first('blog_categories', ['id' => $p['categoryId']]) : null;
    }
    return $p;
}

function list_blog_categories(): array
{
    return Db::find('blog_categories', ['workspaceId' => workspace_id()], ['order' => '`name` ASC']);
}

function list_kb_articles(): array
{
    return Db::find('kb_articles', ['workspaceId' => workspace_id(), 'published' => true], ['order' => '`category` ASC, `sortOrder` ASC']);
}

function sitemap_entries(): array
{
    return [
        'services' => array_map(fn($s) => ['slug' => $s['slug'], 'updatedAt' => $s['updatedAt']], list_public_services()),
        'posts' => array_map(fn($p) => ['slug' => $p['slug'], 'updatedAt' => $p['updatedAt']], list_public_posts(['pageSize' => 200])['items']),
        'cases' => array_map(fn($c) => ['slug' => $c['slug'], 'updatedAt' => $c['updatedAt']], list_public_case_studies()),
    ];
}

function subscribe_newsletter(string $email): array
{
    Db::upsert('newsletter_subscribers', ['workspaceId' => workspace_id(), 'email' => strtolower($email)], []);
    return ['ok' => true];
}
