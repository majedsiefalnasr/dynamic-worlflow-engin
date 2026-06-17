<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RequestDocument extends Model
{
    protected $fillable = [
        'import_request_id', 'type', 'original_name', 'path', 'mime', 'size', 'uploaded_by',
    ];

    public function request(): BelongsTo
    {
        return $this->belongsTo(ImportRequest::class, 'import_request_id');
    }
}
