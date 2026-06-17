<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RequestStageHistory extends Model
{
    protected $table = 'request_stage_history';

    protected $fillable = [
        'import_request_id', 'from_stage', 'to_stage', 'actor_id', 'comment',
    ];
}
