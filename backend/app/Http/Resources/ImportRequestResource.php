<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ImportRequestResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'merchant' => [
                'id' => $this->merchant_id,
                'name' => $this->whenLoaded('merchant', fn () => $this->merchant->name),
            ],
            'submitted_by' => $this->whenLoaded('submitter', fn () => [
                'id' => $this->submitter->id,
                'name' => $this->submitter->name,
            ]),
            'bank' => $this->bank,
            'amount' => (float) $this->amount,
            'currency' => $this->currency,
            'goods_type' => $this->goods_type,
            'supplier' => $this->supplier,
            'invoice_number' => $this->invoice_number,
            'port' => $this->port,
            'stage' => $this->stage,
            'risk' => $this->risk,
            'is_duplicate' => $this->is_duplicate,
            'progress' => $this->progress,
            'notes' => $this->notes,
            'documents' => $this->whenLoaded('documents'),
            'votes' => $this->whenLoaded('votes'),
            'history' => $this->whenLoaded('history'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
