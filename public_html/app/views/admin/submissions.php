<?php defined('FEP') or exit; /** Vars: $tab, $res, $actor */ ?>
<?= ui_page_header('Contact submissions', 'Messages from the website contact form. Turn any of them into a lead in one click.') ?>
<?= ui_tabs([['no', 'To handle'], ['yes', 'Handled'], ['all', 'All']], $tab, '/admin/submissions') ?>
<?php if (!$res['items']): ?>
  <?= card(ui_empty($tab === 'no' ? 'Nothing waiting' : 'No messages', 'New contact-form messages appear here and in your notifications.', 'mail')) ?>
<?php else: ?>
  <ul class="space-y-3"><?php foreach ($res['items'] as $s): ?>
    <li><?php ob_start(); ?><div class="p-5">
      <div class="flex flex-wrap items-start justify-between gap-3"><div>
        <div class="flex flex-wrap items-center gap-2"><b><?= e($s['name']) ?></b><a class="text-sm text-accent-text hover:underline" href="mailto:<?= e($s['email']) ?>"><?= e($s['email']) ?></a><?= $s['phone'] ? '<span class="text-sm text-muted">' . e($s['phone']) . '</span>' : '' ?>
          <?= ui_badge(strtolower(humanize($s['reason'])), 'neutral', '', false, false) ?><?= $s['handled'] ? ui_badge('Handled', 'success') : ui_badge('New', 'warning') ?></div>
        <?= $s['company'] ? '<div class="text-xs text-muted">' . e($s['company']) . '</div>' : '' ?></div>
        <span class="text-xs text-subtle" title="<?= e(fmt_datetime($s['createdAt'])) ?>"><?= ago($s['createdAt']) ?></span></div>
      <p class="mt-3 whitespace-pre-wrap text-sm leading-relaxed"><?= e($s['message']) ?></p>
      <div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <?= $s['leadId'] ? '<a href="/admin/leads/' . e($s['leadId']) . '" class="rounded-lg px-2.5 py-1.5 text-xs font-bold text-accent-text hover:underline">Open lead</a>' : ui_action("/api/contact-submissions/{$s['id']}/convert", 'Create lead', ['variant' => 'outline', 'size' => 'xs', 'success' => 'Lead created']) ?>
        <?= ui_action("/api/contact-submissions/{$s['id']}/handled", $s['handled'] ? 'Mark unhandled' : 'Mark handled', ['variant' => 'ghost', 'size' => 'xs', 'body' => ['handled' => !$s['handled']], 'success' => 'Updated']) ?></div></div>
      <?= card(ob_get_clean()) ?></li>
  <?php endforeach; ?></ul>
<?php endif; ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/submissions', $tab === 'no' ? [] : ['tab' => $tab], $res['total']) ?>
