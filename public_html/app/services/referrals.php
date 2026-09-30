<?php
/** Client referral programme (switch on in Settings → Workflow). */
defined('FEP') or exit;

function get_my_referrals(Actor $actor): array
{
    $wf = get_setting($actor->workspaceId, 'workflow');
    if (empty($wf['referralsEnabled'])) {
        return ['enabled' => false];
    }
    $client = primary_client_for($actor);
    if (!$client) {
        throw new AppError('NOT_FOUND', 'No company linked.');
    }
    $rows = Db::find('referrals', ['referrerClientId' => $client['id']], ['order' => '`createdAt` DESC']);
    return [
        'enabled' => true, 'code' => $client['referralCode'], 'link' => absolute_url('/start-project?ref=' . $client['referralCode']), 'reward' => $wf['referralReward'],
        'referrals' => array_map(fn($r) => ['id' => $r['id'], 'status' => $r['status'], 'reward' => $r['reward'], 'createdAt' => $r['createdAt']], $rows),
    ];
}

function list_referrals(Actor $actor): array
{
    assert_can($actor, 'clients:read');
    $rows = Db::find('referrals', ['workspaceId' => $actor->workspaceId], ['order' => '`createdAt` DESC', 'limit' => 200]);
    $ids = array_values(array_unique(array_filter(array_merge(array_column($rows, 'referrerClientId'), array_column($rows, 'referredClientId')))));
    $names = [];
    if ($ids) {
        [$ph, $pp] = Db::in($ids);
        $names = array_column(Db::rows("SELECT `id`, `companyName` FROM `clients` WHERE `id` IN {$ph}", $pp), 'companyName', 'id');
    }
    return array_map(fn($r) => $r + ['referrer' => $names[$r['referrerClientId']] ?? '—', 'referred' => $r['referredClientId'] ? ($names[$r['referredClientId']] ?? '—') : null], $rows);
}

/** $patch: status? (PENDING|QUALIFIED|REWARDED|EXPIRED), reward? */
function update_referral(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'clients:write');
    if (!Db::exists('referrals', ['id' => $id, 'workspaceId' => $actor->workspaceId])) {
        throw not_found('Referral');
    }
    $data = [];
    foreach (['status', 'reward'] as $k) {
        if (array_key_exists($k, $patch)) {
            $data[$k] = $patch[$k];
        }
    }
    Db::update('referrals', ['id' => $id], $data);
    return Db::first('referrals', ['id' => $id]);
}
