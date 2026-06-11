export const metadata = {
  title: 'Privacy Policy — Socialigent',
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-gray-800">
      <h1 className="mb-2 text-3xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-gray-500">Last updated: June 2026</p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. What Socialigent does</h2>
        <p>
          Socialigent is a social media management tool that helps businesses schedule and
          publish content to LinkedIn. It generates post captions and images using AI and
          routes them for human approval before publishing.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Data we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Email address and password (for account login)</li>
          <li>LinkedIn Page ID and OAuth access token (to publish on your behalf)</li>
          <li>Post content, captions, and images you generate or approve</li>
          <li>Telegram chat ID (if you enable Telegram notifications)</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. How we use your data</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>To authenticate you and keep your session secure</li>
          <li>To publish approved posts to your LinkedIn Page on your behalf</li>
          <li>To send post approval notifications via Telegram (if configured)</li>
          <li>We do not sell your data to third parties</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. LinkedIn data</h2>
        <p>
          When you connect a LinkedIn Page, we store your OAuth access token securely in our
          database. This token is used solely to publish posts on your behalf. You can
          disconnect LinkedIn at any time by removing the token from your client settings.
          We comply with the{' '}
          <a
            href="https://www.linkedin.com/legal/l/api-terms-of-use"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn API Terms of Use
          </a>
          .
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Data retention</h2>
        <p>
          Your data is stored for as long as your account is active. You may request deletion
          of your account and all associated data at any time by contacting us.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Security</h2>
        <p>
          All data is stored in Supabase with row-level security enabled. OAuth tokens are
          stored encrypted at rest. We use HTTPS for all communications.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">7. Contact</h2>
        <p>
          For any privacy questions or data deletion requests, contact:{' '}
          <a href="mailto:elishaseme99@gmail.com" className="underline">
            elishaseme99@gmail.com
          </a>
        </p>
      </section>
    </main>
  )
}
