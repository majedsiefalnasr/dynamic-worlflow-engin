<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['status' => 'ok', 'app' => 'National Import Financing Committee Platform API']);
});

Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});
