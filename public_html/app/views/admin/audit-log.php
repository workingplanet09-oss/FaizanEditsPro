<?php /** Vars: $f, $res */
$ents = ['project', 'invoice', 'payment', 'quote', 'contract', 'lead', 'client', 'user', 'video_version', 'asset', 'setting', 'automation']; ?>
<?= ui_page_header('Audit log', "A permanent record of sensitive actions: sign-ins, status overrides, payments, approvals, deletions and setting changes. Entries can't be edited or removed.") ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/audit-log', [['name' => 'q', 'label' => 'Search log', 'placeholder' => 'Search message, action or person…'], ['name' => 'entityType', 'label' => 'Entity', 'type' => 'select', 'options' => array_map(fn($v) => ['value' => $v, 'label' => str_replace('_', ' ', $v)], $ents)]], $f) ?>
<?= ui_table([
    ['key' => 't', 'header' => 'When', 'primary' => true, 'render' => fn($r) => '<span class="whitespace-nowrap font-semibold">' . local_time($r['createdAt']) . '</span>'],
    ['key' => 'a', 'header' => 'Who', 'render' => fn($r) => e($r['actorLabel'] ?? 'System')],
    ['key' => 'm', 'header' => 'What happened', 'render' => fn($r) => '<span><span class="block">' . e($r['message']) . '</span><span class="font-mono text-[11px] text-subtle">' . e($r['action'] . ($r['ip'] ? ' · ' . $r['ip'] : '')) . '</span></span>'],
    ['key' => 'e', 'header' => 'Entity', 'hideOnMobile' => true, 'render' => fn($r) => '<span class="text-muted">' . e($r['entityType'] ?? '—') . '</span>'],
], $res['items'], fn($r) => $r['id'], null, ui_empty('No matching entries', 'Actions are recorded here as they happen.', 'shield')) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/audit-log', array_filter($f), $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
