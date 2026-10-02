<?php
/** Validation for every settings group (unknown groups can't be written at all) and the integration status board (never the secrets). */
defined('FEP') or exit;

function setting_schema(string $key): ?V
{
    $hex = fn() => V::str()->regex('/^#[0-9a-fA-F]{6}$/');
    $link = fn() => V::obj(['label' => V::str()->max(60), 'href' => V::str()->max(300)]);
    $url = fn() => V::str()->max(500)->check(fn($v) => ($v === '' || preg_match('#^https?://#i', $v) || str_starts_with($v, '/')) ? null : 'Must start with http(s):// or /');
    $emailOrEmpty = fn() => V::str()->max(200)->check(fn($v) => ($v === '' || preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u', $v)) ? null : 'Enter a valid email address.');
    $int = fn(int $min, int $max) => V::num()->int()->min($min)->max($max);
    $cur = fn() => V::str()->length(3);
    $schemas = [
        'business' => fn() => V::obj([
            'name' => V::str()->trim()->min(1)->max(80), 'legalName' => V::str()->max(120), 'taxId' => V::str()->max(60)->default(''), 'tagline' => V::str()->max(200),
            'descriptor' => V::str()->max(80)->default(''), 'handle' => V::str()->max(40)->default(''), 'portraitUrl' => $url(),
            'email' => $emailOrEmpty(), 'phone' => V::str()->max(40), 'address' => V::str()->max(300), 'logoUrl' => $url(), 'faviconUrl' => $url(), 'website' => $url(),
            'socials' => V::rec($url()), 'defaultCurrency' => $cur(), 'currencies' => V::arr($cur())->min(1)->max(30), 'timezone' => V::str()->max(60),
            'defaultTurnaround' => V::str()->max(80), 'revisionPolicy' => V::str()->max(2000),
        ]),
        'theme' => fn() => V::obj(['accent' => $hex(), 'accentContrast' => $hex()]),
        'hero' => fn() => V::obj([
            'eyebrow' => V::str()->max(60), 'headline' => V::str()->min(1)->max(160), 'subheadline' => V::str()->max(400), 'primaryCta' => $link(), 'secondaryCta' => $link(),
            'showreelUrl' => $url(), 'posterUrl' => $url(), 'trustPoints' => V::arr(V::str()->max(60))->max(6),
            'floatingCards' => V::arr(V::obj(['icon' => V::str()->max(20), 'title' => V::str()->max(40), 'sub' => V::str()->max(60)]))->max(6),
        ]),
        'stats' => fn() => V::obj([
            'heading' => V::str()->max(120),
            'items' => V::arr(V::obj(['key' => V::str()->max(30), 'label' => V::str()->max(60), 'mode' => V::enum(['auto', 'manual', 'hidden']), 'value' => V::str()->max(30)->optional(), 'suffix' => V::str()->max(10)->optional()]))->max(8),
        ]),
        'nav' => fn() => V::obj(['links' => V::arr($link())->max(10), 'loginLabel' => V::str()->max(30), 'ctaLabel' => V::str()->max(30)]),
        'footer' => fn() => V::obj(['description' => V::str()->max(300), 'columns' => V::arr(V::obj(['title' => V::str()->max(40), 'links' => V::arr($link())->max(8)]))->max(4), 'newsletter' => V::bool()]),
        'process' => fn() => V::obj([
            'heading' => V::str()->max(160), 'intro' => V::str()->max(400),
            'steps' => V::arr(V::obj(['title' => V::str()->max(80), 'summary' => V::str()->max(200), 'detail' => V::str()->max(1000), 'youDo' => V::str()->max(300), 'weDo' => V::str()->max(300)]))->min(1)->max(12),
        ]),
        'about' => fn() => V::obj([
            'headline' => V::str()->max(200), 'story' => V::str()->max(4000),
            'values' => V::arr(V::obj(['title' => V::str()->max(60), 'body' => V::str()->max(300)]))->max(8),
            'team' => V::arr(V::obj(['name' => V::str()->max(80), 'role' => V::str()->max(80), 'bio' => V::str()->max(400)->optional(), 'imageUrl' => $url()->optional()]))->max(20),
        ]),
        'contactInfo' => fn() => V::obj(['heading' => V::str()->max(120), 'intro' => V::str()->max(400), 'responseTime' => V::str()->max(80)]),
        'legal' => fn() => V::obj(['terms' => V::str()->max(40000), 'privacy' => V::str()->max(40000)]),
        'invoice' => fn() => V::obj(['prefix' => V::str()->trim()->min(1)->max(8), 'dueDays' => $int(0, 120), 'notes' => V::str()->max(1000), 'paymentInstructions' => V::str()->max(1000), 'taxRateBps' => $int(0, 10000)]),
        'quote' => fn() => V::obj(['prefix' => V::str()->trim()->min(1)->max(8), 'validDays' => $int(1, 180), 'defaultDepositPercent' => $int(0, 100), 'taxRateBps' => $int(0, 10000), 'terms' => V::str()->max(6000)]),
        'workflow' => fn() => V::obj([
            'requireInternalReview' => V::bool(), 'requirePaymentBeforeDelivery' => V::bool(), 'autoInvoiceOnContractSigned' => V::bool(), 'rushFeePercent' => $int(0, 300),
            'referralsEnabled' => V::bool(), 'referralReward' => V::str()->max(200), 'timeTrackingEnabled' => V::bool(), 'testimonialRequestOnDelivery' => V::bool(), 'maxUploadMb' => $int(1, 1024 * 1024),
        ]),
        'booking' => fn() => V::obj([
            'enabled' => V::bool(), 'days' => V::arr($int(0, 6))->max(7), 'startHour' => $int(0, 23), 'endHour' => $int(1, 24), 'slotMinutes' => $int(10, 120), 'timezone' => V::str()->max(60),
            'minNoticeHours' => $int(0, 240), 'horizonDays' => $int(1, 90),
            'types' => V::rec(V::obj(['label' => V::str()->max(60), 'minutes' => $int(10, 240), 'description' => V::str()->max(200)])),
        ]),
        'seo' => fn() => V::obj(['titleTemplate' => V::str()->max(100), 'defaultDescription' => V::str()->max(300), 'ogImage' => $url()]),
        'notifications' => fn() => V::obj(['adminEmail' => $emailOrEmpty()]),
    ];
    return isset($schemas[$key]) ? $schemas[$key]() : null;
}

/** Post-validation normalisation that zod did with transforms (currency codes are upper-case). */
function setting_normalize(string $key, array $value): array
{
    if (in_array($key, ['booking', 'business'], true) && isset($value['timezone']) && $value['timezone'] !== '' && !valid_timezone($value['timezone'])) {
        throw new AppError('VALIDATION', 'Choose a valid time zone, for example "America/Los_Angeles", "Asia/Karachi" or "UTC".', ['timezone' => 'Unknown time zone. Use a name like Asia/Karachi.']);
    }
    if ($key === 'business') {
        $value['defaultCurrency'] = strtoupper($value['defaultCurrency']);
        $value['currencies'] = array_map('strtoupper', $value['currencies']);
    }
    return $value;
}

/** Which optional integrations are wired up — surfaced in Admin → Settings → Integrations (never the secrets). */
function integration_status(): array
{
    $payments = payment_provider_name();
    $emailDriver = (string)cfg('email.driver', 'log');
    return [
        'siteUrl' => ['source' => site_url_source(), 'url' => app_url()],
        'storage' => ['provider' => 'local', 'configured' => true],
        'payments' => ['provider' => $payments, 'configured' => $payments === 'demo' || (bool)cfg('payments.secret_key')],
        'email' => ['provider' => $emailDriver, 'configured' => in_array($emailDriver, ['log', 'mail'], true) || ($emailDriver === 'smtp' ? (bool)cfg('email.smtp.user') : (bool)cfg('email.api_key'))],
        'google' => ['configured' => (bool)(cfg('google.client_id') && cfg('google.client_secret'))],
        'turnstile' => ['configured' => (bool)(cfg('turnstile.secret_key') && cfg('turnstile.site_key')), 'partial' => (bool)cfg('turnstile.secret_key') !== (bool)cfg('turnstile.site_key')],
        'scan' => ['provider' => (string)cfg('scan.provider', 'none'), 'configured' => cfg('scan.provider', 'none') === 'none' || (bool)cfg('scan.url')],
        'calendar' => ['provider' => 'internal', 'configured' => true],
        'demoMode' => is_demo_mode(),
    ];
}
