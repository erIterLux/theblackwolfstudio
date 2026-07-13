# The Black Wolf Studio — Firebase + React Starter

A responsive Vite/React/Firebase starter for a martial arts, practical self-defense, and somatic healing studio.

## Included

- Responsive public website with a black, bone, charcoal, and electric-blue brand system
- Home, Programs, Schedule, Membership, Contact, Login, and protected Member pages
- Firebase modular SDK setup for Authentication, Firestore, and Storage
- Email/password and Google authentication wiring
- Firestore-ready inquiry form with local-storage fallback before Firebase is configured
- Starter Firestore and Storage security rules
- Firebase Hosting configuration with single-page app rewrites
- Member dashboard concept and a safely scoped placeholder for the future **Wolf Guide** AI companion
- Original Black Wolf Studio logo assets supplied for the project

## Run locally

This starter uses Vite 8, which requires Node.js 20.19+ or 22.12+.

```bash
npm install
cp .env.example .env
npm run dev
```

The public site runs without Firebase configuration. Authentication remains disabled until `.env` is populated.

## Connect Firebase

1. Create a Firebase project.
2. Register a Web app.
3. Copy the Firebase web configuration values into `.env`.
4. Enable **Authentication → Sign-in method → Email/Password** and optionally Google.
5. Create a Firestore database.
6. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID.
7. Deploy rules and hosting:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,storage
npm run build
firebase deploy --only hosting
```

## Suggested Firestore model

```text
inquiries/{inquiryId}
users/{uid}
users/{uid}/checkIns/{checkInId}
users/{uid}/practiceNotes/{noteId}
classes/{classId}
classSessions/{sessionId}
reservations/{reservationId}
memberships/{membershipId}
```

## Wolf Guide architecture direction

Do not call a model directly from the browser with a private provider key. Add the AI feature behind a callable Cloud Function or HTTPS endpoint with:

- Firebase Authentication and App Check
- server-side system instructions and content boundaries
- member-context retrieval limited to the signed-in user
- rate limits and abuse controls
- crisis and medical escalation language
- explicit statement that it is educational support, not therapy, diagnosis, emergency care, or a replacement for an instructor
- curated technique and regulation content reviewed by qualified humans

The current member page is UI scaffolding only; no AI request is sent.

## Brand palette

```css
--black: #05070b;
--charcoal: #111722;
--bone: #f5f3ee;
--blue: #2f6bff;
--blue-bright: #65a7ff;
--blue-dark: #0b285f;
```

The blue is intentionally used as a focused accent: energetic enough for martial arts, but calm enough to support the somatic and nervous-system side of the brand.
