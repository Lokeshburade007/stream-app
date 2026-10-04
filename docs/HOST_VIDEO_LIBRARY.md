# Host Video Library

StreamHub includes one private, server-hosted video-library slot. It is for a
movie or video that the host owns or is authorized to share. The feature turns
that source into adaptive HLS so it can be watched in the cinema player and in
Watch Party rooms.

## What the host can do

Only the configured host can:

- view the storage meter and the current library title;
- upload a supported source video;
- monitor its HLS encoding progress; and
- permanently delete the current title and every generated playback file.

Other signed-in users and guests can watch a completed title and join a party
for it, but cannot manage the library. The server, rather than the browser,
enforces this rule.

## Host configuration

Set these values in `server/.env`:

```env
# Exact email address of the verified SecurePool account allowed to manage media.
HOST_EMAIL=buradepiyush@gmail.com

# Total amount used by temporary source files and generated HLS files.
VIDEO_STORAGE_QUOTA_GB=15
```

`HOST_EMAIL` is case-insensitive, but it must match the email claim in the
SecurePool access token. The one-click demo accounts are deliberately not host
accounts and cannot be used to upload or delete.

After changing either value, restart the backend in production. In local
development, `npm run dev` watches `.env` and `src/` and restarts automatically.
The startup log confirms the effective settings:

```text
🎞️  Video Library:        15 GB · Host buradepiyush@gmail.com
```

## Using the UI

1. Sign in normally with the verified address configured in `HOST_EMAIL`.
2. Select **Upload Video** in the navigation bar, or open the profile menu and
   choose **Manage 15 GB Video Library**.
3. Either select a supported file and choose **Upload and encode**, or paste a
   direct HTTPS video-file URL and choose **Download, encode, and add to library**.
4. Keep the dialog open while the progress status moves through probing,
   preview generation, HLS packaging, and completion.
5. When complete, refresh the catalogue if necessary. The title appears in
   **My Library** and can be played normally or selected when creating a Watch
   Party.
6. Add more titles while free shared storage remains. Select **Delete** only for
   titles you want to remove and reclaim storage from.

URL imports are server jobs, not browser uploads. Once submitted, the same URL
is accepted only once: a repeated submission reconnects to the existing job and
shows its progress instead of downloading it again. Reloading or closing the
browser does not stop the download or encode; reopening the library manager
loads the active server job and resumes the live progress display.

If a server job is no longer wanted, use **Cancel & delete job** in the active
job panel. It stops the download or FFmpeg encode and removes that job's
temporary source and partial HLS files. It does not remove completed titles.

If the controls are not displayed, the current session does not have host
access. Sign out, sign back in with the configured verified account, and check
the backend startup log for the effective host email.

## Storage and transcoding logic

The quota covers all library material beneath `server/media/`:

```text
server/media/
├── uploads/             Temporary original while FFmpeg is working
├── hls/<job-id>/        HLS master playlist, quality playlists, segments,
│                        preview, thumbnail sprite, and VTT assets
└── library.json         Small manifest used to restore completed titles
                         after a backend restart
```

The worker does the following:

1. Saves the incoming source in `uploads/`.
2. Probes streams and duration with FFprobe.
3. Generates a preview, thumbnail sprite, VTT metadata, and source-aware HLS
   quality variants (360p, 720p, 1080p, and 2160p for a genuine 4K source).
   The 2160p rendition preserves the 3840×2160 source detail; smaller files
   are never upscaled and presented as 4K.
4. Watches the combined `uploads/` and `hls/` byte count while FFmpeg runs.
   The encode is stopped before the 15 GB limit is crossed.
5. Saves completed metadata to `library.json`, then removes the original
   source. The adaptive HLS package remains available for playback.

During an active URL import, the storage meter includes both the temporary
downloaded source and the HLS files already being generated. For example, a
4.5 GB source plus 1.5 GB of HLS segments correctly displays about 6 GB in use.
This is not a duplicate download. The manager shows both values separately and
the temporary source is removed after a successful encode.

The storage meter also lists the exact encoded disk usage beside every playable
library title. Any space that cannot be attributed to a listed title appears as
**Unlisted server files**, where each item has its own size and Delete control.

Only one import/encoding job runs at a time, but the library can retain multiple
completed movies. This keeps the storage budget predictable while allowing the
available 15 GB to be shared across titles.

The input-file limit is calculated as the smaller of 10 GB and two-thirds of
the total quota. With an empty 15 GB library, a source file may be up to 10 GB.
The worker reserves the remaining 5 GB while the original and generated HLS
output coexist. As completed titles consume storage, the upload limit lowers
automatically to preserve that encoding workspace.

A 4K package uses materially more storage and CPU time than a 1080p package.
The same 15 GB quota guard covers every HLS rendition, thumbnail, preview, and
temporary source. If a package needs more than the reserved workspace, the job
stops cleanly before the quota is exceeded; delete an older title or upload a
smaller authorized source before retrying.

If an encode fails or the quota guard triggers, the partial HLS directory and
temporary source are removed. The error shown in the manager explains whether
the file, FFmpeg, or quota caused the failure.

## API contract

All management calls require a valid SecurePool bearer token for the configured
host. Do not put an access token in source control, screenshots, or public
documentation.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/library/access` | Returns `{ canManage: true }` only for the configured host. The frontend uses this as the access source of truth. |
| `GET` | `/api/library` | Returns storage usage, quota, allowed source size, and completed library metadata. |
| `POST` | `/api/media/upload` | Accepts a multipart `video` field and begins an asynchronous HLS job. |
| `POST` | `/api/media/import-url` | Downloads a validated public HTTPS direct-video URL to the server, then begins the HLS job. |
| `GET` | `/api/media/uploads/:jobId` | Returns job state and percentage while encoding. |
| `DELETE` | `/api/library/:mediaId` | Removes the completed HLS title and updates the manifest. |

Example host upload:

```bash
export ACCESS_TOKEN='your-current-securepool-access-token'

curl --request POST http://localhost:5001/api/media/upload \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --form 'video=@/absolute/path/to/your-authorized-video.mp4'
```

The response contains a job ID. Poll `/api/media/uploads/<job-id>` until it is
`completed` or `failed`.

For URL imports, send JSON such as `{ "url": "https://media.example/video.mp4" }`
to `/api/media/import-url`. Only use a direct file URL for video you own or are
authorized to store. Private-network URLs, non-HTTPS links, credentialed URLs,
and redirect chains are rejected.

## Troubleshooting

| Symptom | Cause and resolution |
| --- | --- |
| `Only Lokesh (Host)...` or `This account is not the configured library host` | A stale backend was running or the token belongs to another account. Restart the backend, sign out/in, and verify `HOST_EMAIL` in `server/.env`. |
| Upload controls are missing | The browser asked `/api/library/access` and the current token is not the configured host. Use normal verified sign-in; demo profiles cannot manage media. |
| `EADDRINUSE` on port 5001 | Another backend already owns the port. Stop the old process, then start one backend with `npm run dev`. |
| Upload is rejected as too large | Reduce the source to the live limit shown in the manager. It reaches 10 GB only when at least 15 GB is free for the source and HLS workspace. |
| Storage is used but a video is missing from My Library | An interrupted job left an unlisted temporary source or HLS folder. The manager lists it under **Unlisted server files** with its size and an individual host-only Delete button. |
| Video is not visible after restart | Confirm `server/media/hls/<job-id>/master.m3u8` and `server/media/library.json` still exist and the backend can read `server/media/`. |
| Cross-device voice is unavailable | Browsers require HTTPS for microphone access outside `localhost`; configure HTTPS before using voice chat on phones or remote devices. |
