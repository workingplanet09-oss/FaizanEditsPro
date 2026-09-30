<?php
/** Automation builder: "when <event> happens, if <conditions>, do <actions>" — validated on save, executed by the job runner. */
defined('FEP') or exit;

const FEP_AUTOMATION_RECIPIENTS = ['client', 'client_billing', 'manager', 'editors', 'team', 'lead_owner', 'admins', 'finance'];

function validate_automation(array $in): void
{
    if (trim($in['name']) === '') {
        throw bad_request('Give the automation a name.', ['name' => 'Required.']);
    }
    if (!in_array($in['event'], event_names(), true)) {
        throw bad_request('Unknown trigger event.', ['event' => 'Invalid event.']);
    }
    if (!$in['actions']) {
        throw bad_request('Add at least one action.', ['actions' => 'Add at least one action.']);
    }
    foreach ($in['actions'] as $a) {
        $c = $a['config'] ?? [];
        $type = $a['type'];
        if (in_array($type, ['NOTIFICATION', 'EMAIL', 'ADMIN_ALERT', 'CLIENT_REMINDER'], true)) {
            $rcpt = (string)($c['recipient'] ?? ($type === 'ADMIN_ALERT' ? 'admins' : ''));
            if (!in_array($rcpt, FEP_AUTOMATION_RECIPIENTS, true) && !str_starts_with($rcpt, 'staff_role:')) {
                throw bad_request('Choose who should receive each action.', ['actions' => 'Recipient required.']);
            }
        }
        if ($type === 'EMAIL' && empty($c['templateKey'])) {
            throw bad_request('Choose an email template.', ['actions' => 'Template required.']);
        }
        if (in_array($type, ['NOTIFICATION', 'ADMIN_ALERT', 'CLIENT_REMINDER'], true) && trim((string)($c['title'] ?? '')) === '') {
            throw bad_request('Notification actions need a title.', ['actions' => 'Title required.']);
        }
        if ($type === 'STATUS_UPDATE' && !in_array((string)($c['toStatus'] ?? ''), project_statuses(), true)) {
            throw bad_request('Choose a valid status.', ['actions' => 'Status required.']);
        }
        if ($type === 'CREATE_TASK' && trim((string)($c['taskTitle'] ?? '')) === '') {
            throw bad_request('Task actions need a title.', ['actions' => 'Title required.']);
        }
        $d = (int)($a['delayMinutes'] ?? 0);
        if ($d < 0 || $d > 60 * 24 * 60) {
            throw bad_request('Delay is out of range.');
        }
    }
}

function list_automations(Actor $actor): array
{
    assert_can($actor, 'automations:manage');
    $rows = Db::find('automations', ['workspaceId' => $actor->workspaceId], ['order' => '`event` ASC, `name` ASC']);
    return array_map(function ($a) {
        $a['actions'] = Db::find('automation_actions', ['automationId' => $a['id']], ['order' => '`sortOrder` ASC']);
        $a['_count'] = ['runs' => Db::count('automation_runs', ['automationId' => $a['id']])];
        return $a;
    }, $rows);
}

function get_automation(Actor $actor, string $id): array
{
    assert_can($actor, 'automations:manage');
    $a = Db::first('automations', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$a) {
        throw not_found('Automation');
    }
    $a['actions'] = Db::find('automation_actions', ['automationId' => $id], ['order' => '`sortOrder` ASC']);
    $a['runs'] = Db::find('automation_runs', ['automationId' => $id], ['order' => '`createdAt` DESC', 'limit' => 20]);
    return $a;
}

/** $in: name, description?, event, enabled?, conditions?, actions[{type, config, delayMinutes?}] */
function save_automation(Actor $actor, ?string $id, array $in): array
{
    assert_can($actor, 'automations:manage');
    validate_automation($in);
    $actions = array_values(array_map(fn($a, $i) => ['type' => $a['type'], 'config' => $a['config'] ?? new stdClass(), 'delayMinutes' => (int)($a['delayMinutes'] ?? 0), 'sortOrder' => $i], $in['actions'], array_keys($in['actions'])));
    if (!$id) {
        $newId = Db::tx(function () use ($actor, $in, $actions) {
            $a = Db::insert('automations', ['workspaceId' => $actor->workspaceId, 'name' => trim($in['name']), 'description' => $in['description'] ?? null, 'event' => $in['event'], 'enabled' => $in['enabled'] ?? true, 'conditions' => $in['conditions'] ?? null]);
            foreach ($actions as $act) {
                Db::insert('automation_actions', ['automationId' => $a['id']] + $act, false);
            }
            return $a['id'];
        });
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'automation.created', 'entityType' => 'automation', 'entityId' => $newId, 'message' => "{$actor->name} created automation “" . trim($in['name']) . '”']);
        return get_automation($actor, $newId);
    }
    $existing = Db::first('automations', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$existing) {
        throw not_found('Automation');
    }
    Db::tx(function () use ($id, $in, $actions, $existing) {
        Db::delete('automation_actions', ['automationId' => $id]);
        Db::update('automations', ['id' => $id], ['name' => trim($in['name']), 'description' => $in['description'] ?? null, 'event' => $in['event'], 'enabled' => $in['enabled'] ?? $existing['enabled'], 'conditions' => $in['conditions'] ?? null]);
        foreach ($actions as $act) {
            Db::insert('automation_actions', ['automationId' => $id] + $act, false);
        }
    });
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'automation.updated', 'entityType' => 'automation', 'entityId' => $id, 'message' => "{$actor->name} edited automation “{$in['name']}”"]);
    return get_automation($actor, $id);
}

function toggle_automation(Actor $actor, string $id, bool $enabled): array
{
    assert_can($actor, 'automations:manage');
    $a = Db::first('automations', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$a) {
        throw not_found('Automation');
    }
    Db::update('automations', ['id' => $id], ['enabled' => $enabled]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => $enabled ? 'automation.enabled' : 'automation.disabled', 'entityType' => 'automation', 'entityId' => $id, 'message' => "{$actor->name} " . ($enabled ? 'enabled' : 'disabled') . " automation “{$a['name']}”"]);
    return ['ok' => true];
}

function delete_automation(Actor $actor, string $id): array
{
    assert_can($actor, 'automations:manage');
    $a = Db::first('automations', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$a) {
        throw not_found('Automation');
    }
    if ($a['isSystem']) {
        throw new AppError('FORBIDDEN', "Built-in automations can't be deleted — switch them off instead.");
    }
    Db::delete('automations', ['id' => $id]);
    return ['ok' => true];
}
