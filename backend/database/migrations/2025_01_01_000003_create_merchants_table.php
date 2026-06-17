<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('merchants', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('tax_number')->unique();
            $t->string('commercial_register')->unique();
            $t->string('address')->nullable();
            $t->string('contact')->nullable();
            $t->string('category')->nullable();
            $t->enum('status', ['active', 'suspended', 'pending'])->default('pending');
            $t->unsignedInteger('transactions_count')->default(0);
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->softDeletes();
            $t->index(['status', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('merchants');
    }
};
