<?php defined('FEP') or exit; /** Vars: $next, $google, $demo, $notices [[text,tone]] */ ?>
<?php ob_start(); ?>
<?php foreach ($notices as [$text, $tone]): ?><?= ui_notice($text, $tone) ?><?php endforeach; ?>
<div data-fe-component="login" data-props="<?= json_attr(['next' => $next]) ?>">
  <div data-login-main>
    <div role="tablist" aria-label="Sign-in method" class="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
      <button role="tab" type="button" data-mode="password" aria-selected="true" class="h-9 rounded-lg bg-surface text-sm font-semibold text-fg shadow-soft transition">Password</button>
      <button role="tab" type="button" data-mode="magic" aria-selected="false" class="h-9 rounded-lg text-sm font-semibold text-muted transition hover:text-fg">Email me a link</button>
    </div>
    <form novalidate data-mode-form="password" data-fe-form="/api/auth/login" data-on-success="loginDone" class="space-y-4">
      <?= form_error_slot() ?>
      <?= field_input('email', 'Email', '', ['type' => 'email', 'required' => true, 'autocomplete' => 'username', 'inputmode' => 'email', 'placeholder' => 'you@company.com', 'attrs' => ['autofocus' => true, 'data-trim' => true]]) ?>
      <?= field_input('password', 'Password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'current-password']) ?>
      <?= submit_button('Sign in') ?>
      <div class="text-center"><a href="/forgot-password" class="text-sm font-semibold text-muted hover:text-fg">Forgot your password?</a></div>
    </form>
    <form novalidate hidden data-mode-form="magic" data-fe-form="/api/auth/magic" data-on-success="magicSent" data-prepare="magicPrep" class="space-y-4">
      <?= form_error_slot() ?>
      <?= field_input('email', 'Email', '', ['type' => 'email', 'required' => true, 'autocomplete' => 'username', 'inputmode' => 'email', 'placeholder' => 'you@company.com', 'id' => 'f-magic-email', 'attrs' => ['data-trim' => true]]) ?>
      <p class="text-xs text-subtle">No password needed — we'll email you a one-time link that signs you in.</p>
      <?= submit_button('Send sign-in link') ?>
    </form>
  </div>
  <div data-login-sent hidden role="status" class="text-center">
    <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><?= icon('mail', 24) ?></span>
    <h2 class="mt-4 text-lg font-extrabold">Check your inbox</h2>
    <p class="mt-2 text-sm text-muted">If an account exists for <b class="text-fg" data-sent-email></b>, a sign-in link is on its way. It expires in 15 minutes.</p>
    <button type="button" data-login-again class="mt-5 text-sm font-semibold text-accent-text hover:underline">Use a different email</button>
  </div>
</div>
<?php if ($google): ?>
  <div class="my-6 flex items-center gap-3 text-xs text-subtle"><span class="h-px flex-1 bg-line"></span>or<span class="h-px flex-1 bg-line"></span></div>
  <a href="/api/auth/google" class="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong text-sm font-semibold transition hover:bg-surface-2">
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
    Continue with Google
  </a>
<?php endif; ?>
<?php if ($demo): ?>
  <div class="mt-7 rounded-2xl border border-dashed border-line-strong bg-surface-2/50 p-4">
    <p class="text-xs font-bold uppercase tracking-wider text-subtle">Demo mode</p>
    <p class="mt-1 text-xs text-muted">Explore with sample data — no signup needed.</p>
    <div class="mt-3 grid grid-cols-3 gap-2">
      <?php foreach (['client', 'editor', 'admin'] as $k): ?><?= ui_action('/api/auth/demo', ucfirst($k), ['variant' => 'outline', 'size' => 'sm', 'body' => ['kind' => $k], 'redirect' => '@redirect']) ?><?php endforeach; ?>
    </div>
  </div>
<?php endif; ?>
<?php $bodyHtml = ob_get_clean(); ?>
<?= auth_card('Welcome back', 'Sign in to your client portal to review videos, approve edits and manage projects.', $bodyHtml, 'New here? <a href="/register" class="font-bold text-fg hover:text-accent-text">Create an account</a> or <a href="/start-project" class="font-bold text-fg hover:text-accent-text">start a project</a>') ?>
