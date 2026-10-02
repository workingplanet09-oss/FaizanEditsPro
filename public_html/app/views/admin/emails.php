<?php defined('FEP') or exit; /** Vars: $f, $res, $jobs, $email, $actor */ ?>
<?= ui_page_header('Email outbox', 'Every email the platform generated — sent, queued or failed. Templates are edited under Website content → Email templates.', ui_link('/admin/content?r=email-templates', 'Edit templates', ['variant' => 'outline'])) ?>
<?php if ($email['provider'] === 'log'): ?><p role="status" class="mb-5 rounded-2xl border border-info/30 bg-info-soft px-6 py-3.5 text-sm text-info"><b>Trial mode:</b> emails are written to this outbox instead of being delivered. Choose an email option in <code>config.php</code> (<code>mail</code>, <code>smtp</code> or a provider) to send real email.</p><?php endif; ?>
<?php if ($jobs): ?><div class="mb-5 flex flex-wrap items-center gap-3 text-sm">
  <?php foreach ((array)$jobs['counts'] as $k => $n): ?><?= ui_badge(strtolower($k) . ': ' . (int)$n, $k === 'FAILED' ? 'danger' : ($k === 'PENDING' ? 'warning' : 'neutral')) ?><?php endforeach; ?>
  <?= !empty($jobs['counts']->FAILED) ? ui_action('/api/admin/jobs', 'Retry failed jobs', ['size' => 'sm', 'variant' => 'outline', 'success' => 'Failed jobs queued for retry']) : '' ?></div><?php endif; ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/emails', [['name' => 'q', 'label' => 'Search emails', 'placeholder' => 'Search recipient or subject…'], ['name' => 'status', 'label' => 'Status', 'type' => 'select', 'options' => array_map(fn($v) => ['value' => $v, 'label' => ucfirst(strtolower($v))], ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'])]], $f) ?>
<?= ui_table([
    ['key' => 's', 'header' => 'Subject', 'primary' => true, 'render' => fn($m) => '<span><span class="font-bold">' . e($m['subject']) . '</span><span class="block text-xs font-normal text-muted">To ' . e($m['toEmail'] . ($m['templateKey'] ? ' · ' . $m['templateKey'] : '')) . '</span></span>'],
    ['key' => 'st', 'header' => 'Status', 'render' => fn($m) => ui_badge(strtolower($m['status']), $m['status'] === 'SENT' ? 'success' : ($m['status'] === 'FAILED' ? 'danger' : 'neutral'))],
    ['key' => 'w', 'header' => 'When', 'align' => 'right', 'render' => fn($m) => '<span class="text-muted">' . local_time($m['createdAt']) . '</span>'],
], $res['items'], fn($m) => $m['id'], null, ui_empty('No emails yet', 'Emails appear here as the platform sends them.', 'mail')) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/emails', array_filter($f), $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
