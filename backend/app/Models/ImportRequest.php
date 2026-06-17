<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ImportRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'reference', 'merchant_id', 'submitted_by', 'bank', 'amount', 'currency',
        'goods_type', 'supplier', 'invoice_number', 'port', 'stage', 'risk',
        'is_duplicate', 'progress', 'notes', 'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'amount' => 'decimal:2',
        'is_duplicate' => 'boolean',
    ];

    public const STAGES = [
        'draft', 'submitted', 'support_review', 'returned',
        'support_approved', 'executive_voting', 'approved',
        'rejected', 'awaiting_swift', 'customs_released', 'completed',
    ];

    public function merchant(): BelongsTo
    {
        return $this->belongsTo(Merchant::class);
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(RequestDocument::class);
    }

    public function votes(): HasMany
    {
        return $this->hasMany(RequestVote::class);
    }

    public function history(): HasMany
    {
        return $this->hasMany(RequestStageHistory::class);
    }

    public function recomputeProgress(): void
    {
        $idx = array_search($this->stage, self::STAGES, true);
        $this->progress = $idx === false ? 0 : (int) round(($idx / (count(self::STAGES) - 1)) * 100);
    }
}
