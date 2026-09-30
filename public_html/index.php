<?php
/** Front controller: every page and API request enters here (see .htaccess). */
define('FEP', true);
define('FEP_ROOT', __DIR__);
require FEP_ROOT . '/app/bootstrap.php';
App::run();
