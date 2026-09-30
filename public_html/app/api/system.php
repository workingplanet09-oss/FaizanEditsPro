<?php
/** Health check and the scheduled-jobs entry point. */
defined('FEP') or exit;

api_public('GET', '/api/health', function (Ctx $c) {
    Db::val('SELECT 1');
    return ['status' => 'ok', 'time' => iso_dt()];
});

/** POST /api/cron/run with `Authorization: Bearer <cron_key>` (config.php) runs due jobs; ?sweep=1 also runs housekeeping now. */
api_public('POST', '/api/cron/run', function (Ctx $c) {
    $given = preg_replace('/^Bearer\s+/i', '', (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
    $key = (string)cfg('cron_key', '');
    if ($key === '' || !safe_equal($given, $key)) {
        throw new AppError('UNAUTHENTICATED', 'Invalid cron key.');
    }
    $sweep = $c->req->q('sweep') === '1' ? run_sweeps() : (function () { ensure_sweep_scheduled(); return null; })();
    $total = 0;
    $failed = 0;
    for ($i = 0; $i < 5; $i++) {
        $r = run_jobs(['limit' => 100, 'budgetMs' => 20000]);
        $total += $r['processed'];
        $failed += $r['failed'];
        if ($r['processed'] === 0) {
            break;
        }
    }
    return ['processed' => $total, 'failed' => $failed, 'sweep' => $sweep];
}, ['csrf' => false, 'rate' => ['cron', 30, 60]]);
