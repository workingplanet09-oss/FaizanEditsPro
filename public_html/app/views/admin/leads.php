<?php /** Vars: $section, $f, $counts, $res, $sources, $staff */
$has = (bool)array_filter($f);
$params = array_filter($f) + ($section === 'leads' ? [] : ['section' => $section]);
$fields = [
    ['name' => 'q', 'label' => 'Search leads', 'placeholder' => 'Search name, company, email, request ID…'],
    ['name' => 'temperature', 'label' => 'Temperature', 'type' => 'select', 'options' => [['value' => 'HOT', 'label' => 'Hot'], ['value' => 'WARM', 'label' => 'Warm'], ['value' => 'COLD', 'label' => 'Cold'], ['value' => 'NEEDS_REVIEW', 'label' => 'Needs review']]],
    ['name' => 'source', 'label' => 'Source', 'type' => 'select', 'options' => array_map(fn($s) => ['value' => $s['key'], 'label' => $s['label']], $sources)],
    ['name' => 'assignedTo', 'label' => 'Owner', 'type' => 'select', 'options' => array_merge([['value' => 'me', 'label' => 'Me'], ['value' => 'none', 'label' => 'Unassigned']], array_map(fn($s) => ['value' => $s['id'], 'label' => $s['name']], $staff))],
    ['name' => 'sort', 'label' => 'Sort', 'type' => 'select', 'options' => [['value' => 'score', 'label' => 'Highest score'], ['value' => 'followup', 'label' => 'Follow-up due'], ['value' => 'oldest', 'label' => 'Oldest first']]],
];
?>
<?= ui_page_header('Leads & CRM', 'Every inquiry, scored automatically and ready to follow up. Scores and temperatures are internal — visitors never see them.') ?>
<?= ui_tabs([['leads', 'New leads', $counts['leads']], ['prospects', 'Prospects', $counts['prospects']], ['converted', 'Converted', $counts['converted']], ['lost', 'Lost & archived', $counts['lost']], ['all', 'All']], $section, '/admin/leads', 'section', array_filter($f)) ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/leads', $fields, $f, '<input type="hidden" name="section" value="' . e($section) . '">') ?>
<?= ui_table([
    ['key' => 'n', 'header' => 'Lead', 'primary' => true, 'render' => fn($l) => '<span><span class="font-bold">' . e($l['name']) . '</span><span class="block text-xs font-normal text-muted">' . e($l['company'] ?: $l['email']) . '</span></span>'],
    ['key' => 't', 'header' => 'Temp', 'render' => fn($l) => temperature_badge($l['temperature'], $l['overridden'])],
    ['key' => 's', 'header' => 'Status', 'render' => fn($l) => meta_badge('LEAD_STATUS', $l['status'])],
    ['key' => 'w', 'header' => 'Looking for', 'hideOnMobile' => true, 'render' => fn($l) => '<span class="capitalize">' . e(humanize($l['lookingFor']) ?: '—') . '</span>'],
    ['key' => 'b', 'header' => 'Budget', 'hideOnMobile' => true, 'render' => fn($l) => e(budget_label($l['budgetRange']))],
    ['key' => 'src', 'header' => 'Source', 'hideOnMobile' => true, 'render' => fn($l) => e($l['source'] ?? '—')],
    ['key' => 'o', 'header' => 'Owner', 'hideOnMobile' => true, 'render' => fn($l) => $l['assignedTo'] ? e($l['assignedTo']['name']) : '<span class="text-subtle">Unassigned</span>'],
    ['key' => 'f', 'header' => 'Follow-up', 'hideOnMobile' => true, 'render' => fn($l) => $l['nextFollowUpAt'] ? '<span class="' . (days_until($l['nextFollowUpAt']) < 0 ? 'font-semibold text-danger' : '') . '">' . e(relative_deadline($l['nextFollowUpAt'])) . '</span>' : '—'],
    ['key' => 'c', 'header' => 'Received', 'align' => 'right', 'render' => fn($l) => '<span class="text-muted" title="' . e(fmt_date_short($l['createdAt'])) . '">' . ago($l['createdAt']) . '</span>'],
], $res['items'], fn($l) => $l['id'], fn($l) => '/admin/leads/' . $l['id'],
    ui_empty($has ? 'No leads match these filters' : 'No leads here yet', $has ? 'Try clearing a filter.' : 'New inquiries from the Start a Project form land here automatically.', 'inbox')) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/leads', $params, $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
