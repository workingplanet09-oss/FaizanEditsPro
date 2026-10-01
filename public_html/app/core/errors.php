<?php
/** Every expected failure is an AppError — the API layer turns it into a consistent JSON envelope. */
defined('FEP') or exit;

final class AppError extends Exception
{
    private const STATUS = [
        'BAD_REQUEST' => 400, 'UNAUTHENTICATED' => 401, 'FORBIDDEN' => 403, 'NOT_FOUND' => 404, 'CONFLICT' => 409,
        'VALIDATION' => 422, 'RATE_LIMITED' => 429, 'INVALID_TRANSITION' => 409, 'PAYMENT_REQUIRED' => 402, 'GATED' => 423,
        'UNSUPPORTED' => 415, 'TOO_LARGE' => 413, 'NOT_CONFIGURED' => 501, 'INTERNAL' => 500, 'METHOD_NOT_ALLOWED' => 405, 'UNAVAILABLE' => 503,
    ];

    public string $errorCode;
    public int $status;
    /** @var array<string,string>|null */
    public ?array $fields;
    public ?int $retryAfterSec;

    public function __construct(string $code, string $message, ?array $fields = null, ?int $retryAfterSec = null)
    {
        parent::__construct($message);
        $this->errorCode = $code;
        $this->status = self::STATUS[$code] ?? 500;
        $this->fields = $fields;
        $this->retryAfterSec = $retryAfterSec;
    }
}

function not_found(string $what = 'Resource'): AppError
{
    return new AppError('NOT_FOUND', "{$what} not found.");
}

function forbidden(string $msg = "You don't have permission to do that."): AppError
{
    return new AppError('FORBIDDEN', $msg);
}

function bad_request(string $msg, ?array $fields = null): AppError
{
    return new AppError('BAD_REQUEST', $msg, $fields);
}

function conflict(string $msg): AppError
{
    return new AppError('CONFLICT', $msg);
}
