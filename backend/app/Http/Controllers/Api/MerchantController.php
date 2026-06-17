<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MerchantController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Merchant::query()
            ->when($request->string('search')->trim()->value(), fn ($qb, $s) =>
                $qb->where(fn ($w) => $w->where('name', 'like', "%$s%")
                    ->orWhere('tax_number', 'like', "%$s%")
                    ->orWhere('commercial_register', 'like', "%$s%")))
            ->when($request->string('status')->value(), fn ($qb, $s) => $qb->where('status', $s))
            ->latest();

        return response()->json($q->paginate(min((int) $request->input('per_page', 20), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:200',
            'tax_number' => 'required|string|max:60|unique:merchants',
            'commercial_register' => 'required|string|max:60|unique:merchants',
            'address' => 'nullable|string|max:255',
            'contact' => 'nullable|string|max:60',
            'category' => 'nullable|string|max:120',
            'status' => 'nullable|in:active,suspended,pending',
        ]);
        $data['created_by'] = $request->user()->id;
        $merchant = Merchant::create($data);
        AuditService::log('merchant_created', [
            'entity_type' => Merchant::class, 'entity_id' => $merchant->id,
        ]);
        return response()->json($merchant, 201);
    }

    public function show(Merchant $merchant): JsonResponse
    {
        return response()->json($merchant->load('requests'));
    }

    public function update(Request $request, Merchant $merchant): JsonResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|max:200',
            'address' => 'nullable|string|max:255',
            'contact' => 'nullable|string|max:60',
            'category' => 'nullable|string|max:120',
            'status' => 'sometimes|in:active,suspended,pending',
        ]);
        $merchant->update($data);
        AuditService::log('merchant_updated', [
            'entity_type' => Merchant::class, 'entity_id' => $merchant->id,
        ]);
        return response()->json($merchant);
    }

    public function destroy(Merchant $merchant): JsonResponse
    {
        $merchant->delete();
        AuditService::log('merchant_deleted', [
            'entity_type' => Merchant::class, 'entity_id' => $merchant->id,
        ]);
        return response()->json(['message' => 'OK']);
    }
}
