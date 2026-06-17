<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password) || ! $user->is_active) {
            AuditService::log('login_failed', ['metadata' => ['email' => $data['email']]]);
            return response()->json(['message' => 'بيانات الاعتماد غير صحيحة'], 401);
        }

        $token = $user->createToken($data['device'] ?? 'web', ['*'], now()->addDays(7))->plainTextToken;
        AuditService::log('login_success', ['user_id' => $user->id]);

        return response()->json([
            'token' => $token,
            'user' => $this->transformUser($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->transformUser($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        AuditService::log('logout');
        return response()->json(['message' => 'OK']);
    }

    private function transformUser(User $user): array
    {
        $user->load('roles');
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'organization' => $user->organization,
            'roles' => $user->roles->map(fn ($r) => ['key' => $r->key, 'name_ar' => $r->name_ar])->all(),
        ];
    }
}
