# TraceX — AI Video Investigator

**TraceX** is an enterprise-grade CCTV multi-camera forensic investigation dashboard engineered for cybersecurity incident response and physical security breaches.

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS (Vite SPA)
- **Backend**: Node.js + Express (`server.ts`) with Vite dev middleware
- **Computer Vision Service Adapter**: A local Python worker runs Ultralytics YOLO person detection and persistent ByteTrack over decoded video frames; detection results are never synthesized.
- **Corsair Plugin Integration**: Type-safe Zod input schemas, action definitions, and HTTP client execution methods in `src/corsair/plugin.ts`.

## Key Capabilities

1. **Multi-Camera CCTV Feeds**: Live video player with camera selection, playback controls, and detection overlays aligned to the actual video frame.
2. **Full-frame Person Detection**: YOLO analyzes every decoded frame, stores source frame indices/timestamps/dimensions and pixel-space boxes, and reports job progress and cancellation.
3. **Camera-local Tracking**: ByteTrack associates detections within one video; local track IDs are distinct from global identities. Cross-camera Re-ID remains a separate, unverified workflow.
4. **Chronological Evidence Timeline**: Events refer to actual timestamps from the footage and can be filtered by camera or person.
5. **Forensic Search**: Searchable timeline and camera metadata for incident review and evidence packaging.
6. **Dataset Import Support**: The app accepts external CCTV assets and records dataset source metadata without shipping large videos in the repo.
7. **Benchmark Dataset Labeling**: Demo or benchmark datasets are clearly marked, never mixed into live-analysis output, and remain optional.

## Running the Application

### 1. Python analysis runtime
Install FFmpeg/ffprobe and make both executables available on `PATH`. Create the local runtime and install its dependencies:
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python_service\requirements.txt
```
The YOLO11n weights are downloaded on first analysis and stored under `data/models/`. The worker uses CPU when CUDA is unavailable. Override the interpreter/model/image size with `TRACEX_PYTHON_PATH`, `TRACEX_MODEL_PATH`, `TRACEX_MODEL`, and `TRACEX_IMAGE_SIZE`.

### 2. Web Application (Full-Stack)
```bash
npm install --legacy-peer-deps
npm run dev
```
Runs at `http://localhost:3000`.

### 3. Sample dataset setup
The repository does not bundle a research benchmark dataset. The locally supplied MP4s are ignored by Git. For a labeled evaluation, import and document a suitable dataset separately.

### 4. Local camera footage
The four locally supplied AVI recordings are preserved under `data/source-footage/` and converted to browser-playable H.264 files under `public/videos/`. When the app loads, it starts one full-frame analysis job at a time for unprocessed supplied clips. Uploaded footage starts analysis after upload. Jobs show decoded-frame progress, logs, counts, elapsed time, and a cancel action. Results are currently held in server memory and are lost when the server restarts.

The overlay only displays boxes belonging to the nearest decoded frame timestamp, using the actual video content rectangle and source-frame coordinates. ByteTrack local IDs are not global identities. Cross-camera Re-ID is not performed by this pipeline.

Use the trash button on a camera card to remove that footage and its detections, timeline events, and processing jobs from the workspace. This does not delete the source or playback video files; removed camera IDs are remembered across server restarts in the ignored local file `data/removed-camera-ids.json`.

Convert AVI recordings to browser-playable MP4 before importing:
```powershell
ffmpeg -i input.avi -an -c:v libx264 -preset veryfast -crf 25 -pix_fmt yuv420p -movflags +faststart public/videos/camera_05.mp4
```

## Validation and limitations
Run the TypeScript checks/build and focused frame-overlay tests:
```powershell
npm run lint
npm run build
node --import tsx --test src/lib/overlay.test.ts
```
The default YOLO11n choice is a CPU-conscious provisional default. In a speed/count-only benchmark on 10 evenly spaced frames from camera 01 at 960-pixel inference size, YOLO11n had 0.112 s mean inference time per frame; YOLO11m had 0.658 s and produced only one additional detection over those frames. This is not an accuracy benchmark: the supplied clips have no ground-truth labels. Do not interpret local track IDs or detector outputs as verified identities or measured model accuracy.

## Dataset manifest
The repository includes a minimal dataset manifest that records dataset names, source URLs, licensing notes, and local paths for manual import. This keeps the frontend asset bundle small while documenting the research-origin footage used for evaluation.
