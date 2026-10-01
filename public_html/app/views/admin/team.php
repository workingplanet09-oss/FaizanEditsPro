<?php defined('FEP') or exit; /** Vars: $members, $roles, $isSuper, $actor */ ?>
<?= ui_page_header('Team & permissions', 'Invite editors and managers, set their roles and suspend access. Every change is logged.') ?>
<div data-fe-component="team-manager" data-props="<?= json_attr(['members' => $members, 'roles' => $roles, 'meId' => $actor->userId, 'isSuper' => $isSuper]) ?>" class="space-y-6"></div>
