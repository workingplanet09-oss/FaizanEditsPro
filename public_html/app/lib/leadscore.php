<?php
/**
 * Internal lead scoring. NEVER shown to clients — surfaced to staff only as Hot / Warm / Cold / Needs review.
 * Inputs are onboarding answers keyed by stable question keys, so the model keeps working if wording changes.
 */
defined('FEP') or exit;

function score_lead(array $a): array
{
    static $BUDGET = ['under_250' => 4, '250_500' => 9, '500_1000' => 15, '1000_2500' => 21, '2500_5000' => 26, '5000_plus' => 30, 'not_sure' => 8];
    static $CLIENT_TYPE = ['corporate' => 12, 'agency' => 12, 'startup' => 9, 'brand' => 9, 'business' => 9, 'creator' => 7, 'personal_brand' => 6, 'other' => 3];
    static $COMPLEXITY = ['vsl' => 9, 'ads' => 9, 'motion_graphics' => 9, 'long_form' => 7, 'real_estate' => 6, 'podcast' => 6, 'video_editing' => 6, 'social_media' => 5, 'short_form' => 5, 'other' => 4];
    static $FREQUENCY = ['weekly' => 12, 'ongoing' => 12, 'few_per_month' => 9, 'monthly' => 8, 'occasionally' => 3, 'one_time' => 0];
    static $URGENCY = ['rush' => 10, 'standard' => 6, 'flexible' => 3];
    $one = fn($v) => is_array($v) ? js_str($v[0] ?? '') : js_str($v ?? '');
    $budgetKey = $one($a['budget'] ?? null);
    $volume = (float)js_number($a['videos_per_month'] ?? 0);
    $volume = is_nan($volume) ? 0 : $volume;
    $volumePts = $volume >= 20 ? 20 : ($volume >= 10 ? 16 : ($volume >= 5 ? 12 : ($volume >= 2 ? 8 : ($volume >= 1 ? 4 : 0))));
    $breakdown = [
        'budget' => $BUDGET[$budgetKey] ?? 0,
        'volume' => $volumePts,
        'urgency' => $URGENCY[$one($a['turnaround'] ?? null)] ?? 0,
        'clientType' => $CLIENT_TYPE[$one($a['client_type'] ?? null)] ?? 0,
        'complexity' => $COMPLEXITY[$one($a['looking_for'] ?? null)] ?? 0,
        'companySize' => (js_truthy($a['company'] ?? null) ? 3 : 0) + (js_truthy($a['website'] ?? null) ? 3 : 0),
        'retainerPotential' => $FREQUENCY[$one($a['video_frequency'] ?? null)] ?? 0,
    ];
    $score = min(100, array_sum($breakdown));
    $descLen = mb_strlen(trim(js_str($a['project_description'] ?? '')));
    $thin = ($budgetKey === '' || $budgetKey === 'not_sure') && ($volumePts === 0 || $descLen < 60);
    $temperature = $thin ? 'NEEDS_REVIEW' : ($score >= 62 ? 'HOT' : ($score >= 38 ? 'WARM' : 'COLD'));
    return ['score' => $score, 'breakdown' => $breakdown, 'temperature' => $temperature];
}
