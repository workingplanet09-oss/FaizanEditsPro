<?php
/**
 * Durable job queue kept in the `jobs` table (no extra infrastructure): emails, automations, scans, sweeps.
 *
 * Shared hosting has no always-running worker, so jobs run in two ways:
 *   1. automatically — every so often a normal page visit processes whatever is due, right after the response is sent;
 *   2. from a cPanel Cron Job hitting /cron.php (optional; recommended for busy sites so nothing waits for a visitor).
 */
defined('FEP') or exit;

function enqueue_job(string $type, array $payload, array $opts = []): ?array
{
    $runAt = $opts['runAt'] ?? (now_ms() + (int)($opts['delayMs'] ?? 0));
    try {
        return Db::insert('jobs', ['type' => $type, 'payload' => $payload, 'runAt' => $runAt, 'dedupeKey' => $opts['dedupeKey'] ?? null, 'maxAttempts' => $opts['maxAttempts'] ?? 5]);
    } catch (PDOException $e) {
        if (Db::isDuplicate($e) && !empty($opts['dedupeKey'])) {
            return null; // already queued
        }
        throw $e;
    }
}

function job_worker_id(): string { return (gethostname() ?: 'host') . ':' . getmypid(); }

/** Claims the next due job (or a stuck one), safely against other workers. */
function claim_next_job(): ?array
{
    for ($i = 0; $i < 5; $i++) {
        $now = db_dt();
        $stale = db_dt(now_ms() - 600000);
        $id = Db::val("SELECT `id` FROM `jobs` WHERE (`status` = 'PENDING' AND `runAt` <= ?) OR (`status` = 'RUNNING' AND `lockedAt` < ?) ORDER BY `runAt` ASC LIMIT 1", [$now, $stale]);
        if ($id === null) {
            return null;
        }
        $claimed = Db::exec("UPDATE `jobs` SET `status` = 'RUNNING', `lockedAt` = ?, `lockedBy` = ?, `attempts` = `attempts` + 1 WHERE `id` = ? AND ((`status` = 'PENDING' AND `runAt` <= ?) OR (`status` = 'RUNNING' AND `lockedAt` < ?))", [$now, job_worker_id(), $id, $now, $stale]);
        if ($claimed === 1) {
            return Db::first('jobs', ['id' => $id]);
        }
    }
    return null;
}

function job_handlers(): array
{
    return [
        'email.send' => fn($p) => deliver_email($p['emailLogId']),
        'automation.action' => fn($p) => run_automation_action($p),
        'asset.postprocess' => fn($p) => post_process_asset($p['assetId']),
        'automation.emit' => fn($p) => emit($p['name'], $p['payload']),
        'sweep.all' => fn($p) => run_sweeps(),
    ];
}

/** Processes due jobs until the queue is empty, the limit is hit, or the time budget is spent. */
function run_jobs(array $opts = []): array
{
    $limit = $opts['limit'] ?? 50;
    $budget = $opts['budgetMs'] ?? 25000;
    $started = now_ms();
    $processed = 0;
    $failed = 0;
    $handlers = job_handlers();
    while ($processed < $limit && now_ms() - $started < $budget) {
        $job = claim_next_job();
        if (!$job) {
            break;
        }
        $processed++;
        try {
            $h = $handlers[$job['type']] ?? throw new RuntimeException("No handler registered for job type “{$job['type']}”");
            $h($job['payload'] ?? []);
            Db::update('jobs', ['id' => $job['id']], ['status' => 'DONE', 'completedAt' => db_dt(), 'lastError' => null, 'lockedAt' => null]);
        } catch (Throwable $e) {
            $failed++;
            $final = $job['attempts'] >= $job['maxAttempts'];
            Db::update('jobs', ['id' => $job['id']], [
                'status' => $final ? 'FAILED' : 'PENDING', 'lastError' => mb_substr($e->getMessage(), 0, 800), 'lockedAt' => null,
                'runAt' => now_ms() + 30000 * (2 ** min($job['attempts'], 8)),
            ]);
            app_log("[jobs] {$job['type']} failed (attempt {$job['attempts']}/{$job['maxAttempts']}): " . $e->getMessage());
        }
    }
    return ['processed' => $processed, 'failed' => $failed];
}

/** Seeds the recurring housekeeping job (invoice overdue, quote expiry, retainers, recurring projects…). */
function ensure_sweep_scheduled(): void
{
    $bucket = (int)floor(now_ms() / (5 * 60000));
    enqueue_job('sweep.all', [], ['dedupeKey' => "sweep:{$bucket}"]);
}

/**
 * Called once at the end of a normal page/API request. At most every 20 seconds one visitor's request also runs due jobs (after
 * the response has been flushed when the server allows it), so emails and reminders go out without any cron setup.
 */
function pseudo_cron_tick(): void
{
    if (PHP_SAPI === 'cli' || getenv('FEP_NO_PSEUDO_CRON') === '1') {
        return;
    }
    try {
        [$ok] = rate_hit('cron:tick', 1, 20000);
        if (!$ok) {
            return;
        }
        if (function_exists('fastcgi_finish_request')) {
            @fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            @litespeed_finish_request();
        }
        ignore_user_abort(true);
        @set_time_limit(60);
        ensure_sweep_scheduled();
        run_jobs(['limit' => 25, 'budgetMs' => 8000]);
    } catch (Throwable $e) {
        app_log('pseudo-cron: ' . $e->getMessage());
    }
}

/** Housekeeping that runs every few minutes: overdue invoices, quote expiry, retainers, recurring projects, reminders. */
function run_sweeps(): array
{
    $out = [];
    $step = function (string $name, callable $fn) use (&$out) {
        try {
            $out[$name] = $fn();
        } catch (Throwable $e) {
            $out[$name] = 'error: ' . $e->getMessage();
            app_log("[sweep] {$name} failed: " . $e->getMessage());
        }
    };
    $step('invoices', 'sweep_invoices');
    $step('quotes', 'expire_quotes');
    $step('retainers', 'sweep_retainers');
    $step('recurring', 'sweep_recurring');
    $step('leadFollowUps', 'sweep_lead_follow_ups');
    $step('deadlines', function () {
        $now = now_ms();
        [$ph, $p] = Db::in(['ONBOARDING', 'AWAITING_ASSETS', 'QUEUED', 'EDITING', 'INTERNAL_REVIEW', 'REVISION']);
        $soon = Db::hydrateAll('projects', Db::rows("SELECT `id`, `workspaceId`, `clientId`, `deadline` FROM `projects` WHERE `status` IN {$ph} AND `deadline` >= ? AND `deadline` <= ?", [...$p, db_dt($now), db_dt($now + 36 * 3600000)]));
        foreach ($soon as $p) {
            enqueue_job('automation.emit', ['name' => 'project.deadline_soon', 'payload' => ['workspaceId' => $p['workspaceId'], 'projectId' => $p['id'], 'clientId' => $p['clientId']]], ['dedupeKey' => "deadline:{$p['id']}:" . substr((string)$p['deadline'], 0, 10)]);
        }
        return count($soon);
    });
    // Files that were never finished or never attached to anything would otherwise sit in storage forever.
    $step('uploads', function () {
        $day = 86400000;
        $now = now_ms();
        $stale = Db::rows("SELECT `id`, `storageKey`, `thumbnailKey` FROM `assets` WHERE (`status` = 'UPLOADING' AND `createdAt` < ?) OR (`draftToken` IS NOT NULL AND `leadId` IS NULL AND `createdAt` < ?) OR (`status` = 'FAILED' AND `createdAt` < ?) LIMIT 200", [db_dt($now - $day), db_dt($now - 30 * $day), db_dt($now - 7 * $day)]);
        foreach ($stale as $a) {
            storage()->remove($a['storageKey']);
            if ($a['thumbnailKey']) {
                storage()->remove($a['thumbnailKey']);
            }
        }
        return ['removed' => $stale ? Db::delete('assets', ['id' => array_column($stale, 'id')]) : 0];
    });
    $step('housekeeping', function () {
        $now = now_ms();
        $day = 86400000;
        $s = Db::exec('DELETE FROM `sessions` WHERE `expiresAt` < ?', [db_dt($now)]);
        $t = Db::exec('DELETE FROM `auth_tokens` WHERE `expiresAt` < ?', [db_dt($now - $day)]);
        $j = Db::exec("DELETE FROM `jobs` WHERE `status` = 'DONE' AND `completedAt` < ?", [db_dt($now - 7 * $day)]);
        // Read notifications are clutter after a quarter; nothing needs to live in an inbox for more than a year.
        $n = Db::exec('DELETE FROM `notifications` WHERE `readAt` < ? OR `createdAt` < ?', [db_dt($now - 90 * $day), db_dt($now - 365 * $day)]);
        // Run history and finished questionnaire drafts are records of things already stored elsewhere; keep them for a while, not forever.
        $r = Db::exec('DELETE FROM `automation_runs` WHERE `createdAt` < ?', [db_dt($now - 90 * $day)]);
        $d = Db::exec('DELETE FROM `onboarding_drafts` WHERE `submittedAt` < ? OR (`submittedAt` IS NULL AND `updatedAt` < ?)', [db_dt($now - 14 * $day), db_dt($now - 90 * $day)]);
        Db::exec('DELETE FROM `rate_limits` WHERE `resetAt` < ?', [$now - 60000]);
        return ['sessions' => $s, 'tokens' => $t, 'jobs' => $j, 'notifications' => $n, 'automationRuns' => $r, 'drafts' => $d];
    });
    try {
        ensure_sweep_scheduled();
    } catch (Throwable $e) {
    }
    return $out;
}
