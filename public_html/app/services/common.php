<?php
/** Shared service helpers: numbering, paging, dates, "who did it". */
defined('FEP') or exit;

/** Atomic per-workspace sequence: next_number($ws, 'invoice', 1000) → 1001, 1002, … */
function next_number(string $workspaceId, string $key, int $start = 1000): int
{
    for ($attempt = 0; $attempt < 4; $attempt++) {
        $row = Db::rowRaw('SELECT `value` FROM `counters` WHERE `workspaceId` = ? AND `key` = ?', [$workspaceId, $key]);
        if ($row) {
            // compare-and-swap: only one concurrent caller can move the value from N to N+1
            $n = (int)$row['value'] + 1;
            if (Db::exec('UPDATE `counters` SET `value` = ? WHERE `workspaceId` = ? AND `key` = ? AND `value` = ?', [$n, $workspaceId, $key, (int)$row['value']]) === 1) {
                return $n;
            }
            continue;
        }
        try {
            Db::insert('counters', ['workspaceId' => $workspaceId, 'key' => $key, 'value' => $start + 1], false);
            return $start + 1;
        } catch (PDOException $e) {
            if (!Db::isDuplicate($e)) {
                throw $e;
            }
        }
    }
    throw new AppError('CONFLICT', 'Could not allocate a number. Please try again.');
}

/** @return array{page:int,pageSize:int,skip:int,take:int} */
function page_args(array $input, int $defaultSize = 20, int $max = 100): array
{
    $page = max(1, (int)($input['page'] ?? 1) ?: 1);
    $pageSize = min($max, max(1, (int)($input['pageSize'] ?? $defaultSize) ?: $defaultSize));
    return ['page' => $page, 'pageSize' => $pageSize, 'skip' => ($page - 1) * $pageSize, 'take' => $pageSize];
}

function paged(array $items, int $total, int $page, int $pageSize): array
{
    return ['items' => $items, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize, 'pages' => max(1, (int)ceil($total / $pageSize))];
}

function add_days_ms(int $ms, int $n): int { return $ms + $n * 86400000; }

function start_of_month_ms(?int $ms = null): int
{
    $t = intdiv($ms ?? now_ms(), 1000);
    return gmmktime(0, 0, 0, (int)gmdate('n', $t), 1, (int)gmdate('Y', $t)) * 1000;
}

function add_months_ms(int $ms, int $n): int
{
    $t = intdiv($ms, 1000);
    $y = (int)gmdate('Y', $t);
    $m = (int)gmdate('n', $t) + $n;
    $d = (int)gmdate('j', $t);
    $ts = gmmktime((int)gmdate('G', $t), (int)gmdate('i', $t), (int)gmdate('s', $t), $m, $d, $y);
    return $ts * 1000 + ($ms % 1000);
}

/** Business-day arithmetic (Mon–Fri, UTC) for turnaround → deadline. */
function add_business_days_ms(int $ms, int $n): int
{
    $left = $n;
    while ($left > 0) {
        $ms += 86400000;
        $dow = (int)gmdate('w', intdiv($ms, 1000));
        if ($dow !== 0 && $dow !== 6) {
            $left--;
        }
    }
    return $ms;
}

function who_is_actor(mixed $who): bool { return $who instanceof Actor; }
function who_id(mixed $who): ?string { return $who instanceof Actor ? $who->userId : null; }
function who_label(mixed $who): string
{
    if ($who instanceof Actor) {
        return $who->name;
    }
    return is_array($who) && !empty($who['system']) ? ($who['label'] ?? 'System') : 'Anonymous';
}
function who_name(mixed $who): string { return who_label($who); }

/** Request metadata for the audit trail (empty when running from cron / the command line). */
function request_meta(): array
{
    return PHP_SAPI === 'cli' ? ['ip' => null, 'userAgent' => null] : ['ip' => client_ip(), 'userAgent' => user_agent()];
}

/**
 * Immutable audit trail: who did what to which entity, when, from where.
 * e.g. "Faizan changed project status from Client Review to Revision"
 */
function audit(mixed $who, array $in): void
{
    $m = request_meta();
    Db::insert('audit_logs', [
        'workspaceId' => $in['workspaceId'],
        'actorId' => who_id($who),
        'actorLabel' => who_label($who),
        'action' => $in['action'],
        'entityType' => $in['entityType'],
        'entityId' => $in['entityId'] ?? null,
        'message' => $in['message'] ?? null,
        'metadata' => $in['metadata'] ?? null,
        'ip' => $m['ip'],
        'userAgent' => $m['userAgent'],
    ], false);
}

/** Timeline entry shown on project / client / lead pages. CLIENT-visible entries appear in the portal. */
function log_activity(mixed $who, array $in): void
{
    Db::insert('activity_logs', [
        'workspaceId' => $in['workspaceId'],
        'actorId' => who_id($who),
        'type' => $in['type'],
        'message' => $in['message'],
        'visibility' => $in['visibility'] ?? 'INTERNAL',
        'projectId' => $in['projectId'] ?? null,
        'clientId' => $in['clientId'] ?? null,
        'leadId' => $in['leadId'] ?? null,
        'entityType' => $in['entityType'] ?? null,
        'entityId' => $in['entityId'] ?? null,
        'metadata' => $in['metadata'] ?? null,
        'isDemo' => $in['isDemo'] ?? false,
    ], false);
}

/** Static data shipped with the application (settings defaults, CMS field definitions, contract template…). */
function app_data(string $name): array
{
    static $cache = [];
    return $cache[$name] ??= json_decode((string)file_get_contents(FEP_ROOT . "/app/data/{$name}.json"), true, 512, JSON_THROW_ON_ERROR);
}

function setting_defaults(): array { return app_data('site-defaults')['SETTING_DEFAULTS']; }
