# Tripwire — Android app project + backend server

## Building the .apk from your phone only (no computer needed)

This project includes a GitHub Actions workflow (`.github/workflows/build.yml`)
that compiles the APK for you on GitHub's cloud servers — you never need
Android Studio or a desktop at all.

**1. Get the code onto GitHub, from your phone:**

The most reliable way on Android is via Termux (a real terminal app —
install it from F-Droid, not the outdated Play Store version):

    pkg update && pkg install git -y
    # unzip this project (use a file manager, or: pkg install unzip -y && unzip tripwire-android-project.zip)
    cd tripwire-android-project
    git init
    git add .
    git commit -m "initial commit"
    git branch -M main
    git remote add origin https://github.com/<your-username>/<your-repo>.git
    git push -u origin main

You'll need a GitHub account (free, sign up at github.com from any browser)
and an empty repo created first (github.com → "+" → New repository). When
`git push` asks for a password, use a Personal Access Token instead — GitHub
→ Settings → Developer settings → Personal access tokens → generate one with
"repo" scope, and paste that in as the password.

**2. Let it build:**

The push itself triggers the workflow automatically. On github.com, open
your repo → **Actions** tab → the running job → wait a few minutes.

**3. Download the .apk, on your phone:**

Once the job finishes (green check), scroll to **Artifacts** at the bottom
of that same Actions run page → tap `tripwire-debug-apk` → it downloads as
a zip containing `app-debug.apk`. Extract it, then open the `.apk` file to
install (Android will prompt to allow installs from that app — Chrome or
your Files app — the first time).

This produces a **debug build** — perfectly installable and runnable on your
own phone, just not something you'd publish to the Play Store as-is (that
needs a signed release build, a separate step involving a signing key).

## Alternative: if you ever have access to a desktop

1. Install [Android Studio](https://developer.android.com/studio).
2. In this folder, run: `npm install`
3. Open the `android/` folder in Android Studio, let Gradle sync, click Run ▶,
   or Build → Generate Signed Bundle / APK.

## Deploy the backend (needed only for phone escalation)

`server/server.js` is the same flat Node/Express + Twilio backend from before.
A packaged phone app has no "localhost" server of its own, so it needs to be
deployed somewhere reachable over the internet (Render, Railway, Fly.io, your
own VPS, etc.):

    cd server
    npm install
    # set TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER as env vars on your host
    npm start

Once deployed, open the app, go to the phone-escalation section, and paste
your server's URL (e.g. `https://your-app.onrender.com`) into "Backend server
URL" — it only appears there when running as the native app, not in a browser
tab (a browser tab still just uses its own same-origin `/api/...` calls).

## What's wired up natively (beyond the browser version)

- **Keep-awake**: uses `@capacitor-community/keep-awake` instead of the web
  Wake Lock API, which doesn't work reliably inside a WebView.
- **Push-style notification**: uses `@capacitor/local-notifications` for a
  real Android notification when triggered, if that checkbox is on.
- Motion/rotation detection, the embedded alarm sound, PIN disarm, and
  everything else carry over unchanged from the browser version.

## Known gaps / next steps

- App icon and splash screen are Capacitor's defaults — cosmetic, but worth
  customizing before sharing it with anyone else.
- iOS isn't set up here (only `npx cap add android` was run) — the same
  project can add an iOS target later with `npx cap add ios` (needs a Mac +
  Xcode to build).
- True "survives force-quit" behavior still isn't implemented — that needs a
  native foreground service, which is a further step beyond this scaffold.
