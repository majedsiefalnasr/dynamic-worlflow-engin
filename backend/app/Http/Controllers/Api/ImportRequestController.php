<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ImportRequest\StageTransitionRequest;
use App\Http\Requests\ImportRequest\StoreImportRequest;
use App\Http\Resources\ImportRequestResource;
use App\Models\ImportRequest;
use App\Models\RequestStageHistory;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ImportRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $q = ImportRequest::query()->with(['merchant', 'submitter']);

        // Banks/exchanges only see their own submissions
        if ($user->hasAnyRole(['commercial_bank', 'exchange'])) {
            $q->where('submitted_by', $user->id);
        }

        $q->when($request->string('stage')->value(), fn ($qb, $s) => $qb->where('stage', $s))
          ->when($request->string('search')->value(), fn ($qb, $s) =>
              $qb->where(fn ($w) => $w->where('reference', 'like', "%$s%")
                  ->orWhere('invoice_number', 'like', "%$s%")
                  ->orWhere('supplier', 'like', "%$s%")))
          ->latest();

        return response()->json(
            $q->paginate(min((int) $request->input('per_page', 20), 100))
        );
    }

    public function store(StoreImportRequest $request): JsonResponse
    {
        $data = $request->validated();

        $req = DB::transaction(function () use ($data, $request) {
            $reference = 'IMP-'.now()->year.'-'.str_pad((string) (ImportRequest::max('id') + 1001), 4, '0', STR_PAD_LEFT);

            // Duplicate detection
            $duplicate = ImportRequest::where('invoice_number', $data['invoice_number'])->exists();

            $req = ImportRequest::create([
                ...$data,
                'reference' => $reference,
                'submitted_by' => $request->user()->id,
                'stage' => 'submitted',
                'risk' => $data['amount'] > 1_000_000 ? 'high' : ($data['amount'] > 250_000 ? 'medium' : 'low'),
                'is_duplicate' => $duplicate,
            ]);
            $req->recomputeProgress();
            $req->save();

            if ($request->hasFile('documents')) {
                foreach ($request->file('documents') as $file) {
                    $path = $file->store('requests/'.$req->id, 'local');
                    $req->documents()->create([
                        'type' => 'attachment',
                        'original_name' => $file->getClientOriginalName(),
                        'path' => $path,
                        'mime' => $file->getMimeType(),
                        'size' => $file->getSize(),
                        'uploaded_by' => $request->user()->id,
                    ]);
                }
            }

            RequestStageHistory::create([
                'import_request_id' => $req->id,
                'from_stage' => null,
                'to_stage' => 'submitted',
                'actor_id' => $request->user()->id,
                'comment' => 'تم تقديم الطلب',
            ]);

            AuditService::log('request_submitted', [
                'entity_type' => ImportRequest::class, 'entity_id' => $req->id,
                'reference' => $req->reference,
            ]);

            return $req;
        });

        return (new ImportRequestResource($req->load(['merchant', 'submitter', 'documents'])))
            ->response()->setStatusCode(201);
    }

    public function show(ImportRequest $importRequest): JsonResponse
    {
        return response()->json(new ImportRequestResource(
            $importRequest->load(['merchant', 'submitter', 'documents', 'votes.voter', 'history'])
        ));
    }

    public function transition(StageTransitionRequest $request, ImportRequest $importRequest): JsonResponse
    {
        $to = $request->validated('to_stage');
        $user = $request->user();

        $allowed = $this->canTransition($user, $importRequest->stage, $to);
        if (! $allowed) {
            return response()->json(['message' => 'انتقال غير مسموح'], 403);
        }

        DB::transaction(function () use ($importRequest, $to, $user, $request) {
            $from = $importRequest->stage;
            $importRequest->stage = $to;
            $importRequest->recomputeProgress();
            $importRequest->save();

            RequestStageHistory::create([
                'import_request_id' => $importRequest->id,
                'from_stage' => $from,
                'to_stage' => $to,
                'actor_id' => $user->id,
                'comment' => $request->validated('comment'),
            ]);

            AuditService::log('request_transition', [
                'entity_type' => ImportRequest::class,
                'entity_id' => $importRequest->id,
                'reference' => $importRequest->reference,
                'metadata' => ['from' => $from, 'to' => $to],
            ]);
        });

        return response()->json(new ImportRequestResource($importRequest->fresh(['history'])));
    }

    public function vote(Request $request, ImportRequest $importRequest): JsonResponse
    {
        $user = $request->user();
        if (! $user->hasRole('executive_member')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($importRequest->stage !== 'executive_voting') {
            return response()->json(['message' => 'الطلب ليس في مرحلة التصويت'], 422);
        }

        $data = $request->validate([
            'vote' => 'required|in:approve,reject,abstain',
            'justification' => 'nullable|string|max:2000',
        ]);

        $vote = $importRequest->votes()->updateOrCreate(
            ['voter_id' => $user->id],
            ['vote' => $data['vote'], 'justification' => $data['justification'] ?? null],
        );

        AuditService::log('request_vote', [
            'entity_type' => ImportRequest::class,
            'entity_id' => $importRequest->id,
            'reference' => $importRequest->reference,
            'metadata' => ['vote' => $data['vote']],
        ]);

        return response()->json($vote);
    }

    public function downloadDocument(Request $request, ImportRequest $importRequest, int $documentId)
    {
        $doc = $importRequest->documents()->findOrFail($documentId);
        return Storage::disk('local')->download($doc->path, $doc->original_name);
    }

    private function canTransition($user, string $from, string $to): bool
    {
        $matrix = [
            'submitted' => ['support_review' => ['support_member', 'committee_manager']],
            'support_review' => [
                'returned' => ['support_member', 'committee_manager'],
                'support_approved' => ['support_member', 'committee_manager'],
                'rejected' => ['support_member', 'committee_manager'],
            ],
            'returned' => ['submitted' => ['commercial_bank', 'exchange']],
            'support_approved' => ['executive_voting' => ['committee_manager']],
            'executive_voting' => [
                'approved' => ['committee_manager'],
                'rejected' => ['committee_manager'],
            ],
            'approved' => ['awaiting_swift' => ['commercial_bank', 'committee_manager']],
            'awaiting_swift' => ['customs_released' => ['admin', 'committee_manager']],
            'customs_released' => ['completed' => ['admin', 'committee_manager']],
        ];

        $allowedRoles = $matrix[$from][$to] ?? null;
        return $allowedRoles && $user->hasAnyRole($allowedRoles);
    }
}
