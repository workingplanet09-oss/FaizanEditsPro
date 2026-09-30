<?php
/** Testimonials: requested on delivery, submitted by the client, published only after an admin approves them. */
defined('FEP') or exit;

/** Triggered on delivery: asks the client how it went. Nothing is published without admin approval. */
function request_testimonial(string $projectId): ?array
{
    $project = Db::first('projects', ['id' => $projectId]);
    if (!$project) {
        return null;
    }
    $existing = Db::first('testimonial_requests', ['projectId' => $projectId]);
    if ($existing) {
        return $existing;
    }
    $client = Db::first('clients', ['id' => $project['clientId']]);
    $req = Db::insert('testimonial_requests', ['workspaceId' => $project['workspaceId'], 'projectId' => $projectId, 'clientId' => $project['clientId'], 'token' => random_token(20)]);
    $members = Db::col("SELECT `userId` FROM `organization_members` WHERE `organizationId` = ? AND `role` IN ('OWNER','MANAGER')", [$project['organizationId']]);
    $link = "/dashboard/projects/{$projectId}?tab=feedback";
    notify([
        'workspaceId' => $project['workspaceId'], 'userIds' => $members, 'category' => 'PROJECT', 'type' => 'testimonial.requested', 'title' => 'How was your experience?',
        'message' => "Tell us about {$project['name']} — it takes a minute.", 'link' => $link, 'email' => true, 'emailTemplate' => 'testimonial_request',
        'emailVars' => ['project_name' => $project['name'], 'project_url' => absolute_url($link), 'client_name' => $client['name']],
    ]);
    log_activity(system_actor('System'), ['workspaceId' => $project['workspaceId'], 'type' => 'testimonial.requested', 'message' => 'Feedback requested from the client', 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'INTERNAL']);
    emit('testimonial.requested', ['workspaceId' => $project['workspaceId'], 'projectId' => $projectId, 'clientId' => $project['clientId']]);
    return $req;
}

function get_feedback_state(Actor $actor, string $projectId): array
{
    $project = require_project($actor, $projectId);
    $req = Db::first('testimonial_requests', ['projectId' => $projectId]);
    $submitted = Db::first('testimonials', ['projectId' => $projectId, 'workspaceId' => $actor->workspaceId], ['cols' => ['id', 'rating', 'status', 'createdAt']]);
    $client = Db::first('clients', ['id' => $project['clientId']], ['cols' => ['name', 'companyName']]);
    return ['requested' => (bool)$req, 'submitted' => $submitted ? ['rating' => $submitted['rating'], 'createdAt' => $submitted['createdAt']] : null, 'defaults' => ['name' => $actor->name, 'company' => $client['companyName'] ?? '']];
}

/** $in: rating, quote, permissionToPublish, name, role?, company?, imageUrl? */
function submit_testimonial(Actor $actor, string $projectId, array $in): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'message');
    if (!in_array($project['status'], ['DELIVERED', 'ARCHIVED', 'APPROVED'], true)) {
        throw new AppError('GATED', 'You can share feedback once the project is approved.');
    }
    if ($in['rating'] < 1 || $in['rating'] > 5) {
        throw bad_request('Choose a rating from 1 to 5.', ['rating' => 'Required.']);
    }
    if (mb_strlen(trim($in['quote'])) < 10) {
        throw bad_request('Tell us a little more (at least a sentence).', ['quote' => 'Too short.']);
    }
    if (Db::exists('testimonials', ['projectId' => $projectId, 'workspaceId' => $actor->workspaceId])) {
        throw new AppError('CONFLICT', "You've already shared feedback for this project. Thank you!");
    }
    $t = Db::insert('testimonials', [
        'workspaceId' => $actor->workspaceId, 'projectId' => $projectId, 'clientId' => $project['clientId'], 'rating' => (int)$in['rating'], 'quote' => mb_substr(trim($in['quote']), 0, 2000),
        'permissionToPublish' => !empty($in['permissionToPublish']), 'name' => mb_substr(trim($in['name']), 0, 100), 'role' => isset($in['role']) ? mb_substr(trim($in['role']), 0, 100) : null,
        'company' => isset($in['company']) ? mb_substr(trim($in['company']), 0, 100) : null, 'imageUrl' => (!empty($in['imageUrl']) && preg_match('#^https?://#', $in['imageUrl'])) ? $in['imageUrl'] : null,
        'status' => 'PENDING', 'isDemo' => $project['isDemo'],
    ]);
    Db::exec('UPDATE `testimonial_requests` SET `completedAt` = ? WHERE `projectId` = ?', [db_dt(), $projectId]);
    $admins = Db::col("SELECT u.`id` FROM `users` u WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`key` IN ('super_admin','admin'))", [$actor->workspaceId]);
    notify(['workspaceId' => $actor->workspaceId, 'userIds' => $admins, 'category' => 'PROJECT', 'type' => 'testimonial.submitted', 'title' => "New {$in['rating']}★ testimonial from {$in['name']}", 'message' => mb_substr($in['quote'], 0, 120), 'link' => '/admin/content?r=testimonials', 'email' => false]);
    return ['id' => $t['id']];
}
