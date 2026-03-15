# Backend Deployment

This folder is ready to be pushed as its own repo.

## Scripts

- `npm install`
- `npm run dev`
- `npm start`

## Required environment variables

```bash
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/video_gallery?retryWrites=true&w=majority
CLIENT_URL=https://your-frontend-domain.com
NODE_ENV=production
```

## Optional multi-origin setup

If you need both local development and the deployed frontend to reach the same API:

```bash
CLIENT_URLS=http://localhost:5173,https://your-frontend-domain.com
```

## Notes

- Uploaded files are written to `uploads/`.
- If your hosting provider does not persist local disk between deploys/restarts, move uploads to object storage later.
- Make sure `ffmpeg` support is available through the installed npm packages during deployment.
