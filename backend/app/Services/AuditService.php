<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditService
{
    public static function log(string $action, array $data = []): void
    {
        $request = request();
        AuditLog::record(array_merge([
            'user_id' => $request?->user()?->id,
            'action' => $action,
            'ip' => $request?->ip(),
            'device' => substr((string) $request?->userAgent(), 0, 255),
        ], $data));
    }
}
