<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ImportRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = AuditLog::with('user:id,name,email')
            ->when($request->string('action')->value(), fn ($qb, $a) => $qb->where('action', $a))
            ->when($request->string('user_id')->value(), fn ($qb, $u) => $qb->where('user_id', $u))
            ->latest();

        return response()->json($q->paginate(min((int) $request->input('per_page', 50), 200)));
    }

    public function duplicates(): JsonResponse
    {
        $rows = ImportRequest::select('invoice_number')
            ->groupBy('invoice_number')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('invoice_number');

        $items = ImportRequest::with('merchant')
            ->whereIn('invoice_number', $rows)
            ->orderBy('invoice_number')
            ->get();

        return response()->json(['items' => $items]);
    }
}
