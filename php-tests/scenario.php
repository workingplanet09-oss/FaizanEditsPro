<?php
/**
 * Provisions a fresh client + project in the test database, advanced to a given stage, so browser tests can drive the real UI from there.
 *   php php-tests/scenario.php quote|contract|invoice|onboarding|assets|review|delivered
 * Prints one line of JSON: credentials, ids. (Runs against the app at FEP_TEST_URL, default http://127.0.0.1:8081.)
 */
require __DIR__ . '/lib.php';

$stages = ['quote', 'contract', 'invoice', 'onboarding', 'assets', 'review', 'delivered'];
$target = $argv[1] ?? 'quote';
$upto = array_search($target, $stages, true);
if ($upto === false) {
    fwrite(STDERR, "Unknown stage. Use: " . implode(', ', $stages) . "\n");
    exit(2);
}
$RUN = t_run() . substr(bin2hex(random_bytes(2)), 0, 3);
$PW = 'Scenario-Pass-123!';
$admin = new Http('admin');
$editor = new Http('editor');
$client = new Http('client');
$adminUser = make_staff("scn-admin-{$RUN}@example.test", 'Scenario Admin', 'super_admin', $PW);
$editorUser = make_staff("scn-editor-{$RUN}@example.test", 'Scenario Editor', 'editor', $PW);
$admin->post('/api/auth/login', ['email' => $adminUser['email'], 'password' => $PW]);
$editor->post('/api/auth/login', ['email' => $editorUser['email'], 'password' => $PW]);

$clientEmail = "scn-client-{$RUN}@example.com";
$cl = $admin->post('/api/clients', ['name' => 'Scenario Client', 'email' => $clientEmail, 'companyName' => "Scenario Co {$RUN}"]);
if (!in_array($cl['status'], [200, 201], true)) {
    fwrite(STDERR, 'client create failed: ' . json_encode($cl['error'] ?? $cl['text']) . "\n");
    exit(1);
}
$clientId = $cl['data']['id'] ?? $cl['data']['clientId'];
invite_user_by_email(['workspaceId' => workspace_id(), 'email' => $clientEmail, 'name' => 'Scenario Client', 'kind' => 'client', 'clientId' => $clientId, 'invitedBy' => null]);
$u = Db::first('users', ['email' => $clientEmail]);
Db::update('users', ['id' => $u['id']], ['passwordHash' => hash_password($PW), 'status' => 'ACTIVE', 'emailVerifiedAt' => now_ms()]);
$pr = $admin->post('/api/projects', ['clientId' => $clientId, 'name' => "Scenario Project {$RUN}"]);
$projectId = $pr['data']['id'] ?? null;
if (!$projectId) {
    fwrite(STDERR, 'project create failed: ' . json_encode($pr['error'] ?? $pr['text']) . "\n");
    exit(1);
}
$out = ['clientEmail' => $clientEmail, 'password' => $PW, 'adminEmail' => $adminUser['email'], 'editorEmail' => $editorUser['email'], 'clientId' => $clientId, 'projectId' => $projectId, 'stage' => $target];
$client->post('/api/auth/login', ['email' => $clientEmail, 'password' => $PW]);

// quote
$q = $admin->post('/api/quotes', ['clientId' => $clientId, 'projectId' => $projectId, 'title' => 'Scenario quote', 'currency' => 'USD', 'depositPercent' => 50, 'items' => [['description' => 'Short-form edit', 'quantity' => 4, 'unitPrice' => 5000]], 'discount' => 0, 'taxRateBps' => 0]);
$out['quoteId'] = $q['data']['id'] ?? null;
$admin->post("/api/quotes/{$out['quoteId']}/send");
if ($upto >= 1) {
    $client->post("/api/quotes/{$out['quoteId']}/accept");
    drain();
    $out['contractId'] = Db::first('contracts', ['projectId' => $projectId])['id'] ?? null;
    $admin->post("/api/contracts/{$out['contractId']}/send");
}
if ($upto >= 2) {
    $cv = $client->get("/api/contracts/{$out['contractId']}");
    $client->post("/api/contracts/{$out['contractId']}/sign", ['signerName' => 'Scenario Client', 'signature' => 'Scenario Client', 'kind' => 'typed', 'version' => $cv['data']['currentVersion'], 'accept' => true]);
    drain();
    $out['invoiceId'] = Db::first('invoices', ['projectId' => $projectId], ['order' => '`createdAt` ASC'])['id'] ?? null;
}
if ($upto >= 3) {
    $client->post("/api/invoices/{$out['invoiceId']}/pay/demo");
    drain();
}
if ($upto >= 4) {
    $ob = $client->get("/api/projects/{$projectId}/onboarding");
    $client->post("/api/projects/{$projectId}/onboarding", ['answers' => ['project_name' => 'Scenario brief'] + fill_required($ob['data']['form'], $ob['data']['answers'], $ob['data']['extraCategories'])]);
}
if ($upto >= 5) {
    upload_file($client, ['projectId' => $projectId, 'folderKey' => 'raw-footage', 'filename' => 'raw_interview.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(120)]);
    $client->post("/api/projects/{$projectId}/assets-ready");
    $admin->post("/api/projects/{$projectId}/assign", ['managerId' => $adminUser['id'], 'editorIds' => [$editorUser['id']]]);
    $editor->post("/api/projects/{$projectId}/transition", ['to' => 'EDITING']);
    // REAL_VIDEO=1 uses a genuine playable WebM (fixtures/, made by migration-tools/make-test-video.mjs) so browser tests can exercise the player
    $real = (bool)getenv('REAL_VIDEO');
    $bytes = $real ? file_get_contents(__DIR__ . '/fixtures/review-test.webm') : fake_video(300);
    $f = upload_file($editor, ['purpose' => 'version', 'projectId' => $projectId, 'filename' => $real ? 'scenario-v1.webm' : 'scenario-v1.mp4', 'mime' => $real ? 'video/webm' : 'video/mp4', 'bytes' => $bytes]);
    $v = $editor->post('/api/video-versions', ['projectId' => $projectId, 'assetId' => $f['asset']['id'], 'notes' => 'First cut', 'changeSummary' => 'Initial edit']);
    $out['versionId'] = $v['data']['id'] ?? null;
    drain();
}
if ($upto >= 6) {
    $client->post("/api/projects/{$projectId}/approve", ['versionId' => $out['versionId'], 'confirmVersionNumber' => 1, 'notes' => 'Approved']);
    drain();
    foreach ($client->get('/api/invoices')['data']['items'] ?? [] as $inv) { // the balance invoice generated on approval unlocks the final files once paid
        if (in_array($inv['status'], ['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'], true)) {
            $client->post("/api/invoices/{$inv['id']}/pay/demo");
        }
    }
    $m = upload_file($admin, ['purpose' => 'deliverable', 'projectId' => $projectId, 'filename' => 'FINAL_master.mp4', 'mime' => 'video/mp4', 'bytes' => fake_video(100), 'label' => 'Master']);
    $admin->post("/api/projects/{$projectId}/deliverables/publish");
    $admin->post("/api/projects/{$projectId}/transition", ['to' => 'DELIVERED']);
    drain();
}
echo json_encode($out) . "\n";
