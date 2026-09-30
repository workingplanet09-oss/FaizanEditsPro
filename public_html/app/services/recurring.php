<?php
/** Recurring work schedules (weekly / bi-weekly / monthly batches) and project duplication. */
defined('FEP') or exit;

function advance_schedule(int $ms, string $cadence): int
{
    return $cadence === 'WEEKLY' ? add_days_ms($ms, 7) : ($cadence === 'BIWEEKLY' ? add_days_ms($ms, 14) : add_months_ms($ms, 1));
}

function list_schedules(Actor $actor, ?string $clientId = null): array
{
    assert_can($actor, 'projects:write');
    $rows = Db::rows(
        'SELECT s.*, t.`name` AS t_name FROM `recurring_schedules` s JOIN `project_templates` t ON t.`id` = s.`templateId` WHERE s.`workspaceId` = ?' . ($clientId ? ' AND s.`clientId` = ?' : '') . ' ORDER BY s.`nextRunAt` ASC',
        $clientId ? [$actor->workspaceId, $clientId] : [$actor->workspaceId],
    );
    return array_map(fn($r) => Db::hydrate('recurring_schedules', array_intersect_key($r, Db::table('recurring_schedules')['cols'])) + ['template' => ['name' => $r['t_name']]], $rows);
}

/** $in: clientId, templateId, name, cadence, firstRunAt */
function create_schedule(Actor $actor, array $in): array
{
    assert_can($actor, 'projects:write');
    $client = Db::first('clients', ['id' => $in['clientId'], 'workspaceId' => $actor->workspaceId]);
    $template = Db::first('project_templates', ['id' => $in['templateId'], 'workspaceId' => $actor->workspaceId]);
    if (!$client) {
        throw not_found('Client');
    }
    if (!$template) {
        throw not_found('Template');
    }
    $s = Db::insert('recurring_schedules', ['workspaceId' => $actor->workspaceId, 'clientId' => $client['id'], 'templateId' => $template['id'], 'name' => trim($in['name']) ?: $template['name'], 'cadence' => $in['cadence'], 'nextRunAt' => $in['firstRunAt']]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'recurring.created', 'entityType' => 'recurring_schedule', 'entityId' => $s['id'], 'message' => "{$actor->name} scheduled “{$s['name']}” " . strtolower($in['cadence']) . " for {$client['companyName']}"]);
    return $s;
}

function set_schedule_active(Actor $actor, string $id, bool $active): array
{
    assert_can($actor, 'projects:write');
    if (!Db::exists('recurring_schedules', ['id' => $id, 'workspaceId' => $actor->workspaceId])) {
        throw not_found('Schedule');
    }
    Db::update('recurring_schedules', ['id' => $id], ['active' => $active]);
    return ['ok' => true];
}

/** Sweep: create the next batch of work (project + tasks + folders) for each due recurring schedule. */
function sweep_recurring(): int
{
    $due = Db::find('recurring_schedules', ['sql' => '`active` = 1 AND `nextRunAt` <= ?', 'params' => [db_dt()]]);
    $created = 0;
    foreach ($due as $s) {
        $template = Db::first('project_templates', ['id' => $s['templateId']]);
        $dateLabel = substr(iso_dt(ts_ms($s['nextRunAt'])), 0, 10);
        $name = "{$s['name']} — {$dateLabel}";
        $dup = Db::count('projects', ['clientId' => $s['clientId'], 'templateId' => $s['templateId'], 'name' => $name]);
        if (!$dup && $template && Db::exists('clients', ['id' => $s['clientId']])) {
            $retainer = Db::first('retainers', ['clientId' => $s['clientId'], 'status' => 'ACTIVE']);
            $bcfg = get_setting($s['workspaceId'], 'business');
            create_project(system_actor('Recurring schedule'), [
                'clientId' => $s['clientId'], 'name' => $name, 'templateId' => $s['templateId'], 'serviceId' => $template['serviceId'], 'projectTypeKey' => $template['projectTypeKey'],
                'status' => $retainer ? 'ONBOARDING' : 'AWAITING_QUOTE', 'clientVisible' => (bool)$retainer, 'retainerId' => $retainer['id'] ?? null, 'currency' => $retainer['currency'] ?? $bcfg['defaultCurrency'],
                'workspaceId' => $s['workspaceId'],
            ]);
            $created++;
        }
        Db::update('recurring_schedules', ['id' => $s['id']], ['lastRunAt' => now_ms(), 'nextRunAt' => advance_schedule((int)ts_ms($s['nextRunAt']), $s['cadence'])]);
    }
    return $created;
}

// ───────────────────────────── project duplication ─────────────────────────────

/** Staff duplicate: copies scope, brand overrides, tasks (reset), folder structure and onboarding defaults — never the video files. */
function duplicate_project(Actor $actor, string $projectId, array $opts = []): array
{
    assert_can($actor, 'projects:write');
    $src = require_project($actor, $projectId);
    if (array_key_exists('name', $opts) && $opts['name'] !== null && trim($opts['name']) === '') {
        throw bad_request('Enter a name for the copy.');
    }
    $copy = create_project($actor, [
        'clientId' => $src['clientId'], 'name' => !empty($opts['name']) ? trim($opts['name']) : "{$src['name']} (copy)", 'description' => $src['description'], 'serviceId' => $src['serviceId'],
        'templateId' => $src['templateId'], 'sourceProjectId' => $src['id'], 'priority' => $src['priority'], 'managerId' => $src['managerId'], 'scope' => $src['scope'] ?? FEP_DEFAULT_SCOPE,
        'revisionLimit' => $src['revisionLimit'], 'currency' => $src['currency'], 'status' => 'AWAITING_QUOTE', 'tags' => $src['tags'],
    ]);
    Db::update('projects', ['id' => $copy['id']], ['brandOverrides' => $src['brandOverrides'], 'projectTypeId' => $src['projectTypeId']]);
    if (!$src['templateId']) {
        foreach (Db::find('tasks', ['projectId' => $projectId, 'parentId' => null], ['order' => '`sortOrder` ASC']) as $t) {
            $parent = Db::insert('tasks', ['workspaceId' => $actor->workspaceId, 'projectId' => $copy['id'], 'title' => $t['title'], 'description' => $t['description'], 'priority' => $t['priority'], 'sortOrder' => $t['sortOrder'], 'createdById' => $actor->userId]);
            foreach (Db::find('tasks', ['parentId' => $t['id']]) as $st) {
                Db::insert('tasks', ['workspaceId' => $actor->workspaceId, 'projectId' => $copy['id'], 'parentId' => $parent['id'], 'title' => $st['title'], 'sortOrder' => $st['sortOrder'], 'createdById' => $actor->userId], false);
            }
        }
    }
    if (($opts['copyOnboarding'] ?? true) !== false) {
        foreach (Db::find('onboarding_responses', ['subjectType' => 'PROJECT', 'subjectId' => $projectId]) as $r) {
            Db::insert('onboarding_responses', ['workspaceId' => $r['workspaceId'], 'formKey' => $r['formKey'], 'subjectType' => 'PROJECT', 'subjectId' => $copy['id'], 'questionKey' => $r['questionKey'], 'questionText' => $r['questionText'], 'value' => $r['value']], false);
        }
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'project.duplicated', 'entityType' => 'project', 'entityId' => $copy['id'], 'message' => "{$actor->name} duplicated {$src['code']} into {$copy['code']}"]);
    return Db::first('projects', ['id' => $copy['id']]);
}
