<?php defined('FEP') or exit; /** Vars: $site, $reason */
$b = $site['business']; $socials = array_filter((array)($b['socials'] ?? []));
$reasons = ['GENERAL' => 'General question', 'PROJECT' => 'A project I want edited', 'PARTNERSHIP' => 'Partnership', 'AGENCY' => 'Agency collaboration', 'CAREER' => 'Work with me'];
$box = 'rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8';
?>
<?= page_hero('Contact', $site['contactInfo']['heading'], $site['contactInfo']['intro']) ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-12">
    <div class="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:p-8" data-contact>
      <form novalidate data-contact-form data-fe-form="/api/contact" data-prepare="contactPrep" data-on-success="contactDone" data-on-error="contactFailed" class="relative space-y-5">
        <?= form_error_slot() ?>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <?= field_input('name', 'Your name', '', ['required' => true, 'autocomplete' => 'name']) ?>
          <?= field_input('email', 'Email', '', ['type' => 'email', 'required' => true, 'autocomplete' => 'email']) ?>
          <?= field_input('phone', 'Phone', '', ['type' => 'tel', 'autocomplete' => 'tel']) ?>
          <?= field_input('company', 'Company', '', ['autocomplete' => 'organization']) ?>
        </div>
        <?= field_select('reason', 'What is this about?', $reasons, $reason, ['required' => true]) ?>
        <?= field_textarea('message', 'Message', '', ['required' => true, 'rows' => 6, 'hint' => 'The more context you share, the better I can help.']) ?>
        <?= honeypot() ?>
        <?= turnstile_field() ?>
        <?= submit_button('Send message', ['iconRight' => 'send', 'class' => 'w-full sm:w-auto']) ?>
      </form>
      <div data-contact-done hidden role="status" class="animate-pop p-4 text-center sm:p-10">
        <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><?= icon('check', 26, '', 2.5) ?></span>
        <h2 class="h-card mt-5">Message sent</h2><p class="mx-auto mt-2 max-w-sm text-base text-muted">Thank you. I have emailed you a confirmation and will reply within one business day.</p>
      </div>
    </div>
    <aside class="space-y-5">
      <div class="<?= $box ?>"><?= icon('clock', 20, 'text-accent-text') ?><h2 class="h-card mt-3 text-xl">Response time</h2><p class="mt-1 text-base text-muted"><?= e($site['contactInfo']['responseTime']) ?></p></div>
      <?php if ($site['booking']['enabled']): ?><div class="<?= $box ?>"><?= icon('calendar', 20, 'text-accent-text') ?><h2 class="h-card mt-3 text-xl">Prefer to talk?</h2><p class="mt-1 text-base text-muted">Book a free discovery call and pick a time that suits you.</p><?= ui_link('/book', 'Book a call', ['variant' => 'outline', 'class' => 'mt-4']) ?></div><?php endif; ?>
      <div class="<?= $box ?> text-base"><h2 class="h-card text-xl">Direct</h2>
        <ul class="mt-3 space-y-3 text-muted">
          <?php if ($b['email']): ?><li class="flex gap-2.5"><?= icon('mail', 16, 'mt-0.5') ?><a class="min-h-11 underline decoration-line-strong underline-offset-4 hover:text-fg" href="mailto:<?= e($b['email']) ?>"><?= e($b['email']) ?></a></li><?php endif; ?>
          <?php if ($b['phone']): ?><li class="flex gap-2.5"><?= icon('phone', 16, 'mt-0.5') ?><?= e($b['phone']) ?></li><?php endif; ?>
          <?php if ($b['address']): ?><li class="flex gap-2.5"><?= icon('globe', 16, 'mt-0.5') ?><?= e($b['address']) ?></li><?php endif; ?>
          <?php foreach ($socials as $k => $v): ?><li class="flex gap-2.5"><?= icon('link', 16, 'mt-0.5') ?><a class="min-h-11 capitalize underline decoration-line-strong underline-offset-4 hover:text-fg" href="<?= e($v) ?>" target="_blank" rel="noopener noreferrer"><?= e($k) ?></a></li><?php endforeach; ?>
        </ul></div>
    </aside>
  </div>
<?= sec_close() ?>
