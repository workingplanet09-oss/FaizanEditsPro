<?php
/** /api/assets/*, /api/storage/object — validated uploads (in chunks), downloads through signed links, project files and deliverables. */
defined('FEP') or exit;

$pageQ = fn() => V::coerceNum()->optional();

api('GET', '/api/assets', fn(Ctx $c) => list_all_assets($c->actor, $c->query), ['query' => V::obj(['q' => V::str()->optional(), 'projectId' => V::str()->optional(), 'page' => $pageQ()])]);

/** Step 1 of an upload: validates, records the asset, returns a signed upload target. */
api_public('POST', '/api/assets/upload-url', fn(Ctx $c) => request_upload($c->actor, $c->ip, $c->body), ['status' => 201, 'body' => V::obj([
    'purpose' => V::enum(['asset', 'version', 'deliverable', 'brand', 'lead_reference'])->optional(), 'projectId' => V::str()->optional(), 'clientId' => V::str()->optional(), 'draftToken' => V::str()->max(80)->optional(),
    'folderKey' => V::str()->max(40)->optional(), 'filename' => V::str()->min(1)->max(255), 'size' => V::num()->int()->min(1), 'mimeType' => V::str()->max(120), 'fileRequestId' => V::str()->optional(), 'label' => V::str()->max(80)->optional(),
])]);

/** Step 3: confirm the object landed in storage (size verified server-side), then version/scan/log. */
api_public('POST', '/api/assets/{id}/complete', fn(Ctx $c) => complete_upload($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'draftToken' => V::str()->max(80)->optional(), 'fileRequestId' => V::str()->optional(), 'durationMs' => V::num()->int()->min(0)->optional(),
])->default([])]);

api('GET', '/api/assets/{id}', function (Ctx $c) {
    $q = $c->query;
    if (($q['download'] ?? null) === '1' || ($q['inline'] ?? null) === '1') {
        return get_download_url($c->actor, $c->params['id'], ['inline' => ($q['inline'] ?? null) === '1']);
    }
    $a = get_asset_or_throw($c->actor, $c->params['id']);
    return ['id' => $a['id'], 'displayName' => $a['displayName'], 'mimeType' => $a['mimeType'], 'sizeBytes' => (int)$a['sizeBytes'], 'status' => $a['status'], 'version' => $a['version']];
}, ['query' => V::obj(['download' => V::str()->optional(), 'inline' => V::str()->optional()])]);

api('PATCH', '/api/assets/{id}', function (Ctx $c) {
    $b = $c->body;
    $id = $c->params['id'];
    $out = ['ok' => true];
    if (!empty($b['displayName'])) {
        $out = rename_asset($c->actor, $id, $b['displayName']);
    }
    if (!empty($b['folderKey'])) {
        $out = move_asset($c->actor, $id, $b['folderKey']);
    }
    if (array_key_exists('isDeliverable', $b) || array_key_exists('deliverableLabel', $b) || array_key_exists('visibleToClient', $b)) {
        $out = set_deliverable($c->actor, $id, ['isDeliverable' => $b['isDeliverable'] ?? true, 'label' => $b['deliverableLabel'] ?? null, 'visibleToClient' => $b['visibleToClient'] ?? null]);
    }
    return $out;
}, ['body' => V::obj([
    'displayName' => V::str()->trim()->min(1)->max(200)->optional(), 'folderKey' => V::str()->max(40)->optional(), 'isDeliverable' => V::bool()->optional(),
    'deliverableLabel' => V::str()->max(80)->nullish(), 'visibleToClient' => V::bool()->optional(),
])]);
api('DELETE', '/api/assets/{id}', fn(Ctx $c) => delete_asset($c->actor, $c->params['id']));
api('POST', '/api/assets/{id}/share', fn(Ctx $c) => share_asset($c->actor, $c->params['id'], true));
api('DELETE', '/api/assets/{id}/share', fn(Ctx $c) => share_asset($c->actor, $c->params['id'], false));
api('GET', '/api/assets/{id}/thumbnail', fn(Ctx $c) => get_thumbnail_url($c->actor, $c->params['id']));
api('POST', '/api/assets/{id}/thumbnail', fn(Ctx $c) => request_thumbnail_upload($c->actor, $c->params['id']));
api('PUT', '/api/assets/{id}/thumbnail', fn(Ctx $c) => confirm_thumbnail($c->actor, $c->params['id']));
api('GET', '/api/assets/{id}/versions', fn(Ctx $c) => asset_versions($c->actor, $c->params['id']));

// ── project files & deliverables ──
api('GET', '/api/projects/{id}/assets', function (Ctx $c) {
    $q = $c->query;
    $assets = list_assets($c->actor, $c->params['id'], ['folderKey' => $q['folder'] ?? null, 'q' => $q['q'] ?? null, 'page' => $q['page'] ?? null, 'pageSize' => $q['pageSize'] ?? null, 'deliverablesOnly' => ($q['deliverables'] ?? null) === '1']);
    return $assets + ['folders' => ($q['folders'] ?? null) === '0' ? [] : list_folders($c->actor, $c->params['id'])];
}, ['query' => V::obj(['folder' => V::str()->optional(), 'q' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(), 'folders' => V::str()->optional(), 'deliverables' => V::str()->optional()])]);
api('GET', '/api/projects/{id}/deliverables', fn(Ctx $c) => list_deliverables($c->actor, $c->params['id']));
api('POST', '/api/projects/{id}/deliverables/publish', fn(Ctx $c) => publish_deliverables($c->actor, $c->params['id']));
api('POST', '/api/projects/{id}/assets-ready', fn(Ctx $c) => mark_assets_ready($c->actor, $c->params['id']));

// ── storage object endpoint ──
/**
 * Object endpoint. Access is granted ONLY by a signed, expiring token minted after the caller passed the ownership checks — the key itself is
 * never accepted from the client. GET supports HTTP Range so the review player can seek. PUT receives one chunk of an upload
 * (`Content-Range: bytes start-end/total`); chunks must arrive in order and the upload can be resumed after an interruption.
 */
function storage_token(string $op): array
{
    $t = (string)($_GET['t'] ?? '');
    $tok = $t !== '' ? verify_payload($t, 'storage') : null;
    if (!$tok || ($tok['op'] ?? null) !== $op || (int)($tok['exp'] ?? 0) < now_ms() || !is_string($tok['k'] ?? null)) {
        throw new AppError('FORBIDDEN', 'This link has expired. Refresh the page and try again.');
    }
    return $tok;
}

const FEP_SAFE_INLINE = '#^(video/|audio/|image/(?!svg)|application/pdf$)#';

api_public('GET', '/api/storage/object', function (Ctx $c) {
    $tok = storage_token('get');
    try {
        $file = storage()->path($tok['k']);
    } catch (Throwable) {
        throw not_found('File');
    }
    if (!is_file($file)) {
        throw new AppError('NOT_FOUND', 'File unavailable.');
    }
    return new RawResponse(function () use ($tok, $file) {
        $type = $tok['ct'] ?? 'application/octet-stream';
        $inline = !empty($tok['inl']) && preg_match(FEP_SAFE_INLINE, $type);
        stream_file($file, $type, content_disposition($tok['fn'] ?? basename($file), (bool)$inline));
    });
}, ['csrf' => false]);

api_public('PUT', '/api/storage/object', function (Ctx $c) {
    $tok = storage_token('put');
    $key = $tok['k'];
    $max = (int)($tok['max'] ?? 0);
    // an upload link only works while its file is still waiting for content (a stale link can never overwrite a finished file)
    $isThumb = str_ends_with($key, '.thumb.jpg');
    $asset = Db::first('assets', ['storageKey' => $isThumb ? substr($key, 0, -10) : $key]);
    if (!$asset || ($isThumb ? $asset['status'] === 'DELETED' : $asset['status'] !== 'UPLOADING')) {
        throw new AppError('FORBIDDEN', 'This upload is no longer open.');
    }
    $dest = storage()->path($key);
    $part = storage()->partialPath($key);
    $total = $max;
    $start = 0;
    $range = (string)($_SERVER['HTTP_CONTENT_RANGE'] ?? '');
    if ($range !== '') {
        if (!preg_match('#^bytes (\d+)-(\d+)/(\d+)$#', $range, $m)) {
            throw bad_request('Invalid Content-Range.');
        }
        $start = (int)$m[1];
        $total = (int)$m[3];
        if ((int)$m[2] < $start || ($max && $total > $max)) {
            throw new AppError('TOO_LARGE', 'File is larger than declared.');
        }
    }
    $have = is_file($part) ? (int)filesize($part) : 0;
    if ($start === 0 && $have > 0) {
        @unlink($part);
        $have = 0;
    }
    if ($start !== $have) {
        // the browser is out of step (e.g. a resumed upload): tell it where to continue from
        http_response_code(409);
        header('Content-Type: application/json; charset=utf-8');
        echo json_enc(['ok' => false, 'error' => ['code' => 'CONFLICT', 'message' => 'Upload out of order.', 'received' => $have]]);
        exit;
    }
    $in = fopen('php://input', 'rb');
    $out = fopen($part, 'ab');
    if (!$in || !$out) {
        throw new AppError('INTERNAL', 'Could not store the upload.');
    }
    $written = 0;
    while (!feof($in)) {
        $buf = fread($in, 262144);
        if ($buf === false || $buf === '') {
            break;
        }
        $written += strlen($buf);
        if ($max && $have + $written > $max) {
            fclose($in);
            fclose($out);
            @unlink($part);
            throw new AppError('TOO_LARGE', 'Upload exceeded the declared size.');
        }
        fwrite($out, $buf);
    }
    fclose($in);
    fclose($out);
    if ($written === 0) {
        throw bad_request('Empty upload.');
    }
    $received = $have + $written;
    $complete = $range === '' || $received >= $total;
    if ($complete) {
        if (!is_dir(dirname($dest))) {
            mkdir(dirname($dest), 0750, true);
        }
        if (!rename($part, $dest)) {
            @unlink($part);
            throw new AppError('INTERNAL', 'Could not store the upload.');
        }
    }
    return ['size' => $received, 'complete' => $complete, 'received' => $received];
}, ['csrf' => false]);
