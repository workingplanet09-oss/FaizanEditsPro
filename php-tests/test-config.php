<?php
/** Settings for automated tests only (never deployed as configuration). */
return [
    'db' => ['host' => '127.0.0.1', 'port' => 3306, 'name' => getenv('FEP_TEST_DB') ?: 'faizan_php', 'user' => 'faizan', 'password' => 'faizan_dev'],
    'app_url' => getenv('FEP_TEST_NO_APP_URL') ? '' : (getenv('FEP_TEST_URL') ?: 'http://127.0.0.1:8081'),
    'secret' => 'test-secret-test-secret-test-secret-test-secret-1234',
    'mode' => getenv('FEP_TEST_MODE') ?: 'demo',
    'debug' => getenv('FEP_TEST_DEBUG') !== '0',
    'trusted_proxy_hops' => (int)getenv('FEP_TEST_HOPS'),
    'email' => ['driver' => 'log'],
    'cron_key' => 'test-cron-key-123',
] + (getenv('FEP_TEST_TURNSTILE') ? ['turnstile' => ['site_key' => '1x00000000000000000000AA', 'secret_key' => '1x0000000000000000000000000000000AA']] : []) + (getenv('FEP_TEST_STRIPE') ? ['payments' => ['provider' => 'stripe', 'secret_key' => 'sk_test_not_a_real_key', 'webhook_secret' => getenv('FEP_TEST_STRIPE')]] : []);
