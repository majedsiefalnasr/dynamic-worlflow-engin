<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('import_requests', function (Blueprint $t) {
            $t->id();
            $t->string('reference')->unique(); // IMP-2025-1000
            $t->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('submitted_by')->constrained('users');
            $t->string('bank');
            $t->decimal('amount', 18, 2);
            $t->enum('currency', ['USD', 'EUR', 'SAR']);
            $t->string('goods_type');
            $t->string('supplier');
            $t->string('invoice_number');
            $t->string('port');
            $t->enum('stage', [
                'draft', 'submitted', 'support_review', 'returned',
                'support_approved', 'executive_voting', 'approved',
                'rejected', 'awaiting_swift', 'customs_released', 'completed',
            ])->default('draft');
            $t->enum('risk', ['low', 'medium', 'high'])->default('low');
            $t->boolean('is_duplicate')->default(false);
            $t->unsignedTinyInteger('progress')->default(0);
            $t->text('notes')->nullable();
            $t->json('metadata')->nullable();
            $t->timestamps();
            $t->index(['stage', 'created_at']);
            $t->index('invoice_number');
        });

        Schema::create('request_documents', function (Blueprint $t) {
            $t->id();
            $t->foreignId('import_request_id')->constrained()->cascadeOnDelete();
            $t->string('type'); // invoice, certificate_of_origin, packing_list, ...
            $t->string('original_name');
            $t->string('path');
            $t->string('mime')->nullable();
            $t->unsignedInteger('size')->nullable();
            $t->foreignId('uploaded_by')->constrained('users');
            $t->timestamps();
        });

        Schema::create('request_stage_history', function (Blueprint $t) {
            $t->id();
            $t->foreignId('import_request_id')->constrained()->cascadeOnDelete();
            $t->string('from_stage')->nullable();
            $t->string('to_stage');
            $t->foreignId('actor_id')->constrained('users');
            $t->text('comment')->nullable();
            $t->timestamps();
        });

        Schema::create('request_votes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('import_request_id')->constrained()->cascadeOnDelete();
            $t->foreignId('voter_id')->constrained('users');
            $t->enum('vote', ['approve', 'reject', 'abstain']);
            $t->text('justification')->nullable();
            $t->timestamps();
            $t->unique(['import_request_id', 'voter_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('request_votes');
        Schema::dropIfExists('request_stage_history');
        Schema::dropIfExists('request_documents');
        Schema::dropIfExists('import_requests');
    }
};
