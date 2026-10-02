<?php defined('FEP') or exit; ?><form class="mt-3" data-fe-form="/api/newsletter" data-success="You are subscribed." data-refresh="0" data-reset novalidate>
  <div class="flex gap-2">
    <label class="sr-only" for="nl-email">Email address</label>
    <input id="nl-email" type="email" name="email" required placeholder="you@email.com" autocomplete="email" class="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-subtle focus:border-accent focus:outline-none">
    <button type="submit" class="h-11 rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50">Join</button>
  </div>
  <p data-form-error role="alert" class="mt-2 hidden min-h-4 text-sm text-danger"></p>
</form>
