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
VIDEO_STORAGE_QUOTA_GB=10
```

`HOST_EMAIL` is case-insensitive, but it must match the email claim in the
SecurePool access token. The one-click demo accounts are deliberately not host
accounts and cannot be used to upload or delete.

After changing either value, restart the backend in production. In local
development, `npm run dev` watches `.env` and `src/` and restarts automatically.
The startup log confirms the effective settings:

```text
🎞️  Video Library:        10 GB · Host buradepiyush@gmail.com
```

## Using the UI

1. Sign in normally with the verified address configured in `HOST_EMAIL`.
2. Select **Upload Video** in the navigation bar, or open the profile menu and
   choose **Manage 10 GB Video Library**.
3. Select one supported file and choose **Upload and encode**.
4. Keep the dialog open while the progress status moves through probing,
   preview generation, HLS packaging, and completion.
5. When complete, refresh the catalogue if necessary. The title appears in
   **My Library** and can be played normally or selected when creating a Watch
   Party.
6. To replace it, select **Delete** in the library manager. Only after deletion
   completes can a new source be uploaded.

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
3. Generates a preview, thumbnail sprite, VTT metadata, and HLS quality
   variants (up to 360p, 720p, and 1080p as appropriate for the source).
4. Watches the combined `uploads/` and `hls/` byte count while FFmpeg runs.
   The encode is stopped before the 10 GB limit is crossed.
5. Saves completed metadata to `library.json`, then removes the original
   source. The adaptive HLS package remains available for playback.

Only one job and one completed movie are allowed at a time. This is intentional:
it makes the storage budget predictable and prevents a new upload from
overwriting or competing with an existing movie.

The input-file limit is calculated as the smaller of 2 GB and 25% of the total
quota. With a 10 GB library, a source file may be up to 2 GB. This reserved
space is necessary because source and generated HLS output coexist during
transcoding. Allowing a 10 GB source into a 10 GB total library would leave no
safe space for playable HLS output.

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

## Troubleshooting

| Symptom | Cause and resolution |
| --- | --- |
| `Only Lokesh (Host)...` or `This account is not the configured library host` | A stale backend was running or the token belongs to another account. Restart the backend, sign out/in, and verify `HOST_EMAIL` in `server/.env`. |
| Upload controls are missing | The browser asked `/api/library/access` and the current token is not the configured host. Use normal verified sign-in; demo profiles cannot manage media. |
| `EADDRINUSE` on port 5001 | Another backend already owns the port. Stop the old process, then start one backend with `npm run dev`. |
| Upload is rejected as too large | Reduce the source to the limit shown in the manager. The quota is total storage, not a 10 GB per-source limit. |
| Video is not visible after restart | Confirm `server/media/hls/<job-id>/master.m3u8` and `server/media/library.json` still exist and the backend can read `server/media/`. |
| Cross-device voice is unavailable | Browsers require HTTPS for microphone access outside `localhost`; configure HTTPS before using voice chat on phones or remote devices. |

