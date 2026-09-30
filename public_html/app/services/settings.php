<?php
/** Workspace settings: defaults from the application merged with what the admin saved. */
defined('FEP') or exit;

/** Objects merge recursively; lists and scalars from storage replace the defaults. */
function settings_merge(mixed $base, mixed $over): mixed
{
    $isAssoc = fn($v) => is_array($v) && $v !== [] && !array_is_list($v);
    if (!$isAssoc($base) || !is_array($over) || ($over !== [] && array_is_list($over))) {
        return ($over === null || ($over === [] && $isAssoc($base))) ? $base : $over;
    }
    $out = $base;
    foreach ($over as $k => $v) {
        $out[$k] = array_key_exists($k, $base) ? settings_merge($base[$k], $v) : $v;
    }
    return $out;
}

function workspace_id(): string
{
    static $id = null;
    if ($id !== null) {
        return $id;
    }
    $ws = Db::first('workspaces', ['slug' => 'default']) ?? Db::first('workspaces', null, ['order' => '`createdAt` ASC']);
    if (!$ws) {
        throw new AppError('INTERNAL', 'No workspace exists yet. Import database.sql into an empty database first.');
    }
    return $id = $ws['id'];
}

function settings_cache(?string $set = null, mixed $val = null, bool $clear = false): mixed
{
    static $cache = [];
    if ($clear) {
        $cache = [];
        return null;
    }
    if ($set !== null) {
        $cache[$set] = $val;
    }
    return $cache[$set] ?? null;
}

function get_setting(string $workspaceId, string $key): array
{
    $ck = $workspaceId . ':' . $key;
    if (($hit = settings_cache($ck)) !== null) {
        return $hit;
    }
    $defaults = setting_defaults();
    $row = Db::first('settings', ['workspaceId' => $workspaceId, 'key' => $key]);
    $val = settings_merge($defaults[$key] ?? [], $row['value'] ?? null);
    settings_cache($ck, $val);
    return $val;
}

/** @return array<string,array> */
function get_settings(string $workspaceId, array $keys): array
{
    $out = [];
    foreach ($keys as $k) {
        $out[$k] = get_setting($workspaceId, $k);
    }
    return $out;
}

function get_all_settings(string $workspaceId): array
{
    return get_settings($workspaceId, array_keys(setting_defaults()));
}

function save_setting(Actor $actor, string $key, mixed $value): void
{
    assert_can($actor, 'settings:manage');
    if (!array_key_exists($key, setting_defaults())) {
        throw new AppError('BAD_REQUEST', "Unknown setting {$key}");
    }
    Db::upsert('settings', ['workspaceId' => $actor->workspaceId, 'key' => $key, 'value' => $value, 'updatedById' => $actor->userId], ['value' => $value, 'updatedById' => $actor->userId, 'updatedAt' => db_dt()]);
    settings_cache(clear: true);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'settings.update', 'entityType' => 'setting', 'entityId' => $key, 'message' => "{$actor->name} updated “{$key}” settings"]);
}

function invalidate_settings(): void { settings_cache(clear: true); }
