<?php
/** Settings for automated tests only (never deployed as configuration). */
return [
    'db' => ['host' => '127.0.0.1', 'port' => 3306, 'name' => getenv('FEP_TEST_DB') ?: 'faizan_php', 'user' => 'faizan', 'password' => 'faizan_dev'],
    'app_url' => getenv('FEP_TEST_URL') ?: 'http://127.0.0.1:8081',
    'secret' => 'test-secret-test-secret-test-secret-test-secret-1234',
    'mode' => getenv('FEP_TEST_MODE') ?: 'demo',
    'debug' => true,
    'trusted_proxy_hops' => 0,
    'email' => ['driver' => 'log'],
    'cron_key' => 'test-cron-key-123',
];
