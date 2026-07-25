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
- Safely scoped **Wolf Guide** AI companion with membership allowances, privacy-aware routing, and spend controls
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

## Wolf Guide architecture

Wolf Guide runs behind authenticated callable Cloud Functions; provider keys are
never sent to the browser. Membership entitlements are enforced on the server:

- **Begin:** one-time 3-message preview
- **Train:** 15 successful AI responses per week
- **Integrate:** 30 successful AI responses per week

Weekly allowances reset Monday at midnight Eastern and do not roll over. Fixed
safety responses, provider errors, and timeouts do not consume an allowance.

The implementation also includes:

- Firebase Authentication
- server-side system instructions and content boundaries
- member-context retrieval limited to the signed-in user
- server-authoritative allowances plus a 5-message-per-10-minute burst limit
- crisis and medical escalation language
- explicit statement that it is educational support, not therapy, diagnosis, emergency care, or a replacement for an instructor
- curated technique and regulation content reviewed by qualified humans
- free/prepaid Gemini routing, with stored member context excluded from free-tier requests
- an instructor-managed estimated monthly prepaid spend limit

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
