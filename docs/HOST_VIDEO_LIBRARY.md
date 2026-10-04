# Host Video Library

StreamHub includes one private, server-hosted video-library slot. It is for a
movie or video that the host owns or is authorized to share. The feature turns
that source into adaptive HLS so it can be watched in the cinema player and in
Watch Party rooms.

## What the host can do

Only the library administrator, `buradepiyush@gmail.com`, can:

- view the storage meter and the current library title;
- permanently delete the current title and every generated playback file.

The administrator can enable or disable **Allow signed-in members to upload**
from the Video Library dialog. This switch is off by default and is saved in
`server/media/library-access.json`, so it survives a backend restart. When it
is enabled, members may start and monitor only their own upload jobs; they can
never delete a completed title, unlisted server files, or another member's
job. The administrator can always upload, delete, and cancel any job.

Guests cannot play a movie, join a Watch Party, chat, or use party voice.
Every playable stream, HLS segment, party socket, and WebRTC signaling request
is verified against a SecurePool login on the server.

## Host configuration

Set the storage budget in `server/.env`:

```env
# Total amount used by temporary source files and generated HLS files.
VIDEO_STORAGE_QUOTA_GB=20
```

The administrator email is intentionally fixed to `buradepiyush@gmail.com` in
the server authorization code. Quick-access demo login is disabled unless
`ALLOW_QUICK_ACCESS=true` is explicitly set for local development; it can never
issue an administrator account.

After changing either value, restart the backend in production. In local
development, `npm run dev` watches `.env` and `src/` and restarts automatically.
The startup log confirms the effective settings:

```text
🎞️  Video Library:        20 GB · Host buradepiyush@gmail.com
```

## Using the UI

1. Sign in normally as `buradepiyush@gmail.com`.
2. Select **Upload Video** in the navigation bar, or open the profile menu and
   choose **Manage 20 GB Video Library**.
3. Either select a supported file and choose **Upload and encode**, or paste a
   direct HTTPS video-file URL and choose **Download, encode, and add to library**.
4. Keep the dialog open while the progress status moves through probing,
   preview generation, HLS packaging, and completion.
5. When complete, refresh the catalogue if necessary. The title appears in
   **My Library** and can be played normally or selected when creating a Watch
   Party.
6. Optionally use **Allow signed-in members to upload** to grant upload-only
   access to other logged-in accounts. Turn it off to immediately block new
   member uploads.
7. Add more titles while free shared storage remains. Select **Delete** only for
   titles you want to remove and reclaim storage from.

Supported source containers are **MP4, MKV, MOV, M4V, and WebM**. The server
probes the source and converts it to browser-compatible adaptive HLS, so MKV
and MOV files do not need browser-native playback support.

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
   The encode is stopped before the 20 GB limit is crossed.
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
available 20 GB to be shared across titles.

The input-file limit is calculated as the smaller of 10 GB and two-thirds of
the total quota. With an empty 20 GB library, a source file may be up to 10 GB.
The worker reserves the remaining 10 GB while the original and generated HLS
output coexist. As completed titles consume storage, the upload limit lowers
automatically to preserve that encoding workspace.

A 4K package uses materially more storage and CPU time than a 1080p package.
The same 20 GB quota guard covers every HLS rendition, thumbnail, preview, and
temporary source. If a package needs more than the reserved workspace, the job
stops cleanly before the quota is exceeded; delete an older title or upload a
smaller authorized source before retrying.

If an encode fails or the quota guard triggers, the partial HLS directory and
temporary source are removed. The error shown in the manager explains whether
the file, FFmpeg, or quota caused the failure.

## API contract

All playback, party, and management calls require a valid SecurePool session.
The app exchanges the bearer token for an HttpOnly playback cookie so native
video players can request protected HLS files without exposing the token in a
movie URL. Do not put an access token in source control, screenshots, or public
documentation.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/playback-session` | Exchanges a valid bearer token for the protected, HttpOnly playback cookie. |
| `GET` | `/api/library/access` | Returns the signed-in user's upload/delete permissions and the member-upload switch state. |
| `PATCH` | `/api/library/access` | Administrator-only update of `{ "memberUploadsEnabled": true \| false }`. |
| `GET` | `/api/library` | Returns storage and library metadata. Unlisted-file cleanup is administrator-only. |
| `POST` | `/api/media/upload` | Administrator, or an allowed signed-in member, starts an HLS job. |
| `POST` | `/api/media/import-url` | Administrator, or an allowed signed-in member, imports an authorized direct HTTPS video URL. |
| `GET` | `/api/media/uploads/:jobId` | Returns job state only to its uploader or the administrator. |
| `DELETE` | `/api/library/:mediaId` | Administrator-only removal of a completed HLS title and its files. |

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
| `This account is not the configured library host` | The account is not `buradepiyush@gmail.com`. Only that verified SecurePool account may delete videos or change upload permission. |
| Upload controls are missing | Member uploads are disabled, the account is not signed in, or an active job holds the single-job slot. The administrator can enable member uploads from Video Library. |
| `EADDRINUSE` on port 5001 | Another backend already owns the port. Stop the old process, then start one backend with `npm run dev`. |
| Upload is rejected as too large | Reduce the source to the live limit shown in the manager. It reaches 10 GB only when at least 20 GB is free for the source and HLS workspace. |
| Storage is used but a video is missing from My Library | An interrupted job left an unlisted temporary source or HLS folder. The manager lists it under **Unlisted server files** with its size and an individual host-only Delete button. |
| Video is not visible after restart | Confirm `server/media/hls/<job-id>/master.m3u8` and `server/media/library.json` still exist and the backend can read `server/media/`. |
| Cross-device voice is unavailable | Browsers require HTTPS for microphone access outside `localhost`; configure HTTPS before using voice chat on phones or remote devices. |
