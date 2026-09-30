<?php
/**
 * Domain events and automations. A business action calls emit(); every enabled automation listening for that event is expanded
 * into queued jobs (optionally delayed). A broken automation must never break the action that triggered it — emit() never throws.
 */
defined('FEP') or exit;

const FEP_EVENT_LABELS = [
    'lead.created' => 'Lead created', 'lead.assigned' => 'Lead assigned', 'lead.follow_up_due' => 'Lead follow-up due',
    'quote.sent' => 'Quote sent', 'quote.accepted' => 'Quote accepted', 'quote.rejected' => 'Quote rejected',
    'contract.sent' => 'Contract sent', 'contract.signed' => 'Contract signed',
    'invoice.sent' => 'Invoice sent', 'invoice.due_soon' => 'Invoice due soon', 'invoice.overdue' => 'Invoice overdue', 'payment.received' => 'Payment received',
    'project.created' => 'Project created', 'project.activated' => 'Project activated', 'project.assigned' => 'Editor assigned',
    'project.status_changed' => 'Project status changed', 'project.deadline_soon' => 'Project deadline soon', 'project.approved' => 'Project approved', 'project.delivered' => 'Project delivered',
    'onboarding.completed' => 'Project onboarding completed', 'assets.ready' => 'Client marked assets ready', 'files.uploaded' => 'Files uploaded',
    'file_request.created' => 'File requested from client', 'change_request.created' => 'Change request submitted', 'draft.uploaded' => 'Draft uploaded',
    'revision.submitted' => 'Revision submitted', 'revision.completed' => 'Revision completed', 'message.received' => 'Client message received',
    'deliverables.published' => 'Final deliverables published', 'testimonial.requested' => 'Testimonial requested', 'retainer.renewed' => 'Retainer renewed',
];

function event_names(): array { return array_keys(FEP_EVENT_LABELS); }

/**
 * Publish a domain event. $payload: workspaceId, actorId?, projectId?, clientId?, organizationId?, leadId?, quoteId?, contractId?,
 * invoiceId?, versionId?, revisionId?, taskId?, retainerId?, messageId?, fileRequestId?, changeRequestId?, data? (scalars)
 */
function emit(string $name, array $payload): void
{
    try {
        $automations = Db::find('automations', ['workspaceId' => $payload['workspaceId'], 'event' => $name, 'enabled' => true]);
        $ctx = array_merge(['event' => $name], $payload, $payload['data'] ?? []);
        foreach ($automations as $auto) {
            if (!eval_logic($auto['conditions'], $ctx)) {
                continue;
            }
            foreach (Db::find('automation_actions', ['automationId' => $auto['id']], ['order' => '`sortOrder` ASC']) as $action) {
                enqueue_job('automation.action', ['automationId' => $auto['id'], 'actionId' => $action['id'], 'event' => $name, 'payload' => $payload], ['delayMs' => $action['delayMinutes'] * 60000]);
            }
            Db::insert('automation_runs', ['automationId' => $auto['id'], 'event' => $name, 'entityId' => $payload['projectId'] ?? $payload['leadId'] ?? $payload['invoiceId'] ?? null, 'status' => 'queued'], false);
        }
    } catch (Throwable $e) {
        app_log("[events] failed to emit {$name}: " . $e->getMessage());
    }
}

function automation_load_context(array $p): array
{
    $project = !empty($p['projectId']) ? Db::first('projects', ['id' => $p['projectId']]) : null;
    if ($project) {
        $project['members'] = Db::find('project_members', ['projectId' => $project['id']]);
    }
    $clientId = $p['clientId'] ?? ($project['clientId'] ?? null);
    return [
        'payload' => $p,
        'project' => $project,
        'client' => $clientId ? Db::first('clients', ['id' => $clientId]) : null,
        'lead' => !empty($p['leadId']) ? Db::first('leads', ['id' => $p['leadId']]) : null,
        'quote' => !empty($p['quoteId']) ? Db::first('quotes', ['id' => $p['quoteId']]) : null,
        'invoice' => !empty($p['invoiceId']) ? Db::first('invoices', ['id' => $p['invoiceId']]) : null,
        'contract' => !empty($p['contractId']) ? Db::first('contracts', ['id' => $p['contractId']]) : null,
        'version' => !empty($p['versionId']) ? Db::first('video_versions', ['id' => $p['versionId']]) : null,
    ];
}

function automation_build_vars(array $ctx, string $base): array
{
    $business = get_setting($ctx['payload']['workspaceId'], 'business');
    $d = $ctx['payload']['data'] ?? [];
    $inv = $ctx['invoice'];
    $quote = $ctx['quote'];
    $amount = isset($d['amount']) && is_numeric($d['amount']) ? money((int)$d['amount'], (string)($d['currency'] ?? $inv['currency'] ?? 'USD')) : ($inv ? money($inv['total'], $inv['currency']) : ($quote ? money($quote['total'], $quote['currency']) : ''));
    $pid = $ctx['project']['id'] ?? null;
    $ver = $ctx['version'];
    $lead = $ctx['lead'];
    $client = $ctx['client'];
    return [
        'business_name' => $business['name'],
        'client_name' => $client['name'] ?? $lead['name'] ?? 'there',
        'company' => $client['companyName'] ?? $lead['company'] ?? '',
        'project_name' => $ctx['project']['name'] ?? (string)($d['projectName'] ?? ''),
        'project_id' => $ctx['project']['code'] ?? '',
        'deadline' => !empty($ctx['project']['deadline']) ? fmt_date($ctx['project']['deadline']) : 'to be confirmed',
        'amount' => $amount,
        'invoice_number' => $inv['number'] ?? '',
        'quote_number' => $quote['number'] ?? '',
        'contract_number' => $ctx['contract']['number'] ?? '',
        'version_label' => $ver['label'] ?? (string)($d['versionLabel'] ?? ''),
        'request_code' => $lead['requestCode'] ?? '',
        'request_id' => $lead['requestCode'] ?? '',
        'lead_name' => $lead['name'] ?? '',
        'status' => (string)($d['toStatusLabel'] ?? ''),
        'detail' => (string)($d['detail'] ?? ''),
        'dashboard_url' => absolute_url($base),
        'project_url' => $pid ? absolute_url("{$base}/projects/{$pid}") : absolute_url($base),
        'review_url' => $pid && $ver ? absolute_url("{$base}/projects/{$pid}/review/{$ver['id']}") : ($pid ? absolute_url("{$base}/projects/{$pid}") : absolute_url($base)),
        'invoice_url' => $inv ? absolute_url("{$base}/invoices/{$inv['id']}") : absolute_url("{$base}/invoices"),
        'quote_url' => $quote ? absolute_url("{$base}/quotes/{$quote['id']}") : absolute_url("{$base}/quotes"),
        'contract_url' => $ctx['contract'] ? absolute_url("{$base}/contracts/{$ctx['contract']['id']}") : absolute_url("{$base}/contracts"),
        'lead_url' => $lead ? absolute_url("/admin/leads/{$lead['id']}") : absolute_url('/admin/leads'),
        'base' => $base,
        'project_pid' => $pid ?? '',
        'version_pid' => $ver['id'] ?? '',
        'invoice_pid' => $inv['id'] ?? '',
        'quote_pid' => $quote['id'] ?? '',
        'contract_pid' => $ctx['contract']['id'] ?? '',
        'lead_pid' => $lead['id'] ?? '',
    ];
}

function org_users(string $organizationId, array $roles): array
{
    [$ph, $p] = Db::in($roles);
    return Db::col("SELECT om.`userId` FROM `organization_members` om JOIN `users` u ON u.`id` = om.`userId` WHERE om.`organizationId` = ? AND om.`role` IN {$ph} AND u.`status` <> 'SUSPENDED'", [$organizationId, ...$p]);
}

function users_with_roles(string $workspaceId, array $roleKeys): array
{
    [$ph, $p] = Db::in($roleKeys);
    return Db::col("SELECT DISTINCT u.`id` FROM `users` u JOIN `user_roles` ur ON ur.`userId` = u.`id` JOIN `roles` r ON r.`id` = ur.`roleId` WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND u.`status` <> 'SUSPENDED' AND r.`key` IN {$ph}", [$workspaceId, ...$p]);
}

/** @return array<int,array{base:string,userIds:string[]}> */
function automation_resolve_recipients(string $spec, array $ctx): array
{
    $ws = $ctx['payload']['workspaceId'];
    $groups = [];
    $add = function (string $base, array $ids) use (&$groups) {
        $ids = array_values(array_filter($ids));
        if ($ids) {
            $groups[] = ['base' => $base, 'userIds' => $ids];
        }
    };
    $orgId = $ctx['client']['organizationId'] ?? $ctx['project']['organizationId'] ?? null;
    switch ($spec) {
        case 'client':
        case 'client_billing':
            $ids = $orgId ? org_users($orgId, $spec === 'client' ? ['OWNER', 'MANAGER'] : ['OWNER', 'BILLING']) : [];
            if (!$ids && !empty($ctx['client']['userId'])) {
                $ids[] = $ctx['client']['userId'];
            }
            $add('/dashboard', $ids);
            break;
        case 'manager':
            $add('/admin', [$ctx['project']['managerId'] ?? null]);
            break;
        case 'editors':
            $add('/editor', array_column(array_filter($ctx['project']['members'] ?? [], fn($m) => $m['role'] !== 'MANAGER'), 'userId'));
            break;
        case 'team':
            $add('/editor', array_column($ctx['project']['members'] ?? [], 'userId'));
            break;
        case 'lead_owner':
            $add('/admin', [$ctx['lead']['assignedToId'] ?? null]);
            break;
        case 'admins':
            $add('/admin', [...users_with_roles($ws, ['super_admin', 'admin']), $ctx['project']['managerId'] ?? null, $ctx['lead']['assignedToId'] ?? null]);
            break;
        case 'finance':
            $add('/admin', users_with_roles($ws, ['super_admin', 'admin', 'finance']));
            break;
        default:
            if (str_starts_with($spec, 'staff_role:')) {
                $add('/admin', users_with_roles($ws, [substr($spec, 11)]));
            }
    }
    return $groups;
}

/** Guards for delayed reminders: only fire if the thing is STILL waiting. */
function automation_guard_passes(?string $onlyIf, array $ctx): bool
{
    if (!$onlyIf) {
        return true;
    }
    switch ($onlyIf) {
        case 'invoice_unpaid':
            $s = $ctx['invoice'] ? Db::val('SELECT `status` FROM `invoices` WHERE `id` = ?', [$ctx['invoice']['id']]) : null;
            return $s !== null && !in_array($s, ['PAID', 'CANCELLED'], true);
        case 'quote_open':
            $s = $ctx['quote'] ? Db::val('SELECT `status` FROM `quotes` WHERE `id` = ?', [$ctx['quote']['id']]) : null;
            return in_array($s, ['SENT', 'VIEWED'], true);
        case 'contract_unsigned':
            $s = $ctx['contract'] ? Db::val('SELECT `status` FROM `contracts` WHERE `id` = ?', [$ctx['contract']['id']]) : null;
            return in_array($s, ['SENT', 'VIEWED'], true);
        case 'review_pending':
            $s = $ctx['project'] ? Db::val('SELECT `status` FROM `projects` WHERE `id` = ?', [$ctx['project']['id']]) : null;
            return in_array($s, ['CLIENT_REVIEW', 'FINAL_REVIEW'], true);
        case 'lead_untouched':
            $s = $ctx['lead'] ? Db::val('SELECT `status` FROM `leads` WHERE `id` = ?', [$ctx['lead']['id']]) : null;
            return $s === 'NEW';
    }
    return true;
}

function run_automation_action(array $job): void
{
    $action = Db::first('automation_actions', ['id' => $job['actionId']]);
    $auto = $action ? Db::first('automations', ['id' => $action['automationId']]) : null;
    if (!$action || !$auto || !$auto['enabled']) {
        return;
    }
    $cfg = $action['config'] ?? [];
    $ctx = automation_load_context($job['payload']);
    if (!automation_guard_passes($cfg['onlyIf'] ?? null, $ctx)) {
        return;
    }
    $ws = $job['payload']['workspaceId'];
    $exclude = !empty($cfg['includeActor']) ? [] : [$job['payload']['actorId'] ?? ''];
    $category = $cfg['category'] ?? 'PROJECT';
    $entity = $job['payload']['projectId'] ?? $job['payload']['leadId'] ?? $job['payload']['invoiceId'] ?? null;
    try {
        switch ($action['type']) {
            case 'NOTIFICATION':
            case 'ADMIN_ALERT':
            case 'CLIENT_REMINDER':
            case 'EMAIL':
                $spec = (string)($cfg['recipient'] ?? ($action['type'] === 'ADMIN_ALERT' ? 'admins' : 'client'));
                foreach (automation_resolve_recipients($spec, $ctx) as $g) {
                    $vars = automation_build_vars($ctx, $g['base']);
                    $title = fill_vars((string)($cfg['title'] ?? ''), $vars);
                    $message = fill_vars((string)($cfg['message'] ?? ''), $vars);
                    $link = !empty($cfg['link']) ? fill_vars((string)$cfg['link'], $vars) : null;
                    $wantsEmail = in_array($action['type'], ['EMAIL', 'CLIENT_REMINDER'], true);
                    notify([
                        'workspaceId' => $ws, 'userIds' => $g['userIds'],
                        // staff don't need an alert about their own action, but a client still wants confirmation of theirs
                        'exclude' => $g['base'] === '/dashboard' ? [] : $exclude,
                        'category' => $category, 'type' => $job['event'], 'title' => $title ?: ($vars['project_name'] ?: $job['event']),
                        'message' => $message, 'link' => $link, 'inApp' => $action['type'] !== 'EMAIL', 'email' => $wantsEmail || !empty($cfg['alsoEmail']),
                        'emailTemplate' => $cfg['templateKey'] ?? null, 'emailVars' => $vars,
                    ]);
                }
                break;
            case 'STATUS_UPDATE':
                if (!$ctx['project']) {
                    return;
                }
                transition_project(system_actor('Automation'), $ctx['project']['id'], (string)$cfg['toStatus'], ['comment' => "Automation “{$auto['name']}”", 'workspaceId' => $ws, 'quiet' => true]);
                break;
            case 'CREATE_TASK':
                if (!$ctx['project']) {
                    return;
                }
                $vars = automation_build_vars($ctx, '/admin');
                $assignee = ($cfg['assignee'] ?? null) === 'manager' ? $ctx['project']['managerId'] : (($cfg['assignee'] ?? null) === 'editor' ? (array_values(array_filter($ctx['project']['members'], fn($m) => $m['role'] !== 'MANAGER'))[0]['userId'] ?? null) : null);
                Db::insert('tasks', [
                    'workspaceId' => $ws, 'projectId' => $ctx['project']['id'], 'title' => fill_vars((string)($cfg['taskTitle'] ?? 'Follow up'), $vars),
                    'description' => !empty($cfg['taskDescription']) ? fill_vars((string)$cfg['taskDescription'], $vars) : null, 'assigneeId' => $assignee,
                    'priority' => $cfg['priority'] ?? 'NORMAL', 'dueDate' => !empty($cfg['dueInDays']) ? now_ms() + (int)$cfg['dueInDays'] * 86400000 : null,
                ], false);
                break;
        }
        Db::insert('automation_runs', ['automationId' => $action['automationId'], 'event' => $job['event'], 'entityId' => $entity, 'status' => 'ok'], false);
    } catch (Throwable $e) {
        Db::insert('automation_runs', ['automationId' => $action['automationId'], 'event' => $job['event'], 'entityId' => $entity, 'status' => 'error', 'error' => mb_substr($e->getMessage(), 0, 400)], false);
        throw $e;
    }
}
