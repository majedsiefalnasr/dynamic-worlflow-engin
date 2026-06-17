<?php

use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ImportRequestController;
use App\Http\Controllers\Api\MerchantController;
use App\Http\Controllers\Api\ReportController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Merchants
    Route::apiResource('merchants', MerchantController::class);

    // Import Requests
    Route::get('requests', [ImportRequestController::class, 'index']);
    Route::post('requests', [ImportRequestController::class, 'store']);
    Route::get('requests/{importRequest}', [ImportRequestController::class, 'show']);
    Route::post('requests/{importRequest}/transition', [ImportRequestController::class, 'transition']);
    Route::post('requests/{importRequest}/vote', [ImportRequestController::class, 'vote']);
    Route::get('requests/{importRequest}/documents/{documentId}', [ImportRequestController::class, 'downloadDocument']);

    // Audit
    Route::get('audit/logs', [AuditController::class, 'index'])
        ->middleware('role:admin,committee_manager,support_member');
    Route::get('audit/duplicates', [AuditController::class, 'duplicates'])
        ->middleware('role:admin,committee_manager,support_member');

    // Reports
    Route::get('reports/summary', [ReportController::class, 'summary']);
});

// Handle OPTIONS requests for CORS preflight
Route::match(['options'], '{anything}', function () {
    return response()
        ->header('Access-Control-Allow-Origin', request()->header('Origin'))
        ->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        ->header('Access-Control-Allow-Credentials', 'true')
        ->setStatusCode(200);
})->where('anything', '.*');

