import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Privacy Policy — PRform",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="font-black text-xs uppercase tracking-[0.3em] text-[#0A0A0A] mb-3">{title}</h2>
      <div className="text-sm text-[#6B6B6B] leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <section className="bg-[#0A0A0A] px-6 py-10">
        <div className="max-w-[800px] mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Legal</p>
          <h1 className="font-black text-4xl uppercase text-white">Privacy Policy</h1>
        </div>
      </section>

      <div className="max-w-[800px] mx-auto px-6 py-12">
        <p className="font-mono text-xs text-[#6B6B6B] mb-10">
          Effective date: May 11, 2026 &nbsp;&middot;&nbsp; Last updated: May 11, 2026
        </p>

        <Section title="Overview">
          <p>
            PRform ("we", "us", or "our") is a performance sleep optimization tool for competitive athletes.
            This Privacy Policy explains how we collect, use, store, and protect your personal data when you
            use PRform at prformm.vercel.app.
          </p>
          <p>
            By using PRform, you agree to the collection and use of information in accordance with this policy.
          </p>
        </Section>

        <Section title="Information We Collect">
          <p>We collect the following types of information:</p>
          <p>
            <strong className="text-[#0A0A0A]">Account Information:</strong> When you create an account, we collect
            your name, email address, age, and biological sex. This information is used to personalize your
            sleep recommendations.
          </p>
          <p>
            <strong className="text-[#0A0A0A]">Sleep and Training Data:</strong> We collect the workout schedule,
            meet schedule, sleep baseline, and sleep confirmation data you provide. This data is used exclusively
            to calculate your personalized sleep plan.
          </p>
          <p>
            <strong className="text-[#0A0A0A]">Strava Data:</strong> If you choose to connect your Strava account,
            we access your running activity data including distance, pace, duration, heart rate, and suffer score
            via the Strava API. We only access data you explicitly authorize. We use this data solely to calculate
            your sleep and performance recommendations within PRform.
          </p>
          <p>
            We do not collect payment information. We do not sell, rent, or share your personal data with third
            parties for advertising or commercial purposes.
          </p>
        </Section>

        <Section title="How We Use Your Data">
          <p>We use the data we collect to:</p>
          <ul className="list-none space-y-1 pl-4">
            <li>— Calculate your personalized nightly sleep recommendations</li>
            <li>— Analyze your training load and performance trends</li>
            <li>— Generate your recovery score and wind-down protocol</li>
            <li>— Improve the accuracy of your sleep-performance correlation</li>
          </ul>
          <p>
            All data processing is performed to provide you with the PRform service. We do not use your data
            for advertising, profiling, or any purpose beyond delivering PRform's core functionality.
          </p>
          <p>
            We do not use Strava data for artificial intelligence model training or machine learning in
            accordance with the Strava API Agreement.
          </p>
        </Section>

        <Section title="Strava Data">
          <p>
            PRform integrates with the Strava API to read your activity data. Our use of Strava data is governed
            by the{" "}
            <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer" className="text-[#0A0A0A] underline">
              Strava API Agreement
            </a>.
          </p>
          <p>
            Strava activity data is displayed only to you, the athlete who authorized access. We do not share
            your Strava data with other PRform users or any third parties.
          </p>
          <p>
            Strava activity data is not retained in our systems for longer than necessary to provide the PRform service.
          </p>
          <p>
            You can disconnect your Strava account from PRform at any time from the Settings page. Upon
            disconnection, all Strava activity data associated with your account is permanently deleted from
            our systems within 48 hours.
          </p>
          <p>
            You can also revoke PRform's access directly from your Strava account at{" "}
            <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener noreferrer" className="text-[#0A0A0A] underline">
              strava.com/settings/apps
            </a>.
          </p>
          <p>
            Strava monitors usage of its API and may collect data related to your connection. For more
            information, see{" "}
            <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-[#0A0A0A] underline">
              Strava's Privacy Policy
            </a>.
          </p>
        </Section>

        <Section title="Data Storage and Security">
          <p>
            Your data is stored in a secured database. We use industry-standard encryption for data in transit
            (HTTPS) and implement appropriate technical and organizational measures to protect your personal data.
          </p>
          <p>
            PRform is hosted on Vercel. For information about Vercel's data handling practices, see{" "}
            <a href="https://vercel.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-[#0A0A0A] underline">
              vercel.com/legal/privacy
            </a>.
          </p>
        </Section>

        <Section title="Your Rights">
          <p>You have the right to:</p>
          <ul className="list-none space-y-1 pl-4">
            <li>— Access the personal data we hold about you</li>
            <li>— Request correction of inaccurate data</li>
            <li>— Request deletion of your account and all associated data</li>
            <li>— Withdraw consent for Strava data access at any time</li>
            <li>— Export your data upon request</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at:{" "}
            <a href="mailto:609poncho@gmail.com" className="text-[#0A0A0A] underline">609poncho@gmail.com</a>
          </p>
          <p>
            Upon receiving a verified deletion request, we will permanently delete your account and all
            associated data within 30 days.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>
            PRform is intended for use by athletes of all ages including minors who participate in competitive
            sports. If you are under 13, please ensure a parent or guardian has reviewed this Privacy Policy
            and consents to your use of PRform.
          </p>
          <p>
            We do not knowingly collect personal data from children under 13 without verifiable parental consent.
            If you believe we have collected data from a child under 13 without consent, contact us immediately.
          </p>
        </Section>

        <Section title="Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any significant changes
            by posting the new policy on this page with an updated effective date. Your continued use of PRform
            after changes are posted constitutes your acceptance of the updated policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            If you have any questions about this Privacy Policy or our data practices, please contact us at:
          </p>
          <p className="font-mono text-xs text-[#0A0A0A]">
            Alfonso Gonzalez-Cano<br />
            PRform<br />
            <a href="mailto:609poncho@gmail.com" className="underline">609poncho@gmail.com</a>
          </p>
        </Section>
      </div>
    </div>
  );
}
