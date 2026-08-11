This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).





## Getting Started

### Environment and Google OAuth

Copy the example configuration before starting the application:

```bash
cp .env.example .env.local
```

Set these origins for each environment (without a trailing slash or path):

- `APP_URL` is the canonical, server-only origin of the Next.js site, for example
  `https://fanzoom.example.com`.
- `NEXT_PUBLIC_POCKETBASE_URL` is the single PocketBase origin used throughout the
  application, for example `https://pb.fanzoom.example.com`. It is public by design
  and must not contain credentials.

Both variables are required in production. A missing or malformed value produces a
configuration error instead of silently redirecting to localhost. The localhost
values in `.env.example` are development defaults only.

The Google callback URI is derived only from `APP_URL` and is **exactly**:

```text
${APP_URL}/api/auth/google/callback
```

For the example file, register this exact URI (including scheme, host, port, and
path) in Google Cloud Console under the OAuth web client's **Authorized redirect
URIs**:

```text
http://localhost:3000/api/auth/google/callback
```

Then open the PocketBase dashboard and configure the `users` auth collection:

1. Go to **Collections → users → Options → OAuth2**.
2. Enable the **Google** provider and enter the same Google OAuth client ID and
   client secret.
3. Keep the Google authorized redirect URI equal to the callback above. For
   production, add `${APP_URL}/api/auth/google/callback` using the production value
   as a separate authorized URI.

OAuth starts at `/api/auth/google`. The start handler and callback share the same
callback URL helper, so the `redirect_uri` sent during authorization and code
exchange is identical and comes only from the configured `APP_URL`, never from a
request `Host` header.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
