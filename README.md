# Study Buddy

Study Buddy is a responsive, voice-enabled learning assistant with a dashboard, study chat, saved Q&A history, and Supabase authentication.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add your Gemini and SERP API keys to enable AI answers and live search.
4. Add your Supabase project URL and anon key to enable accounts and cloud-saved sessions.
5. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
6. Start the app with `npm run dev`.

The chat can be explored without Supabase; saved Q&A is kept in that browser's local storage. Supabase credentials are required for sign-in and cloud persistence. Create a Supabase project and configure email/password sign-in in its Authentication settings before registering users.
