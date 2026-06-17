<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ImportRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function summary(): JsonResponse
    {
        $byStage = ImportRequest::select('stage', DB::raw('COUNT(*) as total'))
            ->groupBy('stage')->pluck('total', 'stage');

        $monthly = ImportRequest::select(
                DB::raw("strftime('%Y-%m', created_at) as month"),
                DB::raw('COUNT(*) as total'),
                DB::raw("SUM(CASE WHEN stage IN ('approved','completed','customs_released','awaiting_swift') THEN 1 ELSE 0 END) as approved"),
                DB::raw("SUM(CASE WHEN stage='rejected' THEN 1 ELSE 0 END) as rejected")
            )
            ->groupBy('month')->orderBy('month')->get();

        $byCategory = ImportRequest::select('goods_type', DB::raw('COUNT(*) as total'))
            ->groupBy('goods_type')->orderByDesc('total')->get();

        $totals = [
            'total_requests' => ImportRequest::count(),
            'total_value_usd' => (float) ImportRequest::where('currency', 'USD')->sum('amount'),
            'pending' => ImportRequest::whereIn('stage', ['submitted', 'support_review', 'executive_voting'])->count(),
            'completed' => ImportRequest::where('stage', 'completed')->count(),
        ];

        return response()->json(compact('byStage', 'monthly', 'byCategory', 'totals'));
    }
}
