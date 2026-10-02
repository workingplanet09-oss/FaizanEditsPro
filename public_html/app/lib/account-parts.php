<?php
/** Account settings panels shared by every area: profile, notifications, security; plus company, team and brand kit for clients. */
defined('FEP') or exit;

function profile_form(string $name, string $email, string $phone, string $timezone): string
{
    return card('<form novalidate data-fe-form="/api/auth/account" data-method="PATCH" data-success="Profile saved" data-refresh="0" class="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2">' . form_error_slot()
        . field_input('name', 'Full name', $name, ['required' => true, 'autocomplete' => 'name'])
        . field_input('email', 'Email', $email, ['disabled' => true, 'optional' => false, 'hint' => 'Contact the studio to change your sign-in email.', 'attrs' => ['data-skip' => true]])
        . field_input('phone', 'Phone', $phone, ['autocomplete' => 'tel', 'attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . field_input('timezone', 'Time zone', $timezone, ['placeholder' => 'e.g. Europe/London', 'attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . '<div class="sm:col-span-2">' . submit_button('Save profile', ['size' => 'md', 'class' => '']) . '</div></form>', '', 'Your profile', 'How your name appears on messages, approvals and signatures.');
}

function notification_prefs(array $prefs): string
{
    $label = ['PROJECT' => 'Project updates', 'MESSAGE' => 'Messages', 'PAYMENT' => 'Invoices & payments', 'REVIEW' => 'Reviews & feedback', 'SYSTEM' => 'System & account'];
    $rows = '';
    foreach ($prefs as $r) {
        $l = $label[$r['category']] ?? $r['category'];
        $rows .= '<li data-cat="' . e($r['category']) . '" class="grid grid-cols-1 items-center gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]"><span class="text-sm font-semibold">' . e($l) . '</span>'
            . '<span class="flex items-center justify-between sm:justify-center"><span class="text-xs text-subtle sm:hidden">In-app</span>' . ui_switch('inApp', !empty($r['inApp']), null) . '</span>'
            . '<span class="flex items-center justify-between sm:justify-center"><span class="text-xs text-subtle sm:hidden">Email</span>' . ui_switch('email', !empty($r['email']), null) . '</span></li>';
    }
    return card('<div class="px-6 pb-6" data-fe-component="prefs"><div class="hidden grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-3 border-b border-line pb-2 text-xs font-semibold text-subtle sm:grid"><span>Type</span><span class="text-center">In-app</span><span class="text-center">Email</span></div><ul class="divide-y divide-line">' . $rows . '</ul></div>', '', 'Notifications', 'Choose how you hear about each type of update.');
}

/** Password, two-factor and active sessions. */
function security_panel(bool $twoFactor, array $sessions): string
{
    $pw = '<form novalidate data-fe-form="/api/auth/account/password" data-prepare="passwordPrep" data-success="Password changed — other devices were signed out." data-refresh="0" data-reset class="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-3">' . '<div class="sm:col-span-3">' . form_error_slot() . '</div>'
        . field_input('current', 'Current password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'current-password'])
        . field_input('next', 'New password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'new-password', 'hint' => 'At least 10 characters.'])
        . field_input('confirm', 'Confirm new password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'new-password'])
        . '<div class="sm:col-span-3">' . submit_button('Change password', ['size' => 'md', 'class' => '']) . '</div></form>';
    $badge = $twoFactor ? '<span class="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">' . icon('shield', 13) . ' On</span>' : null;
    $tfa = '<div class="px-6 pb-6" data-fe-component="two-factor" data-props="' . json_attr(['enabled' => $twoFactor]) . '"></div>';
    $list = '<ul class="divide-y divide-line px-5 pb-2">';
    foreach ($sessions as $s) {
        $ua = trim(preg_replace('/\(.*?\)/', '', (string)($s['userAgent'] ?? 'Unknown device'))) ?: 'Browser';
        $list .= '<li class="flex flex-wrap items-center gap-3 py-3.5">' . icon(preg_match('/mobile|iphone|android/i', (string)$s['userAgent']) ? 'smartphone' : 'monitor', 20, 'text-muted')
            . '<div class="min-w-0 flex-1 basis-56"><div class="truncate text-sm font-semibold">' . e(mb_substr($ua, 0, 60)) . (!empty($s['current']) ? '<span class="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-xs font-bold text-success">This device</span>' : '') . '</div>'
            . '<div class="text-xs text-subtle">' . e($s['ip'] ?? 'Unknown IP') . ' · ' . ago($s['lastUsedAt'], 'active ') . '</div></div>'
            . (empty($s['current']) ? ui_action('/api/auth/account/sessions', 'Sign out', ['method' => 'DELETE', 'variant' => 'outline', 'size' => 'sm', 'body' => ['id' => $s['id']], 'success' => 'Session ended']) : '') . '</li>';
    }
    return '<div class="space-y-6">' . card($pw, '', 'Password') . card($tfa, '', 'Two-factor authentication', 'Add a second step at sign-in using an authenticator app.', $badge) . card($list . '</ul>', '', 'Active sessions', 'Devices currently signed in to your account.') . '</div>';
}

function company_form(string $clientId, array $v, bool $canEdit): string
{
    $d = $canEdit ? [] : ['disabled' => true];
    return card('<form novalidate data-fe-form="/api/clients/' . e($clientId) . '/company" data-method="PATCH" data-success="Company details saved" data-refresh="0" class="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2">' . '<div class="sm:col-span-2">' . form_error_slot() . '</div>'
        . field_input('companyName', 'Company name', $v['companyName'], ['required' => true, 'autocomplete' => 'organization'] + $d) . field_input('industry', 'Industry', $v['industry'], $d + ['attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . field_input('website', 'Website', $v['website'], ['type' => 'url'] + $d + ['attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]]) . field_input('country', 'Country', $v['country'], $d + ['attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . field_input('phone', 'Company phone', $v['phone'], $d + ['attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]]) . field_input('billingEmail', 'Billing email', $v['billingEmail'], ['type' => 'email'] + $d + ['attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . field_textarea('billingAddress', 'Billing address', $v['billingAddress'], ['rows' => 2, 'class' => 'sm:col-span-2'] + $d + ['attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . field_input('taxId', 'Tax / VAT ID', $v['taxId'], $d + ['attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . '<div class="sm:col-span-2">' . ($canEdit ? submit_button('Save company', ['size' => 'md', 'class' => '']) : '<p class="text-sm text-muted">Only account owners and managers can edit company details.</p>') . '</div></form>', '', 'Company & billing', 'Shown on invoices and contracts.');
}

const ORG_ROLES = ['OWNER' => 'Owner — everything', 'MANAGER' => 'Manager — projects & approvals', 'ASSISTANT' => 'Assistant — upload & message', 'BILLING' => 'Billing — invoices & payments', 'MEMBER' => 'Member — view & comment'];

function members_manager(string $organizationId, array $members, bool $canManage, string $meId): string
{
    $h = '<ul class="divide-y divide-line px-5 pb-2">';
    foreach ($members as $m) {
        $u = $m['user'];
        $h .= '<li class="flex flex-wrap items-center gap-3 py-3.5">' . ui_avatar($u['name'], null, 36) . '<div class="min-w-0 flex-1 basis-48"><div class="truncate text-sm font-bold">' . e($u['name']) . ($u['id'] === $meId ? '<span class="ml-2 text-xs font-medium text-subtle">(you)</span>' : '') . '</div>'
            . '<div class="truncate text-xs text-muted">' . e($u['email']) . (!empty($u['lastLoginAt']) ? ' · ' . ago($u['lastLoginAt'], 'seen ') : '') . '</div></div>' . ($u['status'] === 'INVITED' ? ui_badge('Invited', 'warning') : '');
        if ($canManage) {
            $opts = '';
            foreach (ORG_ROLES as $k => $l) {
                $opts .= '<option value="' . $k . '"' . ($m['role'] === $k ? ' selected' : '') . '>' . e(explode(' — ', $l)[0]) . '</option>';
            }
            $h .= '<select aria-label="Role of ' . e($u['name']) . '" data-member-role="' . e($m['id']) . '" class="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium">' . $opts . '</select>';
            if ($u['id'] !== $meId) {
                $h .= ui_action('/api/members/' . $m['id'], '', ['method' => 'DELETE', 'variant' => 'ghost', 'size' => 'sm', 'icon' => 'trash', 'attrs' => ['aria-label' => 'Remove ' . $u['name']], 'success' => 'Member removed',
                    'confirm' => ['title' => 'Remove this person?', 'description' => "{$u['name']} will lose access to your company's projects and files.", 'confirmLabel' => 'Remove', 'tone' => 'danger']]);
            }
        } else {
            $h .= ui_badge(strtolower($m['role']), 'neutral', '', false, false);
        }
        $h .= '</li>';
    }
    $h .= '</ul>';
    $modal = $canManage ? ui_modal('invite-member', 'Invite a colleague', '<form id="invite-form" novalidate data-fe-form="/api/organizations/' . e($organizationId) . '/members" data-success="Invitation sent" class="space-y-4">' . form_error_slot()
        . field_input('name', 'Name', '', ['required' => true]) . field_input('email', 'Email', '', ['type' => 'email', 'required' => true]) . field_select('role', 'Role', ORG_ROLES, 'MEMBER', ['required' => true]) . field_input('title', 'Job title', '') . '</form>',
        ['description' => "They'll receive an email to set a password and join your company.", 'footerHtml' => ui_button('Cancel', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button('Send invite', ['type' => 'submit', 'attrs' => ['form' => 'invite-form']])]) : '';
    return card($h, '', 'Team members', 'People at your company who can use this portal.', $canManage ? ui_button('Invite', ['size' => 'sm', 'icon' => 'plus', 'attrs' => ['data-modal-open' => '#invite-member']]) : null) . $modal;
}

/** Brand kit editor: a form that JS (portal.js "brand-kit") serialises into the PUT body. */
/** Height in px of an editable list once its rows are drawn by JavaScript: rows of 40, 12 gaps, then the 36 px "add" button. */
function kit_list_height(int $rows): int
{
    return ($rows > 0 ? $rows * 52 - 12 + 12 : 0) + 36 + 24; // + the card's bottom padding
}

function brand_kit_editor(string $clientId, array $kit, array $assets, bool $canEdit): string
{
    $roles = ['none' => 'Unassigned', 'logo' => 'Primary logo', 'alt' => 'Alternate logo', 'guidelines' => 'Brand guidelines', 'intro' => 'Intro', 'outro' => 'Outro', 'watermark' => 'Watermark', 'lower' => 'Lower third'];
    $roleOf = function (string $id) use ($kit): string {
        return match (true) {
            ($kit['logoAssetId'] ?? null) === $id => 'logo', ($kit['guidelinesAssetId'] ?? null) === $id => 'guidelines', ($kit['introAssetId'] ?? null) === $id => 'intro', ($kit['outroAssetId'] ?? null) === $id => 'outro',
            ($kit['watermarkAssetId'] ?? null) === $id => 'watermark', in_array($id, (array)($kit['altLogoAssetIds'] ?? []), true) => 'alt', in_array($id, (array)($kit['lowerThirdAssetIds'] ?? []), true) => 'lower', default => 'none',
        };
    };
    $files = '<div class="space-y-4 px-6 pb-6">' . ($canEdit ? '<div data-fe-component="uploader" data-props="' . json_attr(['purpose' => 'brand', 'clientId' => $clientId, 'compact' => true, 'title' => 'Drop logos, guidelines, intro/outro clips…', 'reload' => true]) . '"></div>' : '');
    if ($assets) {
        $files .= '<ul class="divide-y divide-line rounded-xl border border-line">';
        foreach ($assets as $a) {
            $opts = '';
            foreach ($roles as $k => $l) {
                $opts .= '<option value="' . $k . '"' . ($roleOf($a['id']) === $k ? ' selected' : '') . '>' . e($l) . '</option>';
            }
            $files .= '<li class="flex flex-wrap items-center gap-3 px-4 py-3">' . icon(str_starts_with($a['mimeType'], 'image/') ? 'image' : (str_starts_with($a['mimeType'], 'video/') ? 'video' : 'file'), 18, 'text-muted')
                . '<div class="min-w-0 flex-1 basis-40"><div class="truncate text-sm font-semibold">' . e($a['displayName']) . '</div><div class="text-xs text-subtle">' . e(fmt_bytes((int)$a['sizeBytes'])) . '</div></div>'
                . '<label class="sr-only" for="role-' . e($a['id']) . '">Role of ' . e($a['displayName']) . '</label><select id="role-' . e($a['id']) . '" data-asset-role="' . e($a['id']) . '"' . ($canEdit ? '' : ' disabled') . ' class="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium">' . $opts . '</select></li>';
        }
        $files .= '</ul>';
    } else {
        $files .= '<p class="text-sm text-muted">No brand files yet.</p>';
    }
    $files .= '</div>';
    $socials = '';
    foreach (['instagram', 'youtube', 'tiktok', 'linkedin', 'x'] as $s) {
        $socials .= field_input('social.' . $s, $s === 'x' ? 'X / Twitter' : ucfirst($s), ((array)($kit['socialHandles'] ?? []))[$s] ?? '', ['placeholder' => '@handle or URL', 'disabled' => !$canEdit]);
    }
    return '<form novalidate data-fe-component="brand-kit" data-fe-form="/api/clients/' . e($clientId) . '/brand-kit" data-method="PUT" data-prepare="brandKitPrep" data-success="Brand kit saved — editors will use it on every project." data-refresh="0" class="space-y-6">'
        . card($files, '', 'Brand files', 'Upload once — every project uses them automatically. Assign a role so editors know what each file is for.')
        . card('<div class="space-y-3 px-6 pb-6" data-list="colors" data-props="' . json_attr($kit['colors'] ?? []) . '" style="min-height:' . kit_list_height(count((array)($kit['colors'] ?? []))) . 'px"></div>', '', 'Colours', 'Hex values editors can copy straight into titles and graphics.')
        . card('<div class="space-y-3 px-6 pb-6"><div data-list="fonts" data-props="' . json_attr($kit['fonts'] ?? []) . '" class="space-y-3" style="min-height:' . (kit_list_height(count((array)($kit['fonts'] ?? []))) - 24) . 'px"></div>' . field_textarea('typographyRules', 'Typography rules', $kit['typographyRules'] ?? '', ['rows' => 2, 'placeholder' => 'e.g. Titles in sentence case, never all-caps.', 'disabled' => !$canEdit]) . '</div>', '', 'Typography')
        . card('<div class="grid grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2">' . field_textarea('musicPreference', 'Music preferences', $kit['musicPreference'] ?? '', ['rows' => 2, 'class' => 'md:col-span-2', 'placeholder' => 'Genres, artists, licensing libraries you already pay for…', 'disabled' => !$canEdit])
            . field_input('websiteUrl', 'Website', $kit['websiteUrl'] ?? '', ['type' => 'url', 'class' => 'md:col-span-2', 'placeholder' => 'https://', 'disabled' => !$canEdit]) . $socials . '</div>', '', 'Style & links')
        . '<div data-edit="' . ($canEdit ? '1' : '0') . '">' . ($canEdit ? '<div class="sticky bottom-20 z-10 flex justify-end lg:bottom-4">' . form_error_slot() . submit_button('Save brand kit', ['icon' => 'check', 'class' => 'shadow-lift']) . '</div>' : '<p class="text-sm text-muted">Only account owners and managers can edit the brand kit.</p>') . '</div></form>';
}
