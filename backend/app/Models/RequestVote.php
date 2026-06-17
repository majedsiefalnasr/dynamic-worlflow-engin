<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RequestVote extends Model
{
    protected $fillable = ['import_request_id', 'voter_id', 'vote', 'justification'];

    public function request(): BelongsTo
    {
        return $this->belongsTo(ImportRequest::class, 'import_request_id');
    }

    public function voter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voter_id');
    }
}
