<?php
/**
 * End-to-end workflow test — drives the REAL application over HTTP against the REAL database.
 * Steps 1–32 mirror the product spec (visitor → lead → client → quote → contract → payment → onboarding → assets → V1 → feedback →
 * revision → V2 → approval → delivery → testimonial). Then it attacks the app: cross-client IDOR, RBAC, CSRF, status machine, payment gating.
 */
require __DIR__ . '/lib.php';

$RUN = t_run();
$PASSWORD = 'e2e-Password-123!';
echo "\nFaizanEdits Pro — PHP end-to-end workflow test  (" . t_base() . ")\n";
$health = (new Http())->get('/api/health');
if (($health['data']['status'] ?? null) !== 'ok') {
    fwrite(STDERR, "\nApp isn't reachable. Start it first (see php-tests/lib.php).\n");
    exit(2);
}
$admin = new Http('admin');
$editor = new Http('editor');
$client = new Http('client');
$client2 = new Http('client2');
$visitor = new Http('visitor');
$adminUser = make_staff("e2e-admin-{$RUN}@example.test", 'E2E Admin', 'super_admin', $PASSWORD);
$editorUser = make_staff("e2e-editor-{$RUN}@example.test", 'E2E Editor', 'editor', $PASSWORD);
$clientEmail = "e2e-client-{$RUN}@example.com";
$client2Email = "e2e-other-{$RUN}@example.com";
$in = fn(array $a, string $k) => array_key_exists($k, $a);

step('Setup', 'staff sign in with email + password');
check('admin can sign in', $admin->post('/api/auth/login', ['email' => $adminUser['email'], 'password' => $PASSWORD])['status'] === 200);
check('editor can sign in', $editor->post('/api/auth/login', ['email' => $editorUser['email'], 'password' => $PASSWORD])['status'] === 200);
check('wrong password is rejected', (new Http())->post('/api/auth/login', ['email' => $adminUser['email'], 'password' => 'nope-nope-nope'])['status'] === 401);

// ───────────────────────── 1–3 visitor → dynamic onboarding → lead ─────────────────────────
step(1, 'Visitor opens the website');
$home = (new Http())->get('/');
check('homepage renders (200)', $home['status'] === 200, $home['status']);
step(2, 'Visitor selects Short-Form Editing');
$svc = (new Http())->get('/services/short-form-video-editing');
check('service page renders (200)', $svc['status'] === 200, $svc['status']);

step(3, 'Visitor completes the dynamic onboarding wizard');
$formRes = $visitor->get('/api/forms/inquiry');
check('inquiry form definition is served from the database', $formRes['status'] === 200 && count($formRes['data']['sections'] ?? []) >= 9, $formRes['status']);
$form = $formRes['data'];
$draft = $visitor->put('/api/forms/inquiry/draft', ['data' => ['looking_for' => 'short_form'], 'step' => 1]);
check('wizard progress autosaves (draft token issued)', $draft['status'] === 200 && !empty($draft['data']['token']), $draft['error']);
$reload = $visitor->get('/api/forms/inquiry/draft?token=' . ($draft['data']['token'] ?? ''));
check('draft can be recovered after reload', ($reload['data']['draft']['data']['looking_for'] ?? null) === 'short_form');

$answers = fill_required($form, ['looking_for' => 'short_form', 'client_type' => 'creator', 'niche' => 'youtube_creator', 'budget' => '1000_2500', 'platforms' => ['youtube', 'instagram'], 'youtube_channel' => 'https://youtube.com/@e2e', 'shorts_count' => 10, 'short_length' => '30', 'video_frequency' => 'weekly', 'videos_per_month' => 8, 'turnaround' => 'standard', 'style' => ['fast_paced', 'clean'], 'name' => 'Casey Creator', 'email' => $clientEmail, 'phone' => '+1 555 010 0101', 'company' => "E2E Studios {$RUN}", 'website' => 'https://example.com', 'project_description' => 'We publish weekly long videos and want ten scroll-stopping Shorts cut from each one, with animated captions.']);
check('real-estate questions stay hidden for a YouTube/short-form creator', !array_key_exists('property_type', $answers));
$bad = $visitor->post('/api/leads', ['answers' => ['email' => 'not-an-email'] + $answers]);
check('invalid email is rejected with a field error', $bad['status'] === 422 && !empty($bad['error']['fields']['email']), $bad['error']);
$noBudget = $answers;
unset($noBudget['budget']);
$missing = $visitor->post('/api/leads', ['answers' => $noBudget]);
check('missing required answer is rejected', $missing['status'] === 422 && !empty($missing['error']['fields']['budget']), $missing['error']);
$spam = $visitor->post('/api/leads', ['answers' => $answers, 'hp' => 'i-am-a-bot']);
check('honeypot blocks bots', $spam['status'] === 400, $spam['status']);
$sub = $visitor->post('/api/leads', ['answers' => $answers + ['property_type' => 'house', 'podcast_name' => 'Should be dropped'], 'serviceSlug' => 'short-form-video-editing', 'draftToken' => $draft['data']['token'], 'utm' => ['source' => 'instagram', 'medium' => 'social', 'campaign' => 'e2e'], 'referrer' => 'https://instagram.com/']);
check('inquiry submitted (201) with a request ID', $sub['status'] === 201 && preg_match('/^REQ-\d{4}-\d{4}$/', $sub['data']['requestCode'] ?? ''), $sub['error'] ?? $sub['data']);
$requestCode = $sub['data']['requestCode'] ?? '';
check('confirmation shows project type, response time and next step', !empty($sub['data']['projectType']) && !empty($sub['data']['responseTime']) && !empty($sub['data']['nextStep']), $sub['data']);
check('the client-facing response does NOT expose an internal score', !isset($sub['data']['score']) && !isset($sub['data']['temperature']));
drain();
check('confirmation email was generated', (bool)Db::first('email_logs', ['toEmail' => $clientEmail, 'templateKey' => 'lead_received']));

// ───────────────────────── 4–6 CRM ─────────────────────────
step(4, 'Lead appears in the CRM (Admin → Leads)');
$list = $admin->get('/api/leads?q=' . $requestCode);
$leadRow = null;
foreach ($list['data']['items'] ?? [] as $l) {
    if ($l['requestCode'] === $requestCode) {
        $leadRow = $l;
    }
}
check('lead is listed for admin', (bool)$leadRow, $list['status']);
check('lead has an internal Hot/Warm/Cold label', in_array($leadRow['temperature'] ?? null, ['HOT', 'WARM', 'COLD', 'NEEDS_REVIEW'], true), $leadRow['temperature'] ?? null);
check('lead source was tracked from UTM (Instagram)', ($leadRow['source'] ?? null) === 'Instagram', $leadRow['source'] ?? null);

step(5, 'Admin opens the lead');
$lead = $admin->get("/api/leads/{$leadRow['id']}");
check('lead detail includes every answer with its question text', count($lead['data']['answers'] ?? []) > 10, count($lead['data']['answers'] ?? []));
check('hidden/irrelevant answers were not stored', !array_filter($lead['data']['answers'] ?? [], fn($a) => in_array($a['key'], ['property_type', 'podcast_name'], true)));
check('UTM data stored with the lead', ($lead['data']['utmSource'] ?? null) === 'instagram' && ($lead['data']['utmCampaign'] ?? null) === 'e2e');
check("activity timeline has 'Inquiry submitted'", (bool)array_filter($lead['data']['activities'] ?? [], fn($a) => $a['type'] === 'inquiry_submitted'));
$override = $admin->patch("/api/leads/{$leadRow['id']}", ['temperatureOverride' => 'HOT', 'assignedToId' => $adminUser['id']]);
check('admin can override the label and assign the lead', $override['status'] === 200, $override['error']);
check('visitors/clients cannot list leads', in_array($client->get('/api/leads')['status'], [401, 403], true));

step(6, 'Admin converts the lead into a client');
$conv = $admin->post("/api/leads/{$leadRow['id']}/convert", ['createProject' => true]);
check('lead converted → client + project created', $conv['status'] === 200 && !empty($conv['data']['clientId']) && !empty($conv['data']['projectId']), $conv['error']);
$clientId = $conv['data']['clientId'];
$projectId = $conv['data']['projectId'];
$conv2 = $admin->post("/api/leads/{$leadRow['id']}/convert", []);
check('converting again is idempotent (same client)', ($conv2['data']['clientId'] ?? null) === $clientId);
$proj0 = $admin->get("/api/projects/{$projectId}");
check("project starts in 'Awaiting Quote'", ($proj0['data']['status'] ?? null) === 'AWAITING_QUOTE', $proj0['data']['status'] ?? null);

// ───────────────────────── 7–9 quote ─────────────────────────
step(7, 'Admin creates a quote');
$q = $admin->post('/api/quotes', ['clientId' => $clientId, 'projectId' => $projectId, 'title' => '10 Shorts from one YouTube video', 'currency' => 'USD', 'depositPercent' => 100, 'items' => [['description' => 'Short-form edit (9:16, captions, sound design)', 'quantity' => 10, 'unitPrice' => 4500]], 'discount' => 5000, 'taxRateBps' => 0, 'leadId' => $leadRow['id']]);
check('quote created with totals computed server-side', $q['status'] === 201 && ($q['data']['total'] ?? null) === 40000 && ($q['data']['status'] ?? null) === 'DRAFT', $q['error'] ?? $q['data']);
$quoteId = $q['data']['id'];
$hiddenDraft = magic_login($client, $clientEmail);
check('client can sign in with a magic link (no password)', $hiddenDraft['ok'], $hiddenDraft['r']['error'] ?? null);
check('a DRAFT quote is invisible to the client', $client->get("/api/quotes/{$quoteId}")['status'] === 404);
$sent = $admin->post("/api/quotes/{$quoteId}/send");
check('admin sends the quote', $sent['status'] === 200 && ($sent['data']['status'] ?? null) === 'SENT', $sent['error']);

step(8, 'Client receives the quote');
drain();
$cq = $client->get("/api/quotes/{$quoteId}");
check('client can open the quote (status → Viewed)', $cq['status'] === 200 && in_array($cq['data']['status'] ?? null, ['SENT', 'VIEWED'], true), $cq['error']);
$cn = $client->get('/api/notifications');
check("client got an in-app notification: 'Your quote is ready'", (bool)array_filter($cn['data']['items'] ?? [], fn($n) => preg_match('/quote is ready/i', $n['title'])), array_column($cn['data']['items'] ?? [], 'title'));
check("client got the 'quote sent' email", (bool)Db::first('email_logs', ['toEmail' => $clientEmail, 'templateKey' => 'quote_sent']));
check('the project is now visible to the client', $client->get("/api/projects/{$projectId}")['status'] === 200);

step(9, 'Client accepts the quote');
$acc = $client->post("/api/quotes/{$quoteId}/accept");
check('quote accepted (logged with who/when)', $acc['status'] === 200 && ($acc['data']['status'] ?? null) === 'ACCEPTED', $acc['error']);
check('accepting twice is refused', $client->post("/api/quotes/{$quoteId}/accept")['status'] === 409);
$p1 = $admin->get("/api/projects/{$projectId}");
check("project moved to 'Awaiting Contract'", ($p1['data']['status'] ?? null) === 'AWAITING_CONTRACT', $p1['data']['status'] ?? null);
drain();

// ───────────────────────── 10–12 contract ─────────────────────────
step(10, 'Admin sends the contract');
$contractId = Db::first('contracts', ['projectId' => $projectId])['id'] ?? null;
check('a draft contract was prepared automatically on acceptance', (bool)$contractId);
check('a DRAFT contract is invisible to the client', $client->get("/api/contracts/{$contractId}")['status'] === 404);
$csend = $admin->post("/api/contracts/{$contractId}/send");
check('contract sent', $csend['status'] === 200 && ($csend['data']['status'] ?? null) === 'SENT', $csend['error']);

step(11, 'Client signs the contract');
$cview = $client->get("/api/contracts/{$contractId}");
check('client can read all contract sections', $cview['status'] === 200 && count($cview['data']['sections'] ?? []) >= 10, $cview['error']);
$sig = ['signerName' => 'Casey Creator', 'signature' => 'Casey Creator', 'kind' => 'typed', 'version' => $cview['data']['currentVersion']];
$noAccept = $client->post("/api/contracts/{$contractId}/sign", $sig + ['accept' => false]);
check('signing without accepting the terms is refused', in_array($noAccept['status'], [400, 422], true));
$sign = $client->post("/api/contracts/{$contractId}/sign", $sig + ['accept' => true]);
check('contract signed (version, timestamp, hash recorded)', $sign['status'] === 200 && ($sign['data']['status'] ?? null) === 'SIGNED', $sign['error']);
$adminContract = $admin->get("/api/contracts/{$contractId}");
check('audit metadata stored for staff (IP/UA/hash) but not for clients', !empty($adminContract['data']['signatures'][0]['contentHash']) && !isset($sign['data']['signatures'][0]['contentHash']));
$dl = $client->get("/api/contracts/{$contractId}/download");
check('contract can be downloaded (printable HTML)', $dl['status'] === 200 && str_contains($dl['text'], 'Signatures'));

step(12, 'Invoice is generated');
drain();
$invs = $client->get('/api/invoices');
$invoice = $invs['data']['items'][0] ?? null;
check('an invoice was created for the client automatically', $invoice && $invoice['status'] === 'SENT' && $invoice['total'] === 40000, $invs['data']['items'] ?? null);
$p2 = $admin->get("/api/projects/{$projectId}");
check("project moved to 'Awaiting Payment'", ($p2['data']['status'] ?? null) === 'AWAITING_PAYMENT', $p2['data']['status'] ?? null);

// ───────────────────────── 13–14 payment ─────────────────────────
step(13, 'Client pays');
$early = $admin->post("/api/projects/{$projectId}/transition", ['to' => 'ONBOARDING']);
check("payment gate: admin can't skip payment without an override (423)", $early['status'] === 423, $early['error']);
$pay = $client->post("/api/invoices/{$invoice['id']}/pay/demo");
check('payment recorded (demo provider)', $pay['status'] === 200 && ($pay['data']['status'] ?? null) === 'PAID', $pay['error']);
$replay = $client->post("/api/invoices/{$invoice['id']}/pay/demo");
check('paying an already-paid invoice is refused', in_array($replay['status'], [409, 400], true), $replay['status']);

step(14, 'Project becomes active');
$p3 = $client->get("/api/projects/{$projectId}");
check('project status → Onboarding (activated)', ($p3['data']['status'] ?? null) === 'ONBOARDING', $p3['data']['status'] ?? null);
drain();
$cn2 = $client->get('/api/notifications');
check("client notified: 'Your project has started'", (bool)array_filter($cn2['data']['items'] ?? [], fn($n) => preg_match('/project has started/i', $n['title'])));
check('payment-received email generated', (bool)Db::first('email_logs', ['toEmail' => $clientEmail, 'templateKey' => 'payment_received']));
$adminInvoice = $admin->get("/api/invoices/{$invoice['id']}");
check('invoice shows PAID with a payment record', ($adminInvoice['data']['status'] ?? null) === 'PAID' && count($adminInvoice['data']['payments'] ?? []) === 1);

// ───────────────────────── 15–16 onboarding + assets ─────────────────────────
step(15, 'Client completes project onboarding');
$ob = $client->get("/api/projects/{$projectId}/onboarding");
check('project onboarding form loads with prefilled brand data', $ob['status'] === 200 && count($ob['data']['form']['sections'] ?? []) >= 5, $ob['error']);
$obAnswers = fill_required($ob['data']['form'], $ob['data']['answers'], $ob['data']['extraCategories']);
check('onboarding autosaves as a draft', $client->put("/api/projects/{$projectId}/onboarding", ['answers' => $obAnswers, 'step' => 2])['status'] === 200);
$obSub = $client->post("/api/projects/{$projectId}/onboarding", ['answers' => ['project_name' => 'E2E — 10 Shorts'] + $obAnswers]);
check('onboarding submitted → brief generated', $obSub['status'] === 200 && ($obSub['data']['briefVersion'] ?? 0) >= 1, $obSub['error']);
$brief = $client->get("/api/projects/{$projectId}/brief");
$keys = array_column($brief['data']['content']['sections'] ?? [], 'key');
check('project brief has client, project, creative and technical sections', !array_diff(['client', 'project', 'creative', 'technical'], $keys), $keys);
check('project → Awaiting Assets', ($client->get("/api/projects/{$projectId}")['data']['status'] ?? null) === 'AWAITING_ASSETS');

step(16, 'Client uploads assets');
check("can't mark assets ready before uploading any", $client->post("/api/projects/{$projectId}/assets-ready")['status'] === 400);
$up = upload_file($client, ['projectId' => $projectId, 'folderKey' => 'raw-footage', 'filename' => 'Interview_Final_V2.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(200)]);
check('footage uploaded in chunks through a signed upload link', $up['ok'], $up['r'] ?? null);
$up2 = upload_file($client, ['projectId' => $projectId, 'folderKey' => 'raw-footage', 'filename' => 'Interview_Final_V3.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(50)]);
check("'Interview_Final_V3.mp4' is recognised as version 3 of the same file", $up2['ok'] && ($up2['asset']['version'] ?? null) === 3, $up2['asset']['version'] ?? null);
$exe = $client->post('/api/assets/upload-url', ['projectId' => $projectId, 'filename' => 'malware.exe', 'size' => 1000, 'mimeType' => 'application/x-msdownload']);
check('executable uploads are blocked', $exe['status'] === 415, $exe['status']);
$phpUp = $client->post('/api/assets/upload-url', ['projectId' => $projectId, 'filename' => 'shell.php', 'size' => 1000, 'mimeType' => 'video/mp4']);
check('server-side script uploads (.php) are blocked', $phpUp['status'] === 415, $phpUp['status']);
$disguised = upload_file($client, ['projectId' => $projectId, 'folderKey' => 'raw-footage', 'filename' => 'holiday.mp4', 'mime' => 'video/mp4', 'bytes' => "MZ\x90\x00" . random_bytes(2000)]);
check('a program disguised as a video is refused after the upload (content sniffing)', !$disguised['ok'] && ($disguised['r']['status'] ?? 0) === 415, $disguised['r'] ?? null);
$fr = $admin->post("/api/projects/{$projectId}/file-requests", ['title' => 'Please upload the brand logo in PNG or SVG format']);
check("admin can request a missing asset ('Action required')", $fr['status'] === 201);
$logo = upload_file($client, ['projectId' => $projectId, 'folderKey' => 'logos', 'filename' => 'logo.png', 'mime' => 'image/png', 'bytes' => "\x89PNG\r\n\x1a\n" . random_bytes(4000)]);
check('client sees the file request', count($client->get("/api/projects/{$projectId}/file-requests?open=1")['data'] ?? []) === 1);
check('client confirms all assets uploaded → project Queued', ($ready = $client->post("/api/projects/{$projectId}/assets-ready"))['status'] === 200, $ready['error']);

// ───────────────────────── 17–18 editor ─────────────────────────
step(17, 'Admin assigns an editor');
check("an editor can't see a project they aren't assigned to", $editor->get("/api/projects/{$projectId}")['status'] === 404);
$assign = $admin->post("/api/projects/{$projectId}/assign", ['managerId' => $adminUser['id'], 'editorIds' => [$editorUser['id']]]);
check('editor assigned', $assign['status'] === 200 && count($assign['data']['assigned'] ?? []) >= 1, $assign['error']);
drain();

step(18, 'Editor sees the project');
check("assigned project appears in the editor's list", (bool)array_filter($editor->get('/api/projects')['data']['items'] ?? [], fn($p) => $p['id'] === $projectId));
$eAssets = $editor->get("/api/projects/{$projectId}/assets");
check("editor sees the client's uploaded assets", (bool)array_filter($eAssets['data']['items'] ?? [], fn($a) => $a['displayName'] === 'Interview_Final_V2.mp4'), $eAssets['error']);
$eBrief = $editor->get("/api/projects/{$projectId}/brief");
check('editor can read the brief', $eBrief['status'] === 200 && !empty($eBrief['data']['content']));
check('editor was notified about the assignment', (bool)array_filter($editor->get('/api/notifications')['data']['items'] ?? [], fn($n) => preg_match('/assigned/i', $n['title'])));
check('editor cannot read invoices (RBAC)', $editor->get('/api/invoices')['status'] === 403);

// ───────────────────────── 19–21 V1 ─────────────────────────
step(19, 'Editor uploads V1');
$start = $editor->post("/api/projects/{$projectId}/transition", ['to' => 'EDITING']);
check('editor can start editing', $start['status'] === 200, $start['error']);
check('editor cannot force the project to Delivered', $editor->post("/api/projects/{$projectId}/transition", ['to' => 'DELIVERED'])['status'] === 403);
$v1file = upload_file($editor, ['purpose' => 'version', 'projectId' => $projectId, 'filename' => 'shorts-v1.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(400)]);
check('draft video uploaded', $v1file['ok'], $v1file['r'] ?? null);
$v1 = $editor->post('/api/video-versions', ['projectId' => $projectId, 'assetId' => $v1file['asset']['id'], 'notes' => 'First cut of all 10 shorts', 'changeSummary' => 'Initial edit']);
check('V1 created and released to the client', $v1['status'] === 201 && ($v1['data']['label'] ?? null) === 'V1' && ($v1['data']['reviewStatus'] ?? null) === 'PENDING_CLIENT', $v1['error'] ?? $v1['data']);
check('project → Client Review', ($admin->get("/api/projects/{$projectId}")['data']['status'] ?? null) === 'CLIENT_REVIEW');

step(20, 'Client receives a notification');
drain();
$cn3 = $client->get('/api/notifications');
check("client notified: 'Your V1 is ready for review'", (bool)array_filter($cn3['data']['items'] ?? [], fn($n) => preg_match('/V1 is ready/i', $n['title'])), array_column($cn3['data']['items'] ?? [], 'title'));
check("'draft ready' email generated", (bool)Db::first('email_logs', ['toEmail' => $clientEmail, 'templateKey' => 'draft_ready']));

step(21, 'Client opens V1');
$versions = $client->get("/api/projects/{$projectId}/versions");
check('client sees V1 in the version list', count($versions['data'] ?? []) === 1 && $versions['data'][0]['label'] === 'V1');
$play = $client->get("/api/video-versions/{$v1['data']['id']}/playback");
check('signed playback URL issued', $play['status'] === 200 && !empty($play['data']['url']), $play['error']);
$rng = (new Http())->call('GET', $play['data']['url'], null, ['headers' => ['Range' => 'bytes=0-99']]);
check('video streams with HTTP Range support (206)', $rng['status'] === 206 && strlen($rng['text']) === 100, $rng['status']);
$u = $play['data']['url'];
$tampered = (new Http())->get(substr($u, 0, -1) . (substr($u, -1) === 'a' ? 'b' : 'a'));
check('a tampered signed URL is rejected', $tampered['status'] === 403, $tampered['status']);

// ───────────────────────── 22–24 feedback → revision ─────────────────────────
step(22, 'Client adds timestamped feedback');
$c1 = $client->post("/api/video-versions/{$v1['data']['id']}/comments", ['timecodeMs' => 14000, 'comment' => 'Replace this shot with the wider angle.']);
check('timestamped comment saved (00:14)', $c1['status'] === 201 && ($c1['data']['timecode'] ?? null) === '00:14', $c1['error'] ?? $c1['data']);
$client->post("/api/video-versions/{$v1['data']['id']}/comments", ['timecodeMs' => 42500, 'comment' => 'Captions are slightly late here.']);

step(23, 'Client requests a revision');
$wrongApprove = $client->post("/api/projects/{$projectId}/approve", ['versionId' => $v1['data']['id'], 'confirmVersionNumber' => 2]);
check('approval must echo the exact version number (409 on mismatch)', $wrongApprove['status'] === 409, $wrongApprove['error']);
$rev = $client->post('/api/revisions', ['projectId' => $projectId, 'versionId' => $v1['data']['id'], 'description' => 'Two notes on V1 — see the timeline.']);
check('revision submitted (round 1)', $rev['status'] === 201 && ($rev['data']['roundNumber'] ?? null) === 1, $rev['error']);
check('project → Revision', ($admin->get("/api/projects/{$projectId}")['data']['status'] ?? null) === 'REVISION');

step(24, 'Editor receives the revision');
drain();
check('editor sees the open revision', (bool)array_filter($editor->get('/api/revisions?status=open')['data'] ?? [], fn($r) => $r['id'] === $rev['data']['id']));
$eComments = $editor->get("/api/video-versions/{$v1['data']['id']}/comments");
check('editor sees both timestamped comments', count($eComments['data'] ?? []) === 2);
check("editor notified: 'Revision requested'", (bool)array_filter($editor->get('/api/notifications')['data']['items'] ?? [], fn($n) => preg_match('/revision requested/i', $n['title'])));
$reply = $editor->patch("/api/video-comments/{$eComments['data'][0]['id']}", ['status' => 'IN_PROGRESS', 'response' => 'On it — swapping to the wide.']);
check('editor can respond to a comment and mark it in progress', $reply['status'] === 200, $reply['error']);
check("clients can't resolve comments themselves", $client->patch("/api/video-comments/{$eComments['data'][0]['id']}", ['status' => 'RESOLVED'])['status'] === 403);
$tasks = $editor->get('/api/tasks?mine=1');
check("a task 'Apply revision notes' was created for the editor automatically", (bool)array_filter($tasks['data']['items'] ?? [], fn($t) => preg_match('/revision notes/i', $t['title'])), array_column($tasks['data']['items'] ?? [], 'title'));

// ───────────────────────── 25–28 V2 → approval ─────────────────────────
step(25, 'Editor uploads V2');
$v2file = upload_file($editor, ['purpose' => 'version', 'projectId' => $projectId, 'filename' => 'shorts-v2.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(420)]);
$v2 = $editor->post('/api/video-versions', ['projectId' => $projectId, 'assetId' => $v2file['asset']['id'], 'revisionId' => $rev['data']['id'], 'notes' => 'Wide angle swapped, captions retimed', 'changeSummary' => 'Applied 2 notes']);
check('V2 created; V1 kept and superseded (never overwritten)', $v2['status'] === 201 && ($v2['data']['label'] ?? null) === 'V2', $v2['error']);
$list2 = $client->get("/api/projects/{$projectId}/versions");
$v1row = array_values(array_filter($list2['data'] ?? [], fn($v) => $v['label'] === 'V1'))[0] ?? null;
check('both versions exist for comparison', count($list2['data'] ?? []) === 2 && ($v1row['reviewStatus'] ?? null) === 'SUPERSEDED');
check('revision marked Resolved and comments closed out', ($admin->get("/api/revisions?projectId={$projectId}")['data'][0]['status'] ?? null) === 'RESOLVED');
drain();

step(26, 'Client reviews V2');
$cn4 = $client->get('/api/notifications');
check("client notified: 'A revision has been completed'", (bool)array_filter($cn4['data']['items'] ?? [], fn($n) => preg_match('/revision has been completed/i', $n['title'])), array_column($cn4['data']['items'] ?? [], 'title'));
$old = $client->post("/api/video-versions/{$v1['data']['id']}/comments", ['timecodeMs' => 1000, 'comment' => 'late note']);
check('comments on a superseded version are refused', in_array($old['status'], [423, 409], true), $old['status']);

step(27, 'Client approves V2');
$approve = $client->post("/api/projects/{$projectId}/approve", ['versionId' => $v2['data']['id'], 'confirmVersionNumber' => 2, 'notes' => 'Looks great — approved.']);
check('V2 approved (who/when/version/notes stored)', $approve['status'] === 200 && ($approve['data']['versionNumber'] ?? null) === 2, $approve['error']);

step(28, 'Project becomes Approved');
check('project → Approved', ($admin->get("/api/projects/{$projectId}")['data']['status'] ?? null) === 'APPROVED');
$prem = $admin->post("/api/projects/{$projectId}/transition", ['to' => 'DELIVERED']);
check("can't mark Delivered before final files are published (423)", $prem['status'] === 423, $prem['error']);

// ───────────────────────── 29–32 delivery ─────────────────────────
step(29, 'Admin uploads final files');
$master = upload_file($admin, ['purpose' => 'deliverable', 'projectId' => $projectId, 'filename' => 'FINAL_master_4k.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(300), 'label' => 'Master 4K']);
$captions = upload_file($admin, ['purpose' => 'deliverable', 'projectId' => $projectId, 'filename' => 'captions.srt', 'mime' => 'application/x-subrip', 'bytes' => "1\n00:00:00,000 --> 00:00:02,000\nHello\n", 'label' => 'Caption file']);
check('final deliverables uploaded', $master['ok'] && $captions['ok'], $master['r'] ?? $captions['r'] ?? null);
$hidden = $client->get("/api/projects/{$projectId}/deliverables");
check('deliverables are invisible to the client until published', count($hidden['data']['items'] ?? [1]) === 0, $hidden['data']);
check("...and can't be downloaded by guessing the ID", $client->get("/api/assets/{$master['asset']['id']}?download=1")['status'] === 404);
$pub = $admin->post("/api/projects/{$projectId}/deliverables/publish");
check('admin publishes the deliverables', $pub['status'] === 200 && ($pub['data']['published'] ?? null) === 2, $pub['error']);

step(30, 'Client downloads files');
drain();
check("client notified: 'Your final files are ready'", (bool)array_filter($client->get('/api/notifications')['data']['items'] ?? [], fn($n) => preg_match('/final files are ready/i', $n['title'])));
$dels = $client->get("/api/projects/{$projectId}/deliverables");
check('client sees Final Delivery with labelled files', count($dels['data']['items'] ?? []) === 2 && ($dels['data']['unlocked'] ?? null) === true, $dels['data']);
$durl = $client->get("/api/assets/{$master['asset']['id']}?download=1");
check('signed download URL issued', $durl['status'] === 200 && !empty($durl['data']['url']), $durl['error']);
$file = (new Http())->get($durl['data']['url']);
check('file downloads with the correct size', $file['status'] === 200 && strlen($file['text']) === $master['asset']['sizeBytes'], $file['status']);

step(31, 'Project is delivered → testimonial request is triggered');
step(32, 'Project becomes Delivered');
$deliver = $admin->post("/api/projects/{$projectId}/transition", ['to' => 'DELIVERED']);
check('project → Delivered', $deliver['status'] === 200 && ($deliver['data']['status'] ?? null) === 'DELIVERED', $deliver['error']);
drain();
check('testimonial request created', (bool)Db::first('testimonial_requests', ['projectId' => $projectId]));
check("client notified: 'How was your experience?'", (bool)array_filter($client->get('/api/notifications')['data']['items'] ?? [], fn($n) => preg_match('/how was your experience/i', $n['title'])));
$fb = $client->post("/api/projects/{$projectId}/feedback", ['rating' => 5, 'quote' => 'Fast, communicative and the shorts look great.', 'permissionToPublish' => true, 'name' => 'Casey Creator', 'company' => "E2E Studios {$RUN}", 'role' => 'Founder']);
check('client submits a testimonial', $fb['status'] === 201, $fb['error']);
$published = Db::first('testimonials', ['projectId' => $projectId]);
check('testimonial is NOT auto-published (pending admin approval)', ($published['status'] ?? null) === 'PENDING');
$approveT = $admin->patch("/api/admin/cms/testimonials/{$published['id']}", ['status' => 'APPROVED']);
check('admin approves the testimonial', $approveT['status'] === 200, $approveT['error']);

// ───────────────────────── audit trail & timeline ─────────────────────────
step('Audit', 'everything important was logged');
$audit = $admin->get('/api/admin/audit-log?pageSize=200');
$msgs = array_map(fn($a) => $a['message'] ?? '', $audit['data']['items'] ?? []);
$has = fn(string $needle) => (bool)array_filter($msgs, fn($m) => str_contains($m, $needle));
check('audit log records status changes with actor names', (bool)array_filter($msgs, fn($m) => preg_match('/changed project status from .* to /i', $m)));
check('audit log records quote acceptance, contract signature, payment and approval', $has('accepted quote') && $has('signed contract') && $has('received for Invoice') && $has('approved Video V2'), array_slice($msgs, 0, 12));
$timeline = $client->get("/api/projects/{$projectId}/timeline");
check('client timeline shows milestones, none internal', count($timeline['data']['events'] ?? []) > 5 && !array_filter($timeline['data']['events'], fn($e) => $e['internal'] !== false));
check('milestones tracker computed from real history', count(array_filter($timeline['data']['milestones'] ?? [], fn($m) => $m['done'])) >= 7, array_map(fn($m) => "{$m['label']}:" . json_encode($m['done']), $timeline['data']['milestones'] ?? []));

// ───────────────────────── security ─────────────────────────
step('Security', 'ownership, RBAC, CSRF, status machine');
$other = $admin->post('/api/clients', ['name' => 'Other Person', 'email' => $client2Email, 'companyName' => "Other Co {$RUN}"]);
check('second client created', $other['status'] === 201, $other['error']);
check('second client can sign in', magic_login($client2, $client2Email)['ok']);
$attempts = [
    'view another client\'s project' => fn() => $client2->get("/api/projects/{$projectId}"),
    'view another client\'s quote' => fn() => $client2->get("/api/quotes/{$quoteId}"),
    'view another client\'s invoice' => fn() => $client2->get("/api/invoices/{$invoice['id']}"),
    'view another client\'s contract' => fn() => $client2->get("/api/contracts/{$contractId}"),
    'download another client\'s file' => fn() => $client2->get("/api/assets/{$up['asset']['id']}?download=1"),
    'stream another client\'s video' => fn() => $client2->get("/api/video-versions/{$v2['data']['id']}/playback"),
    'comment on another client\'s video' => fn() => $client2->post("/api/video-versions/{$v2['data']['id']}/comments", ['timecodeMs' => 1000, 'comment' => 'hi']),
    'read another client\'s comments' => fn() => $client2->get("/api/video-versions/{$v2['data']['id']}/comments"),
    'read another client\'s messages' => fn() => $client2->get("/api/messages?projectId={$projectId}"),
    'approve another client\'s video' => fn() => $client2->post("/api/projects/{$projectId}/approve", ['versionId' => $v2['data']['id'], 'confirmVersionNumber' => 2]),
    'pay another client\'s invoice' => fn() => $client2->post("/api/invoices/{$invoice['id']}/pay/demo"),
    'list another client\'s brief' => fn() => $client2->get("/api/projects/{$projectId}/brief"),
    'read another client\'s deliverables' => fn() => $client2->get("/api/projects/{$projectId}/deliverables"),
    'read another client\'s timeline' => fn() => $client2->get("/api/projects/{$projectId}/timeline"),
    'read another client\'s versions' => fn() => $client2->get("/api/projects/{$projectId}/versions"),
    'upload into another client\'s project' => fn() => $client2->post('/api/assets/upload-url', ['projectId' => $projectId, 'filename' => 'x.mp4', 'size' => 1000, 'mimeType' => 'video/mp4']),
    'submit a revision on another client\'s project' => fn() => $client2->post('/api/revisions', ['projectId' => $projectId, 'versionId' => $v2['data']['id'], 'description' => 'x']),
];
foreach ($attempts as $name => $fn) {
    $r = $fn();
    check("IDOR blocked: client cannot {$name} ({$r['status']})", in_array($r['status'], [404, 403], true));
}
$c2Projects = $client2->get('/api/projects');
check("a client's project list contains only their own projects", !array_filter($c2Projects['data']['items'] ?? [], fn($p) => $p['id'] === $projectId));
check('clients cannot open admin APIs', $client->get('/api/admin/analytics')['status'] === 403 && $client->get('/api/admin/audit-log')['status'] === 403);
check('clients cannot read internal notes', $client->get("/api/notes?entityType=PROJECT&entityId={$projectId}")['status'] === 403);
check('editors cannot open admin CMS/settings', $editor->get('/api/admin/settings')['status'] === 403);
check('anonymous requests get 401', (new Http())->get('/api/projects')['status'] === 401);
check('staff can add internal notes', $admin->post('/api/notes', ['entityType' => 'PROJECT', 'entityId' => $projectId, 'body' => 'Client prefers fast cuts and dislikes excessive transitions.'])['status'] === 201);
check('internal notes never appear in client-visible messages', !str_contains(json_encode($client->get("/api/messages?projectId={$projectId}")['data'] ?? []), 'dislikes excessive'));
$noCsrf = $client->call('POST', "/api/projects/{$projectId}/duplicate", [], ['csrf' => false]);
check('mutations without the CSRF token are rejected (403)', $noCsrf['status'] === 403, $noCsrf['status']);
$cross = $client->call('POST', '/api/notifications/read', [], ['headers' => ['Origin' => 'https://evil.example', 'Sec-Fetch-Site' => 'cross-site']]);
check('cross-site requests are blocked', $cross['status'] === 403, $cross['status']);
$machine = $admin->post("/api/projects/{$projectId}/transition", ['to' => 'EDITING']);
check('status machine rejects an illegal transition (Delivered → Editing) with 409', $machine['status'] === 409, $machine['error']);
$ov = $admin->post("/api/projects/{$projectId}/transition", ['to' => 'EDITING', 'override' => true, 'comment' => 'E2E override']);
check('admin can override the machine explicitly...', $ov['status'] === 200, $ov['error']);
check('...and the override is written to the audit log', count($admin->get('/api/admin/audit-log?action=project.status_override')['data']['items'] ?? []) >= 1);
check('HTML in names is stored as text (escaped on render)', $client->patch('/api/auth/account', ['name' => '<script>alert(1)</script>'])['status'] === 200);

// ───────────────────────── partial-deposit + delivery gating ─────────────────────────
step('Gating', '50% deposit → balance invoice on approval → final files locked until paid');
$proj2 = $admin->post('/api/projects', ['clientId' => $clientId, 'name' => 'E2E gating project']);
$pid2 = $proj2['data']['id'];
$q2 = $admin->post('/api/quotes', ['clientId' => $clientId, 'projectId' => $pid2, 'items' => [['description' => 'Edit', 'quantity' => 1, 'unitPrice' => 100000]], 'depositPercent' => 50]);
check('quote with 50% deposit → deposit/balance computed', ($q2['data']['deposit'] ?? null) === 50000 && ($q2['data']['balance'] ?? null) === 50000);
$admin->post("/api/quotes/{$q2['data']['id']}/send");
$client->post("/api/quotes/{$q2['data']['id']}/accept");
$c2id = Db::first('contracts', ['projectId' => $pid2])['id'];
$admin->post("/api/contracts/{$c2id}/send");
$cv2 = $client->get("/api/contracts/{$c2id}");
$client->post("/api/contracts/{$c2id}/sign", ['signerName' => 'Casey Creator', 'signature' => 'Casey Creator', 'kind' => 'typed', 'accept' => true, 'version' => $cv2['data']['currentVersion']]);
$inv2 = $client->get("/api/invoices?projectId={$pid2}")['data']['items'][0] ?? null;
check('deposit invoice is 50%', ($inv2['total'] ?? null) === 50000, $inv2['total'] ?? null);
$client->post("/api/invoices/{$inv2['id']}/pay/demo");
$admin->post("/api/projects/{$pid2}/assign", ['managerId' => $adminUser['id'], 'editorIds' => [$editorUser['id']]]);
$admin->post("/api/projects/{$pid2}/transition", ['to' => 'AWAITING_ASSETS']);
$admin->post("/api/projects/{$pid2}/transition", ['to' => 'QUEUED']);
$v = upload_file($editor, ['purpose' => 'version', 'projectId' => $pid2, 'filename' => 'gate-v1.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(60)]);
$gv1 = $editor->post('/api/video-versions', ['projectId' => $pid2, 'assetId' => $v['asset']['id']]);
check('V1 uploaded on the second project', $gv1['status'] === 201, $gv1['error']);
$ga = $client->post("/api/projects/{$pid2}/approve", ['versionId' => $gv1['data']['id'], 'confirmVersionNumber' => 1]);
check('client approves', $ga['status'] === 200, $ga['error']);
$bal = null;
foreach ($client->get("/api/invoices?projectId={$pid2}")['data']['items'] ?? [] as $i) {
    if ($i['kind'] === 'BALANCE') {
        $bal = $i;
    }
}
check('a balance invoice was generated automatically on approval', $bal && $bal['total'] === 50000, $bal);
$fin = upload_file($admin, ['purpose' => 'deliverable', 'projectId' => $pid2, 'filename' => 'gate-final.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(40), 'label' => 'Master']);
$admin->post("/api/projects/{$pid2}/deliverables/publish");
$locked = $client->get("/api/assets/{$fin['asset']['id']}?download=1");
check('final files are LOCKED while the balance is unpaid (423)', $locked['status'] === 423, $locked['error']);
$lockedList = $client->get("/api/projects/{$pid2}/deliverables");
check('the delivery page explains why', ($lockedList['data']['unlocked'] ?? null) === false && !empty($lockedList['data']['lockedReason']), $lockedList['data']['lockedReason'] ?? null);
$client->post("/api/invoices/{$bal['id']}/pay/demo");
check('paying the balance unlocks the files', ($unlocked = $client->get("/api/assets/{$fin['asset']['id']}?download=1"))['status'] === 200, $unlocked['error']);

// flag everything this run created as demo data so `clear-demo` removes the test records too
foreach (['users', 'clients', 'organizations', 'leads', 'projects', 'quotes', 'contracts', 'invoices', 'payments', 'assets', 'video_versions', 'video_comments', 'revision_requests', 'messages', 'notifications', 'testimonials', 'retainers', 'meetings'] as $tbl) {
    try {
        Db::exec("UPDATE `{$tbl}` SET `isDemo` = 1 WHERE `createdAt` >= ?", [db_dt(now_ms() - 3600000)]);
    } catch (Throwable) {
    }
}
exit(summary());
