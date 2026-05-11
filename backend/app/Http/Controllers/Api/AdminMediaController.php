<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AdminMediaController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimetypes:image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a', 'max:20480'],
        ]);

        $file = $data['file'];
        $directory = str_starts_with($file->getMimeType(), 'image/') ? 'questions/images' : 'questions/audio';
        $path = $file->store($directory, 'public');

        AdminActivityLog::query()->create([
            'admin_user_id' => $request->user()->id,
            'action' => 'upload_media',
            'metadata' => [
                'path' => $path,
                'mime' => $file->getMimeType(),
                'size' => $file->getSize(),
            ],
        ]);

        return response()->json([
            'success' => true,
            'file' => [
                'key' => $path,
                'url' => asset(Storage::disk('public')->url($path)),
                'mimetype' => $file->getMimeType(),
                'size' => $file->getSize(),
            ],
        ], 201);
    }
}
