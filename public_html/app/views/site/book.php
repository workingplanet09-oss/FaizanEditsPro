<?php defined('FEP') or exit; /** Var: $types [key => {label, minutes, description}] */ $first = array_key_first($types); ?>
<?= page_hero('Book a call', 'Pick a time that works for you.', 'A relaxed conversation about your content, your goals and the right setup. No pressure and no obligation.') ?>
<?= sec_open() ?>
  <div data-fe-component="booking" class="mx-auto max-w-3xl rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:p-8">
    <form novalidate data-booking-form data-fe-form="/api/booking" data-prepare="bookingPrep" data-on-success="bookingDone" data-on-error="bookingFailed" class="space-y-8">
      <?= form_error_slot() ?>
      <input type="hidden" name="startsAt" value="">
      <fieldset>
        <legend class="h-card mb-3 text-lg">1 · What would you like to talk about?</legend>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <?php foreach ($types as $key => $t): ?>
            <label class="cursor-pointer rounded-[var(--radius-card)] border border-line-strong bg-surface p-4 transition-colors duration-150 hover:border-accent"><input type="radio" name="type" value="<?= e($key) ?>" class="sr-only"<?= $key === $first ? ' checked' : '' ?>>
              <span class="flex items-center justify-between"><span class="font-bold"><?= e($t['label']) ?></span><span class="text-sm text-muted"><?= (int)$t['minutes'] ?> min</span></span><span class="mt-1 block text-sm text-muted"><?= e($t['description']) ?></span></label>
          <?php endforeach; ?>
        </div>
      </fieldset>
      <fieldset>
        <legend class="h-card mb-1 text-lg">2 · Pick a time</legend>
        <p class="mb-3 text-sm text-muted">Times are shown in your timezone<span data-tz></span>.</p>
        <div data-days role="tablist" aria-label="Choose a day" class="scroll-x flex gap-2 pb-2"></div>
        <div data-slots class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"></div>
      </fieldset>
      <fieldset class="space-y-5">
        <legend class="h-card mb-3 text-lg">3 · Your details</legend>
        <div class="relative grid grid-cols-1 gap-5 sm:grid-cols-2">
          <?= field_input('name', 'Name', '', ['required' => true, 'autocomplete' => 'name']) ?>
          <?= field_input('email', 'Email', '', ['type' => 'email', 'required' => true, 'autocomplete' => 'email']) ?>
          <?= field_input('phone', 'Phone', '', ['type' => 'tel', 'autocomplete' => 'tel']) ?>
          <?= field_input('company', 'Company / channel', '') ?>
          <?= honeypot() ?>
        </div>
        <?= field_textarea('notes', 'Anything I should know?', '', ['rows' => 3]) ?>
      </fieldset>
      <?= submit_button('Confirm booking', ['iconRight' => 'calendar', 'class' => 'w-full sm:w-auto', 'attrs' => ['disabled' => true, 'data-booking-submit' => true]]) ?>
    </form>
    <div data-booking-done hidden role="status" class="animate-pop p-4 text-center sm:p-6">
      <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><?= icon('check', 26, '', 2.5) ?></span>
      <h2 class="h-card mt-5">You are booked in</h2><p class="mt-2 text-base text-muted" data-booking-when></p><p class="mx-auto mt-2 max-w-sm text-sm text-muted" data-booking-mail></p>
      <a hidden data-booking-link rel="noopener noreferrer" class="mt-6 inline-flex h-12 items-center rounded-xl bg-accent px-6 text-base font-semibold text-accent-fg hover:bg-accent-hover">Open meeting link</a>
    </div>
  </div>
<?= sec_close() ?>
