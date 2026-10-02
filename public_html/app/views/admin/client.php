<?php defined('FEP') or exit; /** Vars: $c, $tab, $life, $staff, $projects, $actor + per-tab: $checklist, $invoices, $quotes, $retainers, $kit, $assets, $messages, $notes */
$id = $c['id']; $canWrite = $actor->can('clients:write'); $here = "/admin/clients/{$id}";
$desc = implode(' · ', array_filter([$c['name'], $c['email'], $c['phone']]));
$actions = ($actor->can('projects:write') ? ui_link("/admin/projects/new?clientId={$id}", 'New project', ['icon' => 'plus', 'variant' => 'dark']) : '')
    . ($actor->can('invoices:write') ? ui_link("/admin/invoices/new?clientId={$id}", 'New invoice', ['icon' => 'receipt', 'variant' => 'outline']) : '');
$tabs = [['overview', 'Overview'], ['projects', 'Projects', $projects['total']], ['billing', 'Billing'], ['files', 'Files & brand'], ['messages', 'Messages']];
if ($actor->can('notes:read')) { $tabs[] = ['notes', 'Notes']; }
?>
<?= back_link('/admin/clients', 'Clients') ?>
<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
  <div class="min-w-0"><h1 class="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl"><?= e($c['companyName']) ?><?= meta_badge('CLIENT_STATUS', $c['status']) ?></h1>
    <p class="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]"><?= e($desc) ?></p></div>
  <div class="flex flex-wrap items-center gap-2"><?= $actions ?></div>
</div>
<div class="mb-6"><?= client_toolbar($c, $staff, $canWrite) ?></div>
<?= ui_tabs($tabs, $tab, $here) ?>

<?php if ($tab === 'overview'): ?>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
    <div class="space-y-6">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <?= card('<div class="p-4"><div class="text-xs font-medium text-muted">Lifetime revenue</div><div class="mt-1.5 text-2xl font-bold tabular-nums">' . money_map($life['revenue']) . '</div></div>') ?>
        <?= card('<div class="p-4"><div class="text-xs font-medium text-muted">Projects</div><div class="mt-1.5 text-2xl font-bold tabular-nums">' . (int)$life['totalProjects'] . '</div><div class="text-xs text-subtle">' . (int)$life['activeProjects'] . ' active</div></div>') ?>
        <?= card('<div class="p-4"><div class="text-xs font-medium text-muted">Avg. project value</div><div class="mt-1.5 text-2xl font-bold tabular-nums">' . money_map($life['averageProjectValue']) . '</div></div>') ?>
      </div>
      <?php ob_start(); ?><dl class="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-3">
        <?= ui_meta('Industry', e((string)$c['industry'])) ?><?= ui_meta('Country', e((string)$c['country'])) ?><?= ui_meta('Time zone', e((string)$c['timezone'])) ?>
        <?= ui_meta('Website', $c['website'] ? '<a class="text-accent-text hover:underline" href="' . e($c['website']) . '" target="_blank" rel="noreferrer noopener">' . e($c['website']) . '</a>' : null) ?>
        <?= ui_meta('Source', e((string)$c['source'])) ?><?= ui_meta('Client since', e(fmt_date($c['createdAt']))) ?>
        <?= ui_meta('Portal user', $c['user'] ? e($c['user']['name'] . ' · ' . strtolower($c['user']['status']) . ($c['user']['lastLoginAt'] ? ', last seen ' . fmt_date_short($c['user']['lastLoginAt']) : '')) : 'Not invited yet') ?>
        <?= ui_meta('Referral code', e((string)$c['referralCode'])) ?><?= ui_meta('Account manager', e($c['manager']['name'] ?? '')) ?>
        <?= ui_meta('Billing email', e((string)($c['organization']['billingEmail'] ?? ''))) ?><?= ui_meta('Last project', $life['lastProject'] ? '<a class="hover:underline" href="/admin/projects/' . e($life['lastProject']['id']) . '">' . e($life['lastProject']['name']) . '</a>' : null) ?></dl>
      <?= card(ob_get_clean(), '', 'Company') ?>
      <?php if ($life['currentRetainer']): $r = $life['currentRetainer']; ?>
        <?= card('<div class="flex items-center gap-3 p-6">' . icon('repeat', 18) . '<div class="flex-1"><div class="font-bold">' . e($r['name']) . '</div><div class="text-xs text-muted">' . e(money((int)$r['monthlyPrice'], $r['currency']) . ' / month · renews ' . fmt_date($r['renewalDate'])) . '</div></div>' . text_link('/admin/retainers', 'Manage') . '</div>') ?>
      <?php endif; ?>
    </div>
    <aside class="space-y-6">
      <?php ob_start(); ?><ul class="space-y-2 px-6 pb-6"><?php foreach ($checklist['items'] as $i): ?><li class="flex items-center gap-2.5 text-sm"><?= icon($i['done'] ? 'check-circle' : 'clock', 16, $i['done'] ? 'text-success' : 'text-subtle') ?><span class="<?= $i['done'] ? 'text-muted' : 'font-medium' ?>"><?= e($i['label']) ?></span></li><?php endforeach; ?></ul>
      <?= card(ob_get_clean(), '', 'Onboarding checklist', $checklist['done'] . ' of ' . $checklist['total'] . ' complete') ?>
    </aside>
  </div>

<?php elseif ($tab === 'projects'): ?>
  <?= card(ui_table([
      ['key' => 'n', 'header' => 'Project', 'primary' => true, 'render' => fn($p) => '<span><span class="font-bold">' . e($p['name']) . '</span><span class="block text-xs font-normal text-muted">' . e($p['code']) . '</span></span>'],
      ['key' => 's', 'header' => 'Status', 'render' => fn($p) => status_badge($p['status'])],
      ['key' => 'd', 'header' => 'Deadline', 'hideOnMobile' => true, 'render' => fn($p) => $p['deadline'] ? e(relative_deadline($p['deadline'])) : '—'],
      ['key' => 'e', 'header' => 'Editor', 'hideOnMobile' => true, 'render' => fn($p) => e(implode(', ', array_column($p['editors'], 'name')) ?: '—')],
      ['key' => 'pay', 'header' => 'Payment', 'hideOnMobile' => true, 'render' => fn($p) => payment_badge($p['paymentState'])],
  ], $projects['items'], fn($p) => $p['id'], fn($p) => '/admin/projects/' . $p['id'], ui_empty('No projects yet', 'Create the first project for this client.', 'film', $actor->can('projects:write') ? ui_link("/admin/projects/new?clientId={$id}", 'New project') : null))) ?>

<?php elseif ($tab === 'billing'): ?>
  <div class="space-y-6">
    <?= card(ui_table([
        ['key' => 'n', 'header' => 'Invoice', 'primary' => true, 'render' => fn($i) => '<span class="font-bold">' . e($i['number']) . '</span>'],
        ['key' => 'p', 'header' => 'Project', 'hideOnMobile' => true, 'render' => fn($i) => e($i['project']['name'] ?? '—')],
        ['key' => 's', 'header' => 'Status', 'render' => fn($i) => meta_badge('INVOICE_STATUS', $i['status'])],
        ['key' => 'a', 'header' => 'Amount', 'align' => 'right', 'render' => fn($i) => '<span class="font-semibold tabular-nums">' . e(money((int)$i['total'], $i['currency'])) . '</span>'],
    ], $invoices, fn($i) => $i['id'], fn($i) => '/admin/invoices/' . $i['id'], '<p class="px-6 pb-6 text-sm text-muted">No invoices yet.</p>'), '', 'Invoices') ?>
    <?= card(ui_table([
        ['key' => 'n', 'header' => 'Quote', 'primary' => true, 'render' => fn($q) => '<span class="font-bold">' . e($q['number']) . '</span>'],
        ['key' => 'p', 'header' => 'Project', 'hideOnMobile' => true, 'render' => fn($q) => e($q['project']['name'] ?? $q['title'] ?? '—')],
        ['key' => 's', 'header' => 'Status', 'render' => fn($q) => meta_badge('QUOTE_STATUS', $q['status'])],
        ['key' => 'a', 'header' => 'Total', 'align' => 'right', 'render' => fn($q) => '<span class="font-semibold tabular-nums">' . e(money((int)$q['total'], $q['currency'])) . '</span>'],
    ], $quotes, fn($q) => $q['id'], fn($q) => '/admin/quotes/' . $q['id'], '<p class="px-6 pb-6 text-sm text-muted">No quotes yet.</p>'), '', 'Quotes') ?>
    <?php if ($retainers): ?><?= card('<ul class="divide-y divide-line">' . implode('', array_map(fn($r) => '<li class="flex items-center justify-between gap-3 px-6 py-3.5 text-sm"><span class="font-bold">' . e($r['name']) . '</span><span class="tabular-nums">' . e(money((int)$r['monthlyPrice'], $r['currency'])) . '/mo</span>' . meta_badge('RETAINER_STATUS', $r['status']) . '</li>', $retainers)) . '</ul>', '', 'Retainers') ?><?php endif; ?>
  </div>

<?php elseif ($tab === 'files'):
  $colors = (array)($kit['colors'] ?? []); $fonts = (array)($kit['fonts'] ?? []); ?>
  <div class="space-y-6">
    <?php ob_start(); ?><div class="grid grid-cols-1 gap-6 px-6 pb-6 md:grid-cols-2">
      <div><h4 class="mb-2 text-xs font-bold text-subtle">Colours</h4><?php if ($colors): ?><ul class="flex flex-wrap gap-3"><?php foreach ($colors as $col): ?><li class="flex items-center gap-2 text-sm"><span class="h-7 w-7 rounded-lg border border-line" style="background:<?= e(preg_match('/^#[0-9a-fA-F]{3,8}$/', (string)($col['hex'] ?? '')) ? $col['hex'] : 'transparent') ?>"></span><?= e($col['name'] ?: $col['hex']) ?><span class="font-mono text-xs text-subtle"><?= e($col['hex']) ?></span></li><?php endforeach; ?></ul><?php else: ?><p class="text-sm text-muted">None saved.</p><?php endif; ?></div>
      <div><h4 class="mb-2 text-xs font-bold text-subtle">Fonts</h4><?php if ($fonts): ?><ul class="space-y-1 text-sm"><?php foreach ($fonts as $f): ?><li><b><?= e($f['name']) ?></b> <span class="text-muted"><?= e($f['usage'] ?? '') ?></span></li><?php endforeach; ?></ul><?php else: ?><p class="text-sm text-muted">None saved.</p><?php endif; ?></div>
      <?= !empty($kit['musicPreference']) ? '<div class="md:col-span-2"><h4 class="mb-1 text-xs font-bold text-subtle">Music</h4><p class="text-sm">' . e($kit['musicPreference']) . '</p></div>' : '' ?></div>
    <?= card(ob_get_clean(), '', 'Brand kit', 'Maintained by the client; you can edit it too.') ?>
    <?= file_manager($assets, ['canUpload' => false, 'canDelete' => $canWrite && $actor->can('files:delete')]) ?>
  </div>

<?php elseif ($tab === 'messages'): ?>
  <?= message_thread($messages, ['clientId' => $id, 'staff' => true, 'placeholder' => 'Message the client (visible in their portal)…']) ?>

<?php elseif ($tab === 'notes' && $actor->can('notes:read')): ?>
  <div class="max-w-2xl"><?= notes_panel('CLIENT', $id, $notes, $actor->can('notes:write')) ?></div>
<?php endif; ?>
