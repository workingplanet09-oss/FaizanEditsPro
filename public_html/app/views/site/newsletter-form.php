<form class="mt-3" data-fe-form="/api/newsletter" data-success="You're subscribed." data-refresh="0" data-reset novalidate>
  <div class="flex gap-2">
    <label class="sr-only" for="nl-email">Email address</label>
    <input id="nl-email" type="email" name="email" required placeholder="you@email.com" class="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-sm placeholder:text-subtle focus:border-accent focus:outline-none">
    <button type="submit" class="h-10 rounded-xl bg-fg px-4 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50">Join</button>
  </div>
  <p data-form-error role="alert" class="mt-2 hidden min-h-4 text-xs text-danger"></p>
</form>
