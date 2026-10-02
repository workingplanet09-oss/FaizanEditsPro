<?php defined('FEP') or exit; /** Vars: $home, $hello, $first */
$open = array_values(array_filter($home['projects'], fn($p) => $p['status'] !== 'DELIVERED'));
$delivered = array_values(array_filter($home['projects'], fn($p) => $p['status'] === 'DELIVERED'));
$inReview = count(array_filter($home['projects'], fn($p) => in_array($p['status'], ['CLIENT_REVIEW', 'FINAL_REVIEW'], true)));
$n = count($home['attention']);
?>
<?php if (!$home['hasProjects']): ?>
  <?= ui_page_header("{$hello}, {$first}", "Welcome to your client portal. This is where you'll follow your project from quote to final delivery.") ?>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <?= card(ui_empty('No projects yet', "Tell me about your video and I’ll send a quote. Once you approve it, your project shows up here with a live progress tracker, files, messages and a review player.", 'film', ui_link('/start-project', 'Start your first project', ['size' => 'lg', 'iconRight' => 'arrow'])), 'p-2') ?>
    <?= $home['checklist'] ? checklist_card($home['checklist']) : '' ?>
  </div>
<?php else: ?>
  <?= ui_page_header("{$hello}, {$first}", $n ? "You have {$n} thing" . ($n === 1 ? '' : 's') . " that need" . ($n === 1 ? 's' : '') . ' your attention.' : "You're all caught up — I’ll let you know the moment something needs you.", ui_link('/start-project', 'New project', ['variant' => 'dark', 'icon' => 'plus'])) ?>
  <section aria-labelledby="attn" class="mb-8">
    <h2 id="attn" class="mb-3 flex items-center gap-2 text-sm font-bold text-muted"><?= icon('bell', 15) ?> Needs your attention</h2>
    <?= $n ? attention_list($home['attention']) : '<div class="flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft/50 px-6 py-4 text-sm">' . icon('check-circle', 20, 'text-success') . '<span><b>All caught up.</b> Nothing is waiting on you right now.</span></div>' ?>
  </section>
  <div class="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <?= ui_stat('Active projects', e((string)count($open)), null, null, 'film', '/dashboard/projects') ?>
    <?= ui_stat('Ready for review', e((string)$inReview), $inReview ? 'Watch and approve' : 'Nothing waiting', $inReview ? 'warning' : null, 'play') ?>
    <?= ui_stat('Unread messages', e((string)$home['unreadMessages']), null, $home['unreadMessages'] ? 'accent' : null, 'message', '/dashboard/messages') ?>
    <?= ui_stat('Delivered', e((string)count($delivered)), 'Completed projects', 'success', 'check-circle', '/dashboard/projects?tab=delivered') ?>
  </div>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
    <section aria-labelledby="proj">
      <div class="mb-3 flex items-center justify-between"><h2 id="proj" class="text-lg font-bold tracking-tight">Your projects</h2><a href="/dashboard/projects" class="text-sm font-semibold text-accent-text hover:underline">View all</a></div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <?php foreach (array_slice($open, 0, 6) as $p): ?><?= project_card($p) ?><?php endforeach; ?>
        <?php if (!$open): ?><div class="md:col-span-2"><?= card(ui_empty('No active projects', 'Everything is delivered. Ready for the next one?', 'film', ui_link('/start-project', 'Start a project'))) ?></div><?php endif; ?>
      </div>
    </section>
    <aside class="space-y-6">
      <?php foreach ($home['retainers'] as $r): ?>
        <?php ob_start(); ?>
          <div class="space-y-4 px-6 pb-6">
            <?php if (!empty($r['included']['videos'])): ?><?= progress_row('Videos', $r['used']['videos'], $r['included']['videos']) ?><?php endif; ?>
            <?php if (!empty($r['included']['shorts'])): ?><?= progress_row('Short-form', $r['used']['shorts'], $r['included']['shorts']) ?><?php endif; ?>
            <?php if (!empty($r['included']['hours'])): ?><?= progress_row('Hours', $r['used']['hours'], $r['included']['hours']) ?><?php endif; ?>
            <a href="/dashboard/retainers" class="text-sm font-semibold text-accent-text hover:underline">Manage retainer →</a>
          </div>
        <?= card(ob_get_clean(), '', $r['name'], 'Renews ' . fmt_date($r['renewalDate'])) ?>
      <?php endforeach; ?>
      <?= ($home['firstTime'] && $home['checklist']) ? checklist_card($home['checklist']) : '' ?>
      <?= card(activity_feed($home['activity'], true, 'Activity will appear here as your projects move forward.'), '', 'Recent activity') ?>
      <div class="<?= e(card_class('p-6')) ?>">
        <div class="flex items-center justify-between text-sm"><span class="font-semibold">File storage</span><span class="text-muted"><?= e(fmt_bytes($home['storage']['usedBytes'])) ?> of <?= e(fmt_bytes($home['storage']['limitBytes'])) ?></span></div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent" style="width:<?= max(1, min(100, $home['storage']['usedBytes'] / max(1, $home['storage']['limitBytes']) * 100)) ?>%"></div></div>
        <p class="mt-2 text-xs text-subtle"><?= (int)$home['storage']['files'] ?> file<?= $home['storage']['files'] === 1 ? '' : 's' ?> across your projects</p>
      </div>
    </aside>
  </div>
<?php endif; ?>
