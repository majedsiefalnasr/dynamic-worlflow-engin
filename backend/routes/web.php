<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['status' => 'ok', 'app' => 'CBY Imports Platform API']);
});

Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});
