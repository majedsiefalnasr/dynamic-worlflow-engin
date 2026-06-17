<?php

namespace App\Http\Requests\ImportRequest;

use Illuminate\Foundation\Http\FormRequest;

class StoreImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasAnyRole(['commercial_bank', 'exchange']) ?? false;
    }

    public function rules(): array
    {
        return [
            'merchant_id' => ['required', 'exists:merchants,id'],
            'bank' => ['required', 'string', 'max:120'],
            'amount' => ['required', 'numeric', 'min:1', 'max:100000000'],
            'currency' => ['required', 'in:USD,EUR,SAR'],
            'goods_type' => ['required', 'string', 'max:120'],
            'supplier' => ['required', 'string', 'max:200'],
            'invoice_number' => ['required', 'string', 'max:80'],
            'port' => ['required', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'documents' => ['nullable', 'array', 'max:20'],
            'documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }
}
