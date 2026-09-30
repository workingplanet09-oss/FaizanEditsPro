<?php
/** Time tracking: a running timer per person, manual entries, and per-project totals for profitability. */
defined('FEP') or exit;

function assert_time_enabled(Actor $actor): void
{
    $wf = get_setting($actor->workspaceId, 'workflow');
    if (empty($wf['timeTrackingEnabled'])) {
        throw new AppError('NOT_CONFIGURED', 'Time tracking is switched off in settings.');
    }
}

/** $in: projectId, taskId?, note? */
function start_timer(Actor $actor, array $in): array
{
    assert_can($actor, 'time:track');
    assert_time_enabled($actor);
    require_project($actor, $in['projectId']);
    if (!empty($in['taskId'])) {
        scoped_task_row($actor, $in['taskId']);
    }
    if (Db::exists('time_entries', ['sql' => '`userId` = ? AND `endedAt` IS NULL', 'params' => [$actor->userId]])) {
        throw new AppError('CONFLICT', 'You already have a timer running. Stop it first.');
    }
    return Db::insert('time_entries', ['workspaceId' => $actor->workspaceId, 'projectId' => $in['projectId'], 'userId' => $actor->userId, 'taskId' => $in['taskId'] ?? null, 'note' => $in['note'] ?? null, 'startedAt' => now_ms()]);
}

function stop_timer(Actor $actor): array
{
    assert_can($actor, 'time:track');
    $running = Db::first('time_entries', ['sql' => '`userId` = ? AND `endedAt` IS NULL', 'params' => [$actor->userId]]);
    if (!$running) {
        throw not_found('Running timer');
    }
    $now = now_ms();
    Db::update('time_entries', ['id' => $running['id']], ['endedAt' => $now, 'seconds' => max(1, (int)round(($now - (int)ts_ms($running['startedAt'])) / 1000))]);
    return Db::first('time_entries', ['id' => $running['id']]);
}

/** $in: projectId, minutes, note?, date? */
function add_manual_time(Actor $actor, array $in): array
{
    assert_can($actor, 'time:track');
    assert_time_enabled($actor);
    require_project($actor, $in['projectId']);
    if ($in['minutes'] <= 0 || $in['minutes'] > 24 * 60) {
        throw bad_request('Enter between 1 minute and 24 hours.');
    }
    $at = ts_ms($in['date'] ?? null) ?? now_ms();
    return Db::insert('time_entries', ['workspaceId' => $actor->workspaceId, 'projectId' => $in['projectId'], 'userId' => $actor->userId, 'startedAt' => $at, 'endedAt' => $at + (int)$in['minutes'] * 60000, 'seconds' => (int)$in['minutes'] * 60, 'note' => $in['note'] ?? null]);
}

function my_timer(Actor $actor): ?array
{
    $running = Db::first('time_entries', ['sql' => '`userId` = ? AND `endedAt` IS NULL', 'params' => [$actor->userId]]);
    if (!$running) {
        return null;
    }
    $running['project'] = Db::first('projects', ['id' => $running['projectId']], ['cols' => ['id', 'name', 'code']]);
    return $running;
}

/** $opts: projectId?, userId? */
function list_time(Actor $actor, array $opts = []): array
{
    assert_can($actor, 'time:track');
    if (!empty($opts['projectId'])) {
        require_project($actor, $opts['projectId']);
    }
    $all = $actor->can('time:read_all');
    $where = ['te.`workspaceId` = ?'];
    $p = [$actor->workspaceId];
    if (!empty($opts['projectId'])) {
        $where[] = 'te.`projectId` = ?';
        $p[] = $opts['projectId'];
    }
    if ($all) {
        if (!empty($opts['userId'])) {
            $where[] = 'te.`userId` = ?';
            $p[] = $opts['userId'];
        }
    } else {
        $where[] = 'te.`userId` = ?';
        $p[] = $actor->userId;
    }
    $rows = Db::rows('SELECT te.*, u.`name` AS u_name, pr.`id` AS p_id, pr.`name` AS p_name, pr.`code` AS p_code FROM `time_entries` te JOIN `users` u ON u.`id` = te.`userId` JOIN `projects` pr ON pr.`id` = te.`projectId` WHERE ' . implode(' AND ', $where) . ' ORDER BY te.`startedAt` DESC LIMIT 200', $p);
    return array_map(function ($r) {
        $e = Db::hydrate('time_entries', array_intersect_key($r, Db::table('time_entries')['cols']));
        $e['user'] = ['name' => $r['u_name']];
        $e['project'] = ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']];
        return $e;
    }, $rows);
}

function delete_time(Actor $actor, string $id): array
{
    $e = Db::first('time_entries', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$e || ($e['userId'] !== $actor->userId && !$actor->can('time:read_all'))) {
        throw not_found('Time entry');
    }
    Db::delete('time_entries', ['id' => $id]);
    return ['ok' => true];
}
