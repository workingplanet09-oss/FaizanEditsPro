<?php
/** Sidebar navigation for the three signed-in areas (port of the previous nav configuration). */
defined('FEP') or exit;

function nav_groups(string $area): array
{
    $client = [
        ['items' => [['Dashboard', '/dashboard', 'dashboard', null, true], ['Projects', '/dashboard/projects', 'film'], ['Files', '/dashboard/files', 'folder'], ['Messages', '/dashboard/messages', 'message']]],
        ['label' => 'Billing', 'items' => [['Quotes', '/dashboard/quotes', 'clipboard'], ['Contracts', '/dashboard/contracts', 'sign'], ['Invoices', '/dashboard/invoices', 'receipt'], ['Retainers', '/dashboard/retainers', 'repeat']]],
        ['label' => 'Account', 'items' => [['Brand kit', '/dashboard/brand-kit', 'palette'], ['Settings', '/dashboard/settings', 'settings'], ['Help', '/help', 'help']]],
    ];
    $admin = [
        ['items' => [['Command center', '/admin', 'dashboard', null, true], ['Calendar', '/admin/calendar', 'calendar-days'], ['Tasks', '/admin/tasks', 'checklist', ['tasks:read']]]],
        ['label' => 'Work', 'items' => [
            ['Projects', '/admin/projects', 'film', ['projects:read_all', 'projects:read_assigned']], ['Revisions', '/admin/revisions', 'refresh', ['revisions:manage', 'projects:read_all']],
            ['Files', '/admin/files', 'folder', ['files:read']], ['Messages', '/admin/messages', 'message', ['messages:read']]]],
        ['label' => 'Sales', 'items' => [
            ['Leads & CRM', '/admin/leads', 'inbox', ['leads:read']], ['Clients', '/admin/clients', 'building', ['clients:read']], ['Quotes', '/admin/quotes', 'clipboard', ['quotes:read']], ['Contracts', '/admin/contracts', 'sign', ['contracts:read']]]],
        ['label' => 'Money', 'items' => [
            ['Invoices', '/admin/invoices', 'receipt', ['invoices:read']], ['Payments', '/admin/payments', 'wallet', ['payments:read']], ['Retainers', '/admin/retainers', 'repeat', ['retainers:manage', 'invoices:read']]]],
        ['label' => 'Website', 'items' => [
            ['Content', '/admin/content', 'news', ['cms:manage']], ['Project form', '/admin/forms', 'clipboard', ['forms:manage']], ['Submissions', '/admin/submissions', 'mail', ['cms:manage', 'leads:read']]]],
        ['label' => 'Studio', 'items' => [
            ['Analytics', '/admin/analytics', 'chart', ['analytics:read']], ['Automations', '/admin/automations', 'workflow', ['automations:manage']], ['Team', '/admin/team', 'users', ['team:manage']],
            ['Exports', '/admin/exports', 'download', ['reports:export']], ['Audit log', '/admin/audit-log', 'shield', ['audit:read']], ['Settings', '/admin/settings', 'settings', ['settings:manage']]]],
    ];
    $editor = [['items' => [['My work', '/editor', 'dashboard', null, true], ['Projects', '/editor/projects', 'film'], ['Tasks', '/editor/tasks', 'checklist'], ['Revisions', '/editor/revisions', 'refresh'], ['Files', '/editor/files', 'folder']]]];
    $raw = ['client' => $client, 'admin' => $admin, 'editor' => $editor][$area];
    return array_map(function ($g) {
        $g['items'] = array_map(fn($i) => ['label' => $i[0], 'href' => $i[1], 'icon' => $i[2], 'perm' => $i[3] ?? null, 'exact' => $i[4] ?? false], $g['items']);
        return $g;
    }, $raw);
}

/** Keeps only the links the person is allowed to use. */
function nav_filter(array $groups, Actor $a): array
{
    $out = [];
    foreach ($groups as $g) {
        $g['items'] = array_values(array_filter($g['items'], fn($i) => !$i['perm'] || $a->canAny($i['perm'])));
        if ($g['items']) {
            $out[] = $g;
        }
    }
    return $out;
}

/** Commands for the ⌘K palette: quick "create" actions and "go to" links. */
function nav_commands(string $area, array $groups, Actor $a): array
{
    $go = [];
    foreach ($groups as $g) {
        foreach ($g['items'] as $i) {
            $go[] = ['id' => 'go:' . $i['href'], 'label' => $i['label'], 'icon' => $i['icon'], 'href' => $i['href'], 'group' => 'Go to'];
        }
    }
    $create = [];
    if ($area === 'admin') {
        foreach ([['projects:write', 'New project', '/admin/projects/new'], ['clients:write', 'New client', '/admin/clients/new'], ['quotes:write', 'New quote', '/admin/quotes/new'], ['invoices:write', 'New invoice', '/admin/invoices/new'], ['tasks:write', 'New task', '/admin/tasks?new=1']] as [$perm, $label, $href]) {
            if ($a->can($perm)) {
                $create[] = ['id' => 'c:' . $href, 'label' => $label, 'icon' => 'plus', 'href' => $href, 'group' => 'Create'];
            }
        }
    }
    if ($area === 'client') {
        $create[] = ['id' => 'c:request', 'label' => 'Request a new project', 'icon' => 'plus', 'href' => '/start-project', 'group' => 'Create'];
    }
    return array_merge($create, $go);
}

function nav_is_active(string $path, string $href, bool $exact): bool
{
    return $exact ? $path === $href : ($path === $href || str_starts_with($path, $href . '/'));
}
