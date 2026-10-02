<?php
/**
 * Files: validated uploads (type allow-list + content sniffing), versions, folders, delivery gating, share links, deliverables.
 * A file is only ever handed out through a signed, short-lived link minted after the ownership check for the asking user.
 */
defined('FEP') or exit;

const FEP_BLOCKED_EXT = '/\.(exe|msi|bat|cmd|com|scr|pif|ps1|psm1|sh|bash|jar|dll|so|apk|app|vbs|vbe|wsf|lnk|reg|hta|cpl|dmg|pkg|deb|rpm|iso|php[0-9]?|phtml|phar|pht|cgi|pl|py|htaccess)$/i';
const FEP_ALLOWED_PREFIX = ['video/', 'audio/', 'image/'];
const FEP_ALLOWED_EXACT = [
    'application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'text/vtt', 'application/x-subrip', 'application/json', 'font/otf', 'font/ttf', 'font/woff', 'font/woff2',
    'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
];
/** Creative project files browsers report as octet-stream. */
const FEP_EXT_ALLOW = '/\.(prproj|aep|aepx|drp|fcpxml|fcpbundle|mogrt|psd|ai|indd|srt|vtt|ass|lut|cube|otf|ttf|woff2?|braw|r3d|mxf|wav|aif|aiff|flac|mkv|mov|mp4|m4v|webm|avi|zip|7z|rar|pdf|docx?|xlsx?|pptx?|png|jpe?g|webp|gif|heic|svg|txt|csv|json)$/i';
const FEP_LEAD_ALLOWED = '/\.(pdf|docx?|png|jpe?g|webp|gif|heic|zip|mp4|mov|m4v|webm|mkv|avi|mp3|wav|m4a|aac|flac|txt)$/i';
/** Largest file sent to the (optional) malware scanner in one request. */
const FEP_MAX_SCAN_BYTES = 33554432;

function safe_filename(string $name): string
{
    $base = str_replace(['\\', '/'], '_', $name);
    $base = preg_replace('/[^\w.\- ]+/u', '_', $base) ?? '';
    $base = preg_replace('/\s+/', '_', $base) ?? '';
    $base = preg_replace('/_+/', '_', $base) ?? '';
    $base = preg_replace('/\.{2,}/', '.', $base) ?? '';
    $base = ltrim($base, '.');
    $base = $base === '' ? 'file' : $base;
    return mb_strlen($base) > 120 ? mb_substr($base, -120) : $base;
}

function assert_file_allowed(string $filename, string $mime, int $size, array $opts): void
{
    if ($filename === '' || mb_strlen($filename) > 255) {
        throw bad_request('File name is missing or too long.');
    }
    if (preg_match(FEP_BLOCKED_EXT, $filename)) {
        throw new AppError('UNSUPPORTED', "That file type isn't allowed for security reasons.");
    }
    $allowedType = in_array($mime, FEP_ALLOWED_EXACT, true) || preg_match(FEP_EXT_ALLOW, $filename);
    foreach (FEP_ALLOWED_PREFIX as $p) {
        $allowedType = $allowedType || str_starts_with($mime, $p);
    }
    if (!$allowedType) {
        throw new AppError('UNSUPPORTED', "That file type isn't supported. Upload video, audio, images, PDFs, documents or ZIP archives.");
    }
    if (!empty($opts['lead']) && !preg_match(FEP_LEAD_ALLOWED, $filename)) {
        throw new AppError('UNSUPPORTED', 'Attach PDF, DOCX, image, ZIP, video or audio files.');
    }
    if ($size <= 0) {
        throw bad_request('The file appears to be empty.');
    }
    if ($size > $opts['maxBytes']) {
        $gb = $opts['maxBytes'] / 1073741824;
        throw new AppError('BAD_REQUEST', 'That file is larger than the ' . ($opts['maxBytes'] >= 1073741824 ? number_format($gb, 0) : number_format($gb, 1)) . ' GB limit.');
    }
}

function max_upload_bytes(): int
{
    return max(1, (int)cfg('storage.max_upload_mb', 2048)) * 1048576;
}

/** @param array $a asset row, optionally with 'folder' and 'uploadedBy' */
function asset_dto(array $a): array
{
    return [
        'id' => $a['id'], 'projectId' => $a['projectId'], 'clientId' => $a['clientId'], 'folderKey' => $a['folder']['key'] ?? null, 'folderName' => $a['folder']['name'] ?? null,
        'filename' => $a['filename'], 'displayName' => $a['displayName'], 'mimeType' => $a['mimeType'], 'sizeBytes' => (int)$a['sizeBytes'], 'version' => $a['version'], 'status' => $a['status'],
        'isDeliverable' => $a['isDeliverable'], 'deliverableLabel' => $a['deliverableLabel'], 'visibleToClient' => $a['visibleToClient'], 'hasThumbnail' => (bool)$a['thumbnailKey'],
        'durationMs' => $a['durationMs'], 'shared' => (bool)$a['sharedToken'], 'uploadedBy' => $a['uploadedBy']['name'] ?? null, 'createdAt' => $a['createdAt'],
    ];
}

/** Attaches folder + uploader to a batch of asset rows. */
function assets_with_relations(array $rows): array
{
    if (!$rows) {
        return [];
    }
    $folders = [];
    $fids = array_values(array_unique(array_filter(array_column($rows, 'folderId'))));
    if ($fids) {
        [$ph, $p] = Db::in($fids);
        foreach (Db::rows("SELECT `id`, `key`, `name` FROM `asset_folders` WHERE `id` IN {$ph}", $p) as $f) {
            $folders[$f['id']] = ['key' => $f['key'], 'name' => $f['name']];
        }
    }
    $users = [];
    $uids = array_values(array_unique(array_filter(array_column($rows, 'uploadedById'))));
    if ($uids) {
        [$ph, $p] = Db::in($uids);
        foreach (Db::rows("SELECT `id`, `name` FROM `users` WHERE `id` IN {$ph}", $p) as $u) {
            $users[$u['id']] = ['name' => $u['name']];
        }
    }
    return array_map(function ($a) use ($folders, $users) {
        $a['folder'] = $a['folderId'] ? ($folders[$a['folderId']] ?? null) : null;
        $a['uploadedBy'] = $a['uploadedById'] ? ($users[$a['uploadedById']] ?? null) : null;
        return $a;
    }, $rows);
}

function asset_with_relations(array $a): array { return assets_with_relations([$a])[0]; }

// ───────────────────────────── upload lifecycle ─────────────────────────────

function folder_id(string $projectId, string $key): string
{
    $known = null;
    $idx = 99;
    foreach (app_data('site-defaults')['DEFAULT_PROJECT_FOLDERS'] as $i => $f) {
        if ($f['key'] === $key) {
            $known = $f;
            $idx = $i;
        }
    }
    $name = $known['name'] ?? ($key === 'drafts' ? 'Drafts' : $key);
    Db::upsert('asset_folders', ['projectId' => $projectId, 'key' => $key, 'name' => $name, 'sortOrder' => $idx], []);
    return (string)Db::val('SELECT `id` FROM `asset_folders` WHERE `projectId` = ? AND `key` = ?', [$projectId, $key]);
}

/** Stored object names are random: nothing the uploader typed ever becomes part of a path (no executable extensions on disk). */
function new_storage_key(string $prefix, string $id): string
{
    return "{$prefix}/{$id}/blob";
}

/**
 * $in: purpose (asset|version|deliverable|brand|lead_reference), projectId, clientId, draftToken, folderKey, filename, size, mimeType, fileRequestId, label
 * @return array{asset:array,upload:array,fileRequestId?:?string}
 */
function request_upload(?Actor $actor, string $ip, array $in): array
{
    $purpose = $in['purpose'] ?? 'asset';
    $id = cuid();
    $name = safe_filename($in['filename']);
    $mime = strtolower(mb_substr(($in['mimeType'] ?? '') ?: 'application/octet-stream', 0, 120));
    $size = (int)$in['size'];
    $display = mb_substr($in['filename'], 0, 200);
    $storage = storage();

    // ── anonymous inquiry attachments ──
    if ($purpose === 'lead_reference') {
        if (empty($in['draftToken']) || !preg_match('/^[A-Za-z0-9_-]{16,64}$/', $in['draftToken'])) {
            throw bad_request('Missing upload session.');
        }
        rate_limit("lead-upload:{$ip}", 40, 3600000, 'Too many uploads. Please try again in a bit.');
        if (Db::count('assets', ['sql' => '`draftToken` = ? AND `deletedAt` IS NULL', 'params' => [$in['draftToken']]]) >= 10) {
            throw bad_request('You can attach up to 10 files to a request. Add more after I reply.');
        }
        assert_file_allowed($name, $mime, $size, ['lead' => true, 'maxBytes' => min(500 * 1048576, max_upload_bytes())]);
        $ws = workspace_id();
        $key = new_storage_key("ws/{$ws}/inquiries/{$in['draftToken']}", $id);
        $asset = Db::insert('assets', ['id' => $id, 'workspaceId' => $ws, 'draftToken' => $in['draftToken'], 'filename' => $name, 'displayName' => $display, 'storageKey' => $key, 'mimeType' => $mime, 'sizeBytes' => $size, 'status' => 'UPLOADING']);
        return ['asset' => asset_dto($asset), 'upload' => $storage->uploadTarget($key, $mime, $size)];
    }

    if (!$actor) {
        throw new AppError('UNAUTHENTICATED', 'Please sign in to upload files.');
    }
    $settings = get_setting($actor->workspaceId, 'workflow');
    $maxBytes = min(max_upload_bytes(), (int)$settings['maxUploadMb'] * 1048576);
    assert_file_allowed($name, $mime, $size, ['maxBytes' => $maxBytes]);

    // ── brand kit assets (attached to the client, not a project) ──
    if ($purpose === 'brand') {
        if (empty($in['clientId'])) {
            throw bad_request('clientId is required.');
        }
        $client = Db::first('clients', ['id' => $in['clientId'], 'workspaceId' => $actor->workspaceId]);
        if (!$client) {
            throw not_found('Client');
        }
        if ($actor->isStaff) {
            assert_can($actor, 'clients:write');
        } else {
            assert_org_action($actor, $client['organizationId'], 'manage_projects');
        }
        $key = new_storage_key("ws/{$actor->workspaceId}/clients/{$client['id']}", $id);
        $asset = Db::insert('assets', ['id' => $id, 'workspaceId' => $actor->workspaceId, 'clientId' => $client['id'], 'uploadedById' => $actor->userId, 'filename' => $name, 'displayName' => $display, 'storageKey' => $key, 'mimeType' => $mime, 'sizeBytes' => $size, 'status' => 'UPLOADING']);
        return ['asset' => asset_dto($asset), 'upload' => $storage->uploadTarget($key, $mime, $size)];
    }

    // ── project files / versions / deliverables ──
    if (empty($in['projectId'])) {
        throw bad_request('projectId is required.');
    }
    $project = require_project($actor, $in['projectId']);
    if ($actor->isStaff) {
        if ($purpose === 'version') {
            assert_can($actor, 'versions:upload');
        } else {
            assert_can($actor, 'files:write');
        }
        if ($purpose === 'deliverable' && !($actor->can('files:write') && ($actor->can('projects:transition') || $actor->can('versions:upload')))) {
            throw forbidden();
        }
    } else {
        if ($purpose !== 'asset') {
            throw forbidden();
        }
        assert_org_action($actor, $project['organizationId'], 'upload');
        if (in_array($project['status'], ['DELIVERED', 'ARCHIVED', 'CANCELLED'], true)) {
            throw new AppError('GATED', 'This project is closed. Start a new project to send more files.');
        }
    }
    $fKey = $purpose === 'version' ? 'drafts' : ($purpose === 'deliverable' ? 'final-exports' : (($in['folderKey'] ?? '') ?: 'raw-footage'));
    if (!in_array($fKey, array_merge(array_column(app_data('site-defaults')['DEFAULT_PROJECT_FOLDERS'], 'key'), ['drafts']), true)) {
        throw bad_request('Unknown folder.');
    }
    ensure_folders($project['id']);
    $fid = folder_id($project['id'], $fKey);
    $key = new_storage_key("ws/{$actor->workspaceId}/projects/{$project['id']}", $id);
    $isDeliverable = $purpose === 'deliverable';
    $asset = Db::insert('assets', [
        'id' => $id, 'workspaceId' => $actor->workspaceId, 'projectId' => $project['id'], 'clientId' => $project['clientId'], 'folderId' => $fid, 'uploadedById' => $actor->userId,
        'filename' => $name, 'displayName' => $display, 'storageKey' => $key, 'mimeType' => $mime, 'sizeBytes' => $size, 'status' => 'UPLOADING',
        'isDeliverable' => $isDeliverable, 'deliverableLabel' => $isDeliverable ? ($in['label'] ?? null) : null,
        // deliverables stay hidden until the studio publishes them
        'visibleToClient' => !$isDeliverable,
    ]);
    return ['asset' => asset_dto(asset_with_relations($asset)), 'upload' => $storage->uploadTarget($key, $mime, $size), 'fileRequestId' => $in['fileRequestId'] ?? null];
}

/** The browser calls this after its upload finishes; I verify the object really exists and is the right size. */
function complete_upload(?Actor $actor, string $assetId, array $in = []): array
{
    $asset = Db::first('assets', ['id' => $assetId]);
    if (!$asset) {
        throw not_found('File');
    }
    if ($asset['status'] !== 'UPLOADING') {
        return asset_dto(asset_with_relations($asset));
    }
    // Authorisation mirrors request time: same anonymous token, or same actor with access to the project/client.
    if ($asset['draftToken']) {
        if (($in['draftToken'] ?? null) !== $asset['draftToken']) {
            throw not_found('File');
        }
    } else {
        if (!$actor) {
            throw new AppError('UNAUTHENTICATED', 'Please sign in.');
        }
        if ($asset['uploadedById'] !== $actor->userId && !($actor->isStaff && $actor->can('files:write'))) {
            throw not_found('File');
        }
        if ($asset['workspaceId'] !== $actor->workspaceId) {
            throw not_found('File');
        }
    }
    $head = storage()->head($asset['storageKey']);
    if (!$head) {
        throw new AppError('BAD_REQUEST', "The upload didn't arrive. Please try again.");
    }
    if ($head['size'] !== (int)$asset['sizeBytes']) {
        storage()->remove($asset['storageKey']);
        Db::update('assets', ['id' => $asset['id']], ['status' => 'FAILED']);
        throw new AppError('BAD_REQUEST', 'The uploaded file was incomplete. Please try again.');
    }
    // The declared type and extension come from the uploader. Look at the actual bytes: programs and web pages are refused.
    $problem = content_problem(sniff_content(storage()->readHead($asset['storageKey'], 512)), $asset['mimeType'], $asset['filename']);
    if ($problem) {
        storage()->remove($asset['storageKey']);
        Db::update('assets', ['id' => $asset['id']], ['status' => 'FAILED', 'scanStatus' => 'rejected']);
        audit($actor ?? system_actor('Upload check'), ['workspaceId' => $asset['workspaceId'], 'action' => 'asset.rejected', 'entityType' => 'asset', 'entityId' => $asset['id'], 'message' => "{$asset['displayName']} was rejected: {$problem}"]);
        throw new AppError('UNSUPPORTED', "I couldn't accept {$asset['displayName']}. {$problem}");
    }
    // version detection: Interview_Final.mp4 / _V2 / _V3 are one file family
    ['group' => $group, 'version' => $parsed] = parse_versioned_name($asset['displayName']);
    $version = $parsed;
    if ($asset['projectId']) {
        $latest = Db::rowRaw('SELECT `version` FROM `assets` WHERE `projectId` = ? AND `versionGroup` = ? AND `deletedAt` IS NULL AND `id` <> ? AND `folderId` <=> ? ORDER BY `version` DESC LIMIT 1', [$asset['projectId'], $group, $asset['id'], $asset['folderId']]);
        if ($latest) {
            $version = max((int)$latest['version'] + 1, $parsed);
        }
    }
    $scanNeeded = cfg('scan.provider', 'none') !== 'none';
    Db::update('assets', ['id' => $asset['id']], [
        'status' => $scanNeeded ? 'PROCESSING' : 'READY', 'scanStatus' => $scanNeeded ? 'pending' : 'skipped', 'versionGroup' => $group, 'version' => $version,
        'durationMs' => isset($in['durationMs']) ? (int)$in['durationMs'] : $asset['durationMs'],
    ]);
    $updated = asset_with_relations(Db::first('assets', ['id' => $asset['id']]));
    if ($scanNeeded) {
        enqueue_job('asset.postprocess', ['assetId' => $asset['id']]);
    }
    if ($asset['projectId'] && $actor) {
        $project = Db::first('projects', ['id' => $asset['projectId']]);
        if (!empty($in['fileRequestId'])) {
            try {
                fulfil_file_request($actor, $in['fileRequestId'], $asset['id']);
            } catch (Throwable) {
            }
        }
        $folderKey = $updated['folder']['key'] ?? null;
        if ($folderKey !== 'drafts' && $folderKey !== 'final-exports') {
            $recent = Db::first('activity_logs', ['sql' => "`projectId` = ? AND `type` = 'files.uploaded' AND `actorId` = ? AND `createdAt` > ?", 'params' => [$asset['projectId'], $actor->userId, db_dt(now_ms() - 600000)]]);
            log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'files.uploaded', 'message' => "{$actor->name} uploaded {$asset['displayName']}", 'projectId' => $asset['projectId'], 'clientId' => $project['clientId'], 'visibility' => 'CLIENT', 'entityType' => 'asset', 'entityId' => $asset['id']]);
            if (!$recent && !$actor->isStaff) {
                emit('files.uploaded', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $asset['projectId'], 'clientId' => $project['clientId'], 'data' => ['detail' => $asset['displayName']]]);
            }
        }
    }
    return asset_dto($updated);
}

/** Attach anonymous inquiry uploads to the lead that was just created. */
function attach_draft_assets_to_lead(string $draftToken, string $leadId): int
{
    return Db::exec('UPDATE `assets` SET `leadId` = ? WHERE `draftToken` = ? AND `leadId` IS NULL AND `deletedAt` IS NULL', [$leadId, $draftToken]);
}

// thumbnails (captured in the browser from the video, uploaded via a second signed link)
function request_thumbnail_upload(Actor $actor, string $assetId): array
{
    $a = get_asset_or_throw($actor, $assetId);
    if ($a['uploadedById'] !== $actor->userId && !$actor->can('files:write')) {
        throw forbidden();
    }
    $key = $a['storageKey'] . '.thumb.jpg';
    return ['key' => $key, 'upload' => storage()->uploadTarget($key, 'image/jpeg', 2 * 1048576)];
}

function confirm_thumbnail(Actor $actor, string $assetId): array
{
    $a = get_asset_or_throw($actor, $assetId);
    $key = $a['storageKey'] . '.thumb.jpg';
    if (!storage()->head($key)) {
        throw bad_request('Thumbnail not uploaded.');
    }
    // only a real JPEG/PNG/WebP image is accepted as a thumbnail
    $head = storage()->readHead($key, 12);
    if (!(str_starts_with($head, "\xFF\xD8\xFF") || str_starts_with($head, "\x89PNG") || (str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP'))) {
        storage()->remove($key);
        throw bad_request('Thumbnail must be an image.');
    }
    Db::update('assets', ['id' => $assetId], ['thumbnailKey' => $key]);
    return ['ok' => true];
}

// ───────────────────────────── read ─────────────────────────────

function get_asset_or_throw(Actor $actor, string $id): array
{
    [$s, $p] = scope_asset($actor, 'a');
    $row = Db::rowRaw("SELECT a.* FROM `assets` a WHERE a.`id` = ? AND {$s}", [$id, ...$p]);
    if (!$row) {
        throw not_found('File');
    }
    $a = asset_with_relations(Db::hydrate('assets', $row));
    $a['project'] = $a['projectId'] ? Db::first('projects', ['id' => $a['projectId']]) : null;
    return $a;
}

function list_folders(Actor $actor, string $projectId): array
{
    require_project($actor, $projectId);
    ensure_folders($projectId);
    [$s, $p] = scope_asset($actor, 'a');
    $counts = [];
    foreach (Db::rows("SELECT a.`folderId`, COUNT(*) AS n FROM `assets` a WHERE a.`projectId` = ? AND {$s} GROUP BY a.`folderId`", [$projectId, ...$p]) as $r) {
        $counts[$r['folderId']] = (int)$r['n'];
    }
    return array_map(fn($f) => ['id' => $f['id'], 'key' => $f['key'], 'name' => $f['name'], 'count' => $counts[$f['id']] ?? 0], Db::find('asset_folders', ['sql' => "`projectId` = ? AND `key` <> 'drafts'", 'params' => [$projectId]], ['order' => '`sortOrder` ASC']));
}

/** $q: folderKey, q, page, pageSize, includeDrafts, deliverablesOnly */
function list_assets(Actor $actor, string $projectId, array $q = []): array
{
    require_project($actor, $projectId);
    $pageSize = min((int)($q['pageSize'] ?? 50), 100) ?: 50;
    $page = max((int)($q['page'] ?? 1), 1);
    [$s, $params] = scope_asset($actor, 'a');
    $where = ['a.`projectId` = ?', $s];
    array_unshift($params, $projectId);
    $join = 'LEFT JOIN `asset_folders` f ON f.`id` = a.`folderId`';
    if (!empty($q['folderKey'])) {
        $where[] = 'f.`key` = ?';
        $params[] = $q['folderKey'];
    } elseif (empty($q['includeDrafts'])) {
        $where[] = "(f.`id` IS NULL OR f.`key` <> 'drafts')";
    }
    if (!empty($q['q'])) {
        $where[] = 'a.`displayName` LIKE ?';
        $params[] = like_pattern((string)$q['q']);
    }
    if (!empty($q['deliverablesOnly'])) {
        $where[] = 'a.`isDeliverable` = 1';
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $rows = Db::hydrateAll('assets', Db::rows("SELECT a.* FROM `assets` a {$join} WHERE {$w} ORDER BY a.`createdAt` DESC LIMIT " . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize), $params));
    $total = (int)Db::val("SELECT COUNT(*) FROM `assets` a {$join} WHERE {$w}", $params);
    return ['items' => array_map('asset_dto', assets_with_relations($rows)), 'total' => $total, 'page' => $page, 'pageSize' => $pageSize, 'pages' => max(1, (int)ceil($total / $pageSize))];
}

/** All files across the actor's projects — used by the top-level Files pages. $q: q, projectId, page, pageSize */
function list_all_assets(Actor $actor, array $q = []): array
{
    $pageSize = min((int)($q['pageSize'] ?? 40), 100) ?: 40;
    $page = max((int)($q['page'] ?? 1), 1);
    [$s, $params] = scope_asset($actor, 'a');
    $where = [$s, 'a.`projectId` IS NOT NULL', "(f.`id` IS NULL OR f.`key` <> 'drafts')"];
    if (!empty($q['projectId'])) {
        $where[] = 'a.`projectId` = ?';
        $params[] = $q['projectId'];
    }
    if (!empty($q['q'])) {
        $where[] = 'a.`displayName` LIKE ?';
        $params[] = like_pattern((string)$q['q']);
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $from = 'FROM `assets` a LEFT JOIN `asset_folders` f ON f.`id` = a.`folderId`';
    $rows = Db::hydrateAll('assets', Db::rows("SELECT a.* {$from} WHERE {$w} ORDER BY a.`createdAt` DESC LIMIT " . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize), $params));
    $total = (int)Db::val("SELECT COUNT(*) {$from} WHERE {$w}", $params);
    $projects = [];
    $pids = array_values(array_unique(array_column($rows, 'projectId')));
    if ($pids) {
        [$ph, $pp] = Db::in($pids);
        foreach (Db::rows("SELECT `id`, `name`, `code` FROM `projects` WHERE `id` IN {$ph}", $pp) as $pr) {
            $projects[$pr['id']] = $pr;
        }
    }
    $items = array_map(fn($a) => asset_dto($a) + ['project' => $projects[$a['projectId']] ?? null], assets_with_relations($rows));
    return ['items' => $items, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize, 'pages' => max(1, (int)ceil($total / $pageSize))];
}

function asset_versions(Actor $actor, string $id): array
{
    $a = get_asset_or_throw($actor, $id);
    if (!$a['versionGroup'] || !$a['projectId']) {
        return [asset_dto($a)];
    }
    [$s, $p] = scope_asset($actor, 'a');
    $rows = Db::hydrateAll('assets', Db::rows("SELECT a.* FROM `assets` a WHERE a.`projectId` = ? AND a.`versionGroup` = ? AND a.`folderId` <=> ? AND {$s} ORDER BY a.`version` ASC", [$a['projectId'], $a['versionGroup'], $a['folderId'], ...$p]));
    return array_map('asset_dto', assets_with_relations($rows));
}

// ───────────────────────────── delivery gating ─────────────────────────────

/** Final deliverables unlock only after approval AND payment conditions (or an explicit admin override). @return array{ok:bool,reason?:string} */
function deliverables_unlocked(string $projectId, string $workspaceId): array
{
    $project = Db::first('projects', ['id' => $projectId]) ?? throw not_found('Project');
    if ($project['gateOverride']) {
        return ['ok' => true];
    }
    if (!in_array($project['status'], ['APPROVED', 'DELIVERED'], true)) {
        return ['ok' => false, 'reason' => 'Final files unlock once you approve the final version.'];
    }
    $wf = get_setting($workspaceId, 'workflow');
    if (!empty($wf['requirePaymentBeforeDelivery'])) {
        if (Db::count('invoices', ['sql' => "`projectId` = ? AND `status` IN ('SENT','VIEWED','PARTIALLY_PAID','OVERDUE')", 'params' => [$projectId]])) {
            return ['ok' => false, 'reason' => 'Final files unlock once all invoices for this project are paid.'];
        }
    }
    return ['ok' => true];
}

/** A short-lived signed URL. Every access path (portal, share link) funnels through here. */
function get_download_url(Actor $actor, string $id, array $opts = []): array
{
    $a = get_asset_or_throw($actor, $id);
    if ($a['status'] === 'QUARANTINED') {
        throw new AppError('GATED', 'This file was quarantined by the malware scanner.');
    }
    if ($a['status'] !== 'READY') {
        throw new AppError('GATED', 'This file is still processing.');
    }
    if ($a['isDeliverable'] && !$actor->isStaff && $a['projectId']) {
        if (!$a['visibleToClient']) {
            throw not_found('File');
        }
        $gate = deliverables_unlocked($a['projectId'], $a['workspaceId']);
        if (!$gate['ok']) {
            throw new AppError('GATED', $gate['reason'] ?? 'Not available yet.');
        }
    }
    $previewable = preg_match('#^(video|audio)/#', $a['mimeType']) || (str_starts_with($a['mimeType'], 'image/') && $a['mimeType'] !== 'image/svg+xml') || $a['mimeType'] === 'application/pdf';
    $url = storage()->downloadUrl($a['storageKey'], ['filename' => $a['displayName'], 'contentType' => $a['mimeType'], 'inline' => !empty($opts['inline']) && $previewable]);
    if ($a['isDeliverable']) {
        audit($actor, ['workspaceId' => $a['workspaceId'], 'action' => 'deliverable.downloaded', 'entityType' => 'asset', 'entityId' => $a['id'], 'message' => "{$actor->name} downloaded {$a['displayName']}"]);
        if (!$actor->isStaff && $a['projectId']) {
            log_activity($actor, ['workspaceId' => $a['workspaceId'], 'type' => 'deliverable.downloaded', 'message' => "{$actor->name} downloaded {$a['displayName']}", 'projectId' => $a['projectId'], 'visibility' => 'CLIENT']);
        }
    }
    return ['url' => $url, 'filename' => $a['displayName'], 'expiresInSec' => 3600];
}

function get_thumbnail_url(Actor $actor, string $id): array
{
    $a = get_asset_or_throw($actor, $id);
    if ($a['thumbnailKey']) {
        return ['url' => storage()->downloadUrl($a['thumbnailKey'], ['inline' => true, 'contentType' => 'image/jpeg', 'expiresSec' => 3600])];
    }
    if (str_starts_with($a['mimeType'], 'image/') && $a['mimeType'] !== 'image/svg+xml' && $a['status'] === 'READY') {
        return ['url' => storage()->downloadUrl($a['storageKey'], ['inline' => true, 'contentType' => $a['mimeType'], 'expiresSec' => 3600])];
    }
    return ['url' => null];
}

// ───────────────────────────── manage ─────────────────────────────

function assert_can_manage_asset(Actor $actor, array $a, string $action): void
{
    if ($actor->isStaff) {
        assert_can($actor, $action === 'delete' ? 'files:delete' : 'files:write');
        return;
    }
    // clients may manage only what they uploaded themselves, and only while the project is open
    if ($a['uploadedById'] !== $actor->userId) {
        throw forbidden('You can only change files you uploaded.');
    }
    if ($a['project'] && in_array($a['project']['status'], ['DELIVERED', 'ARCHIVED', 'CANCELLED'], true)) {
        throw new AppError('GATED', 'This project is closed.');
    }
    if ($a['project']) {
        assert_org_action($actor, $a['project']['organizationId'], 'upload');
    }
}

function rename_asset(Actor $actor, string $id, string $displayName): array
{
    $a = get_asset_or_throw($actor, $id);
    assert_can_manage_asset($actor, $a, 'edit');
    ['group' => $group] = parse_versioned_name($displayName);
    Db::update('assets', ['id' => $id], ['displayName' => mb_substr($displayName, 0, 200), 'versionGroup' => $group]);
    return asset_dto(asset_with_relations(Db::first('assets', ['id' => $id])));
}

function move_asset(Actor $actor, string $id, string $folderKey): array
{
    $a = get_asset_or_throw($actor, $id);
    if (!$a['projectId']) {
        throw bad_request('Only project files can be moved.');
    }
    assert_can_manage_asset($actor, $a, 'edit');
    if (!in_array($folderKey, array_column(app_data('site-defaults')['DEFAULT_PROJECT_FOLDERS'], 'key'), true)) {
        throw bad_request('Unknown folder.');
    }
    Db::update('assets', ['id' => $id], ['folderId' => folder_id($a['projectId'], $folderKey)]);
    return asset_dto(asset_with_relations(Db::first('assets', ['id' => $id])));
}

function delete_asset(Actor $actor, string $id): array
{
    $a = get_asset_or_throw($actor, $id);
    assert_can_manage_asset($actor, $a, 'delete');
    if (Db::count('video_versions', ['assetId' => $id])) {
        throw new AppError('CONFLICT', "This file is used by a video version and can't be deleted.");
    }
    Db::update('assets', ['id' => $id], ['deletedAt' => now_ms(), 'status' => 'DELETED', 'sharedToken' => null]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'asset.deleted', 'entityType' => 'asset', 'entityId' => $id, 'message' => "{$actor->name} deleted {$a['displayName']}"]);
    storage()->remove($a['storageKey']);
    if ($a['thumbnailKey']) {
        storage()->remove($a['thumbnailKey']);
    }
    return ['ok' => true];
}

function share_asset(Actor $actor, string $id, bool $enable = true): array
{
    $a = get_asset_or_throw($actor, $id);
    if (!$actor->isStaff && $a['project']) {
        assert_org_action($actor, $a['project']['organizationId'], 'view');
    }
    if ($a['isDeliverable'] && !$a['visibleToClient']) {
        throw forbidden();
    }
    $token = $enable ? ($a['sharedToken'] ?? random_token(24)) : null;
    Db::update('assets', ['id' => $id], ['sharedToken' => $token]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => $enable ? 'asset.shared' : 'asset.unshared', 'entityType' => 'asset', 'entityId' => $id, 'message' => "{$actor->name} " . ($enable ? 'created a share link for' : 'revoked the share link for') . " {$a['displayName']}"]);
    return ['url' => $token ? absolute_url("/s/{$token}") : null];
}

/** Resolves a public share token to a fresh signed URL (still honours delivery gating). */
function resolve_share(string $token): array
{
    if (!preg_match('/^[A-Za-z0-9_-]{16,64}$/', $token)) {
        throw not_found('Shared file');
    }
    $a = Db::first('assets', ['sql' => "`sharedToken` = ? AND `deletedAt` IS NULL AND `status` = 'READY'", 'params' => [$token]]);
    if (!$a) {
        throw not_found('Shared file');
    }
    if ($a['isDeliverable'] && $a['projectId']) {
        $gate = deliverables_unlocked($a['projectId'], $a['workspaceId']);
        if (!$gate['ok']) {
            throw new AppError('GATED', $gate['reason'] ?? 'Not available yet.');
        }
    }
    $inline = preg_match('#^(video|audio|image)/#', $a['mimeType']) && $a['mimeType'] !== 'image/svg+xml';
    return ['url' => storage()->downloadUrl($a['storageKey'], ['filename' => $a['displayName'], 'contentType' => $a['mimeType'], 'inline' => (bool)$inline, 'expiresSec' => 900]), 'filename' => $a['displayName'], 'mimeType' => $a['mimeType']];
}

// ───────────────────────────── deliverables (final delivery page) ─────────────────────────────

/** $in: isDeliverable, label?, visibleToClient? */
function set_deliverable(Actor $actor, string $id, array $in): array
{
    assert_can($actor, 'files:write');
    $a = get_asset_or_throw($actor, $id);
    if (!$a['projectId']) {
        throw bad_request('Only project files can be deliverables.');
    }
    Db::update('assets', ['id' => $id], [
        'isDeliverable' => $in['isDeliverable'], 'deliverableLabel' => $in['label'] ?? $a['deliverableLabel'],
        'visibleToClient' => $in['visibleToClient'] ?? ($in['isDeliverable'] ? false : true),
    ]);
    return asset_dto(asset_with_relations(Db::first('assets', ['id' => $id])));
}

function list_deliverables(Actor $actor, string $projectId): array
{
    $project = require_project($actor, $projectId);
    [$s, $p] = scope_asset($actor, 'a');
    $rows = Db::hydrateAll('assets', Db::rows("SELECT a.* FROM `assets` a WHERE a.`projectId` = ? AND a.`isDeliverable` = 1 AND {$s} ORDER BY a.`deliverableLabel` ASC, a.`createdAt` DESC", [$projectId, ...$p]));
    $gate = deliverables_unlocked($projectId, $actor->workspaceId);
    return ['items' => array_map('asset_dto', assets_with_relations($rows)), 'unlocked' => $gate['ok'], 'lockedReason' => $gate['ok'] ? null : ($gate['reason'] ?? null), 'status' => $project['status']];
}

function publish_deliverables(Actor $actor, string $projectId): array
{
    assert_can($actor, 'files:write');
    $project = require_project($actor, $projectId);
    if (!$actor->can('projects:transition') && !$actor->can('versions:upload')) {
        throw forbidden();
    }
    $n = Db::exec("UPDATE `assets` SET `visibleToClient` = 1 WHERE `projectId` = ? AND `isDeliverable` = 1 AND `status` = 'READY' AND `visibleToClient` = 0 AND `deletedAt` IS NULL", [$projectId]);
    if ($n === 0) {
        throw bad_request('Upload at least one final deliverable first.');
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'deliverables.published', 'entityType' => 'project', 'entityId' => $projectId, 'message' => "{$actor->name} published {$n} final deliverable(s) for {$project['code']}"]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'deliverables.published', 'message' => "Final deliverables are ready ({$n} file" . ($n === 1 ? '' : 's') . ')', 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    emit('deliverables.published', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $project['clientId']]);
    return ['published' => $n];
}

// ───────────────────────────── storage usage ─────────────────────────────

function storage_usage(Actor $actor, string $organizationId): array
{
    assert_org_action($actor, $organizationId, 'view');
    $row = Db::rowRaw(
        "SELECT COALESCE(SUM(a.`sizeBytes`), 0) AS used, COUNT(*) AS n FROM `assets` a
         WHERE a.`deletedAt` IS NULL AND a.`status` IN ('READY','PROCESSING')
           AND (EXISTS (SELECT 1 FROM `projects` p WHERE p.`id` = a.`projectId` AND p.`organizationId` = ?) OR EXISTS (SELECT 1 FROM `clients` c WHERE c.`id` = a.`clientId` AND c.`organizationId` = ?))",
        [$organizationId, $organizationId],
    );
    return ['usedBytes' => (int)$row['used'], 'limitBytes' => 200 * 1073741824, 'files' => (int)$row['n']];
}

// ───────────────────────────── post-processing (background job) ─────────────────────────────

function post_process_asset(string $assetId): void
{
    $a = Db::first('assets', ['id' => $assetId]);
    if (!$a || $a['status'] === 'DELETED') {
        return;
    }
    $status = 'READY';
    $scanStatus = 'skipped';
    $scanUrl = (string)cfg('scan.url', '');
    if (cfg('scan.provider', 'none') === 'clamav-http' && $scanUrl !== '') {
        if ((int)$a['sizeBytes'] > FEP_MAX_SCAN_BYTES) {
            // Video masters are routinely far larger than a scanner can be sent in one request. They are released unscanned, and the record says so.
            $scanStatus = 'skipped_large';
        } else {
            $res = http_request('POST', $scanUrl, ['Content-Type' => 'application/octet-stream'], storage()->read($a['storageKey'], FEP_MAX_SCAN_BYTES), 120);
            $json = json_decode($res['body'], true);
            if ($res['status'] < 200 || $res['status'] >= 300) {
                throw new RuntimeException('Scanner returned ' . $res['status']);
            }
            // Anything other than an explicit true/false is treated as a failure (the job retries), never as "clean".
            if (!is_array($json) || !is_bool($json['infected'] ?? null)) {
                throw new RuntimeException('Scanner returned an unreadable answer');
            }
            $scanStatus = $json['infected'] ? 'infected' : 'clean';
            if ($json['infected']) {
                $status = 'QUARANTINED';
            }
        }
    }
    Db::update('assets', ['id' => $assetId], ['status' => $status, 'scanStatus' => $scanStatus]);
    if ($status === 'QUARANTINED') {
        audit(system_actor('Malware scanner'), ['workspaceId' => $a['workspaceId'], 'action' => 'asset.quarantined', 'entityType' => 'asset', 'entityId' => $assetId, 'message' => "{$a['displayName']} was quarantined by the malware scanner"]);
        $admins = Db::col("SELECT u.`id` FROM `users` u WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`key` IN ('super_admin','admin'))", [$a['workspaceId']]);
        notify(['workspaceId' => $a['workspaceId'], 'userIds' => $admins, 'category' => 'SYSTEM', 'type' => 'asset.quarantined', 'title' => 'A file was quarantined', 'message' => $a['displayName'], 'link' => $a['projectId'] ? "/admin/projects/{$a['projectId']}" : '/admin/files', 'email' => true]);
    }
}
