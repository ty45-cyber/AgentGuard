# Deployment

## Fastest path: static demo

Deploy the contents of `standalone/` to any static host. No build command or environment variables are required.

For a local preview:

```bash
python3 -m http.server 8080 --directory standalone
```

## Full Next.js app

The root project is a Next.js application. On Vercel, import the repository with the framework set to Next.js and use the default install/build settings.

For live IBM Granite explanations, add the server-side variables from `.env.example` in the deployment settings. Keep the API key server-only; never expose it as a public/browser variable.
