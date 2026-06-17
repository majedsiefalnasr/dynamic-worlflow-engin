<?php

namespace App\Http\Requests\ImportRequest;

use App\Models\ImportRequest;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StageTransitionRequest extends FormRequest
{
    public function authorize(): bool { return $this->user() !== null; }

    public function rules(): array
    {
        return [
            'to_stage' => ['required', Rule::in(ImportRequest::STAGES)],
            'comment' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
