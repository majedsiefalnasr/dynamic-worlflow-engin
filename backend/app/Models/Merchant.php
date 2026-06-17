<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Merchant extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name', 'tax_number', 'commercial_register', 'address',
        'contact', 'category', 'status', 'created_by',
    ];

    public function requests(): HasMany
    {
        return $this->hasMany(ImportRequest::class);
    }
}
