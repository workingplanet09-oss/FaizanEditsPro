<?php
/**
 * Discovery-call booking and the internal calendar. The internal provider works out of the box (a meeting link comes from the
 * calendar.meeting_url_template setting in config.php); external calendars can be linked from that template.
 */
defined('FEP') or exit;

function meeting_link(string $code): ?string
{
    $tpl = (string)cfg('calendar.meeting_url_template', '');
    return $tpl !== '' ? str_replace(['{{code}}', '{code}'], $code, $tpl) : null;
}

/** @return array{enabled:bool,slots:array,timezone:string,minutes?:int} */
function available_slots(array $in): array
{
    $ws = workspace_id();
    $cfg = get_setting($ws, 'booking');
    if (empty($cfg['enabled'])) {
        return ['enabled' => false, 'slots' => [], 'timezone' => $cfg['timezone']];
    }
    $minutes = $cfg['types'][$in['type']]['minutes'] ?? $cfg['slotMinutes'];
    $now = now_ms();
    $earliest = $now + $cfg['minNoticeHours'] * 3600000;
    $start = ts_ms($in['from'] ?? null) ?? $now;
    $horizon = min((int)($in['days'] ?? $cfg['horizonDays']), 60);
    $end = $start + $horizon * 86400000;
    $booked = Db::rows("SELECT `startsAt`, `endsAt` FROM `meetings` WHERE `workspaceId` = ? AND `status` = 'SCHEDULED' AND `startsAt` < ? AND `endsAt` > ?", [$ws, db_dt($end), db_dt($start)]);
    $booked = array_map(fn($b) => [(int)ts_ms($b['startsAt']), (int)ts_ms($b['endsAt'])], $booked);
    $slots = [];
    $day0 = intdiv($start, 86400000) * 86400000;
    for ($d = $day0; $d < $end; $d += 86400000) {
        if (!in_array((int)gmdate('w', intdiv($d, 1000)), $cfg['days'], true)) {
            continue;
        }
        for ($m = $cfg['startHour'] * 60; $m + $minutes <= $cfg['endHour'] * 60; $m += $cfg['slotMinutes']) {
            $s = $d + $m * 60000;
            $e = $s + $minutes * 60000;
            if ($s < $earliest) {
                continue;
            }
            foreach ($booked as [$bs, $be]) {
                if ($bs < $e && $be > $s) {
                    continue 2;
                }
            }
            $slots[] = iso_dt($s);
        }
    }
    return ['enabled' => true, 'slots' => $slots, 'timezone' => $cfg['timezone'], 'minutes' => $minutes];
}

/** $in: type, startsAt, name, email, phone?, company?, notes?, timezone?, ip */
function book_meeting(array $in): array
{
    rate_limit("book:{$in['ip']}", 6, 3600000, 'Too many booking attempts. Please try again later.');
    $ws = workspace_id();
    $cfg = get_setting($ws, 'booking');
    if (empty($cfg['enabled'])) {
        throw new AppError('NOT_CONFIGURED', 'Online booking is switched off. Please use the contact form.');
    }
    $typeCfg = $cfg['types'][$in['type']] ?? null;
    if (!$typeCfg) {
        throw bad_request('Unknown meeting type.');
    }
    $startsAt = (int)ts_ms($in['startsAt']);
    $slots = available_slots(['type' => $in['type'], 'from' => $startsAt - 86400000, 'days' => 3])['slots'];
    if (!in_array(iso_dt($startsAt), $slots, true)) {
        throw new AppError('CONFLICT', 'That time was just taken. Please pick another slot.');
    }
    $endsAt = $startsAt + $typeCfg['minutes'] * 60000;
    $email = strtolower(trim($in['email']));
    $name = trim($in['name']);
    $client = Db::first('clients', ['workspaceId' => $ws, 'email' => $email]);
    $lead = $client ? null : Db::first('leads', ['sql' => "`workspaceId` = ? AND `email` = ? AND `status` NOT IN ('LOST','ARCHIVED','CONVERTED')", 'params' => [$ws, $email]], ['order' => '`createdAt` DESC']);
    $leadCreated = false;
    if (!$client && !$lead) {
        $year = (int)gmdate('Y');
        $seq = next_number($ws, "lead-{$year}", 0);
        $source = Db::first('lead_sources', ['key' => 'booking']);
        $lead = Db::insert('leads', [
            'workspaceId' => $ws, 'requestCode' => sprintf('REQ-%d-%04d', $year, $seq), 'name' => $name, 'email' => $email, 'phone' => $in['phone'] ?? null, 'company' => $in['company'] ?? null,
            'description' => $in['notes'] ?? null, 'sourceId' => $source['id'] ?? null, 'status' => 'CALL_SCHEDULED', 'temperature' => 'NEEDS_REVIEW',
        ]);
        Db::insert('lead_activities', ['leadId' => $lead['id'], 'type' => 'inquiry_submitted', 'title' => 'Booked a discovery call'], false);
        $leadCreated = true;
    }
    $code = strtolower(substr(preg_replace('/[^a-z0-9]/i', '', random_token(6)), 0, 8));
    $url = meeting_link($code);
    $meeting = Db::insert('meetings', [
        'workspaceId' => $ws, 'type' => $in['type'], 'title' => "{$typeCfg['label']} — {$name}", 'name' => $name, 'email' => $email, 'startsAt' => $startsAt, 'endsAt' => $endsAt,
        'timezone' => $in['timezone'] ?? null, 'meetingUrl' => $url, 'notes' => $in['notes'] ?? null, 'clientId' => $client['id'] ?? null, 'leadId' => $lead['id'] ?? null, 'status' => 'SCHEDULED',
    ]);
    $when = fmt_datetime($startsAt) . ' UTC';
    if ($lead) {
        Db::insert('lead_activities', ['leadId' => $lead['id'], 'type' => 'call_scheduled', 'title' => "{$typeCfg['label']} scheduled for {$when}", 'metadata' => ['meetingId' => $meeting['id']]], false);
        if (in_array($lead['status'], ['NEW', 'CONTACTED'], true)) {
            Db::update('leads', ['id' => $lead['id']], ['status' => 'CALL_SCHEDULED']);
        }
    }
    queue_email(['workspaceId' => $ws, 'toEmail' => $email, 'templateKey' => 'meeting_booked', 'vars' => ['client_name' => $name, 'meeting_type' => $typeCfg['label'], 'meeting_time' => $when, 'meeting_url' => $url ?? absolute_url('/contact'), 'dashboard_url' => absolute_url('/dashboard')]]);
    $staff = Db::col("SELECT u.`id` FROM `users` u WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`key` IN ('super_admin','admin','project_manager'))", [$ws]);
    notify(['workspaceId' => $ws, 'userIds' => $staff, 'category' => 'SYSTEM', 'type' => 'meeting.booked', 'title' => "{$typeCfg['label']} booked: {$name}", 'message' => $when, 'link' => '/admin/calendar', 'email' => false]);
    if ($leadCreated && $lead) {
        emit('lead.created', ['workspaceId' => $ws, 'leadId' => $lead['id']]);
    }
    return ['id' => $meeting['id'], 'startsAt' => $meeting['startsAt'], 'endsAt' => $meeting['endsAt'], 'meetingUrl' => $url, 'typeLabel' => $typeCfg['label']];
}

/** $opts: from?, to?, status? */
function list_meetings(Actor $actor, array $opts = []): array
{
    assert_can($actor, 'leads:read');
    $where = ['m.`workspaceId` = ?'];
    $p = [$actor->workspaceId];
    if (!empty($opts['status'])) {
        $where[] = 'm.`status` = ?';
        $p[] = $opts['status'];
    }
    if (!empty($opts['from'])) {
        $where[] = 'm.`startsAt` >= ?';
        $p[] = to_db_dt($opts['from']);
    }
    if (!empty($opts['to'])) {
        $where[] = 'm.`startsAt` <= ?';
        $p[] = to_db_dt($opts['to']);
    }
    $rows = Db::rows('SELECT m.*, l.`id` AS l_id, l.`name` AS l_name, c.`id` AS c_id, c.`companyName` AS c_companyName FROM `meetings` m LEFT JOIN `leads` l ON l.`id` = m.`leadId` LEFT JOIN `clients` c ON c.`id` = m.`clientId` WHERE ' . implode(' AND ', $where) . ' ORDER BY m.`startsAt` ASC LIMIT 300', $p);
    return array_map(fn($r) => Db::hydrate('meetings', array_intersect_key($r, Db::table('meetings')['cols'])) + ['lead' => $r['l_id'] ? ['id' => $r['l_id'], 'name' => $r['l_name']] : null, 'client' => $r['c_id'] ? ['id' => $r['c_id'], 'companyName' => $r['c_companyName']] : null], $rows);
}

/** $in: type, title, startsAt, minutes?, clientId?, leadId?, projectId?, notes? */
function create_meeting(Actor $actor, array $in): array
{
    assert_can($actor, 'leads:write');
    $cfg = get_setting($actor->workspaceId, 'booking');
    $minutes = $in['minutes'] ?? ($cfg['types'][$in['type']]['minutes'] ?? 30);
    $startsAt = (int)ts_ms($in['startsAt']);
    foreach (['clientId' => 'clients', 'leadId' => 'leads', 'projectId' => 'projects'] as $k => $table) {
        if (!empty($in[$k]) && !Db::exists($table, ['id' => $in[$k], 'workspaceId' => $actor->workspaceId])) {
            throw not_found(ucfirst(substr($k, 0, -2)));
        }
    }
    $code = strtolower(substr(preg_replace('/[^a-z0-9]/i', '', random_token(6)), 0, 8));
    $m = Db::insert('meetings', [
        'workspaceId' => $actor->workspaceId, 'type' => $in['type'], 'title' => $in['title'], 'startsAt' => $startsAt, 'endsAt' => $startsAt + $minutes * 60000, 'meetingUrl' => meeting_link($code),
        'notes' => $in['notes'] ?? null, 'clientId' => $in['clientId'] ?? null, 'leadId' => $in['leadId'] ?? null, 'projectId' => $in['projectId'] ?? null, 'hostId' => $actor->userId,
    ]);
    if (!empty($in['leadId'])) {
        Db::insert('lead_activities', ['leadId' => $in['leadId'], 'type' => 'call_scheduled', 'title' => "{$in['title']} scheduled", 'actorId' => $actor->userId], false);
    }
    return $m;
}

/** $patch: status?, notes?, startsAt? */
function update_meeting(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'leads:write');
    $m = Db::first('meetings', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$m) {
        throw not_found('Meeting');
    }
    $data = [];
    foreach (['status', 'notes'] as $k) {
        if (array_key_exists($k, $patch)) {
            $data[$k] = $patch[$k];
        }
    }
    if (!empty($patch['startsAt'])) {
        $s = (int)ts_ms($patch['startsAt']);
        $data['startsAt'] = $s;
        $data['endsAt'] = $s + ((int)ts_ms($m['endsAt']) - (int)ts_ms($m['startsAt']));
    }
    Db::update('meetings', ['id' => $id], $data);
    return Db::first('meetings', ['id' => $id]);
}
