import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const TABS = ['Getting Started', 'Navigating the App', 'Directory', 'Lotto Syndicate', 'Contact & Help']

// Configurable general help contact
const GENERAL_HELP_CONTACT = 'Keith Dyke'

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState(0)
  const navigate = useNavigate()
  const [appAdmins, setAppAdmins] = useState({}) // { lotto: ['Keith Dyke', ...], directory: [...] }
  const [loadingAdmins, setLoadingAdmins] = useState(true)

  useEffect(() => {
    fetchAppAdmins()
  }, [])

  async function fetchAppAdmins() {
    try {
      // Step 1: get all app-level admin rows (excluding super-admins)
      const { data: accessRows, error: accessError } = await supabase
        .from('app_access')
        .select('app_id, user_id')
        .eq('role', 'admin')
        .neq('app_id', 'admin')

      if (accessError) throw accessError
      if (!accessRows?.length) return

      // Step 2: look up profile names for each user_id
      const userIds = [...new Set(accessRows.map(r => r.user_id))]
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, names, surname')
        .in('id', userIds)

      if (profilesError) throw profilesError

      // Step 3: build a map of user_id → display name
      const nameMap = {}
      for (const p of profiles) {
        nameMap[p.id] = `${p.names ?? ''} ${p.surname ?? ''}`.trim()
      }

      // Step 4: group by app_id
      const grouped = {}
      for (const row of accessRows) {
        const name = nameMap[row.user_id]
        if (!name) continue
        if (!grouped[row.app_id]) grouped[row.app_id] = []
        if (!grouped[row.app_id].includes(name)) grouped[row.app_id].push(name)
      }
      setAppAdmins(grouped)
    } catch (e) {
      console.error('Failed to fetch app admins', e)
    } finally {
      setLoadingAdmins(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-brand-800 mb-2">Help & Guide</h1>
        <p className="text-brand-500">
          Welcome to Vintage @ Hamilton! Everything you need to get started and make the most of the portal.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-brand-200">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
              activeTab === i
                ? 'border-gold-400 text-brand-800 bg-white'
                : 'border-transparent text-brand-400 hover:text-brand-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-100 p-6">

        {/* ── Getting Started ── */}
        {activeTab === 0 && (
          <div className="space-y-6">
            <Section title="Welcome to Vintage @ Hamilton 👋">
              <p className="text-brand-600">
                This portal is your online home for the Vintage at Hamilton community — connecting neighbours,
                sharing news, and keeping everyone in the loop. Here's how to get set up in just a few minutes.
              </p>
            </Section>

            <Section title="Setting up your password for the first time">
              <Steps steps={[
                { n: 1, text: <>Go to <strong>vintageathamilton.com</strong> in your browser.</> },
                { n: 2, text: <>Click <strong>"Set / Reset Password"</strong> on the login screen.</> },
                { n: 3, text: <>Enter your email address and click <strong>"Send Link"</strong>.</> },
                { n: 4, text: <>Check your inbox for an email from Vintage @ Hamilton. If it lands in your spam or junk folder, mark it as safe.</> },
                { n: 5, text: <>Click the link in the email. You'll be taken to a page to choose your password.</> },
                { n: 6, text: <>Enter and confirm your new password, then click <strong>"Set Password"</strong>.</> },
                { n: 7, text: <>You'll be signed in automatically and taken to the home screen. Welcome!</> },
              ]} />
            </Section>

            <Section title="Signing in next time">
              <Steps steps={[
                { n: 1, text: <>Go to <strong>vintageathamilton.com</strong>.</> },
                { n: 2, text: <>Enter your email and password and click <strong>"Sign In"</strong>.</> },
              ]} />
            </Section>

            <Section title="Forgot your password?">
              <p className="text-brand-600">
                No problem — just use the same <strong>"Set / Reset Password"</strong> button on the login screen.
                Enter your email, follow the link in the email, and choose a new password.
              </p>
            </Section>

            <Callout>
              🔒 <strong>Sharing a computer?</strong> Please click <strong>Sign Out</strong> in the top right corner when you're finished,
              so the next person isn't logged in as you.
            </Callout>
          </div>
        )}

        {/* ── Navigating the App ── */}
        {activeTab === 1 && (
          <div className="space-y-6">
            <Section title="Finding your way around">
              <p className="text-brand-600">
                The portal is made up of several sections, each accessible from the sidebar menu on the left.
                Here's a quick overview of what's available.
              </p>
            </Section>

            <div className="space-y-3">
              <NavItem icon="🏠" label="Home" description="Your dashboard — a summary of recent activity, quick links, and upcoming events." />
              <NavItem icon="📋" label="Directory" description="The Vintage @ Hamilton resident directory. Search for neighbours by name, browse contact details, and more." />
              <NavItem icon="📅" label="Calendar" description="Community events and social activities. Coming soon!" />
              <NavItem icon="🎱" label="Lotto Syndicate" description="Track the community Powerball syndicate — draws, winnings, payments, and member details." />
              <NavItem icon="📝" label="Blog" description="Community news, announcements, and posts from residents. Coming soon!" />
            </div>

            <Section title="The top bar">
              <p className="text-brand-600 mb-3">The bar across the top of every page gives you quick access to:</p>
              <ul className="space-y-2 text-brand-600 list-disc list-inside">
                <li><strong>☰ Menu button</strong> — show or hide the sidebar</li>
                <li><strong>A / A+ / A++</strong> — increase the text size if you'd prefer larger text</li>
                <li><strong>Your email address</strong> — confirms who you're signed in as</li>
                <li><strong>Sign Out</strong> — always sign out when you're done, especially on a shared computer</li>
              </ul>
            </Section>

            <Callout>
              💡 <strong>Tip:</strong> Not all sections are available to everyone — access is granted by the community administrator.
              If you see a 🔒 on a section, contact Keith Dyke to request access.
            </Callout>
          </div>
        )}

        {/* ── Directory ── */}
        {activeTab === 2 && (
          <div className="space-y-6">
            <Section title="The Resident Directory 📋">
              <p className="text-brand-600">
                The directory lists all residents of Vintage @ Hamilton who have chosen to be listed.
                You can search by name, browse by address, and find contact details for your neighbours.
              </p>
            </Section>

            <Section title="Searching the directory">
              <Steps steps={[
                { n: 1, text: <>Click <strong>Directory</strong> in the sidebar.</> },
                { n: 2, text: <>Use the search bar at the top to find a resident by name.</> },
                { n: 3, text: <>Click on a resident card to see their full details.</> },
              ]} />
            </Section>

            <Section title="Updating your own details">
              <p className="text-brand-600">
                You can update your own contact details from within the directory. Find your own card,
                click on it, and look for the <strong>Edit</strong> option. Changes are saved immediately.
              </p>
            </Section>

            <AdminContact appId="directory" admins={appAdmins} loading={loadingAdmins} />
          </div>
        )}

        {/* ── Lotto Syndicate ── */}
        {activeTab === 3 && (
          <div className="space-y-6">
            <Section title="The Lotto Syndicate 🎱">
              <p className="text-brand-600">
                The Lotto Syndicate tracker keeps all members up to date with Powerball draws, winnings,
                and payments. As a syndicate member, you can see every draw result, your share of any winnings,
                and your payment history.
              </p>
            </Section>

            <Section title="Key sections">
              <div className="space-y-3">
                <NavItem icon="📊" label="Dashboard" description="A summary of recent draws, top earners, and syndicate stats at a glance." />
                <NavItem icon="👥" label="Members" description="All current and past syndicate members, their lucky numbers, and total winnings." />
                <NavItem icon="🎱" label="Draws" description="Full history of every Powerball draw, with match details for each member." />
                <NavItem icon="💰" label="Winnings" description="A breakdown of winnings per member across each subscription period." />
                <NavItem icon="💳" label="Payments" description="Track your subscription payments and current balance." />
                <NavItem icon="📈" label="Charts" description="Visual charts showing cumulative winnings vs. investment over time." />
              </div>
            </Section>

            <Section title="Subscription periods">
              <p className="text-brand-600">
                The syndicate runs in subscription periods — each period covers a set number of Powerball draws.
                Your subscription fee covers all draws in the period. The organiser will let you know when a new
                period is starting and what the cost is.
              </p>
            </Section>

            <AdminContact appId="lotto" admins={appAdmins} loading={loadingAdmins} />
          </div>
        )}

        {/* ── Contact & Help ── */}
        {activeTab === 4 && (
          <div className="space-y-6">
            <Section title="Need help? We've got you covered 😊">
              <p className="text-brand-600">
                If you're having trouble with anything in the portal, don't hesitate to reach out.
                You can look up contact details for any resident in the <strong>Directory</strong>.
              </p>
            </Section>

            <Section title="General portal help">
              <ContactCard name={GENERAL_HELP_CONTACT} note="For login issues, access requests, or anything general about the portal." />
            </Section>

            <Section title="App administrators">
              {loadingAdmins ? (
                <p className="text-brand-400 text-sm">Loading...</p>
              ) : (
                <div className="space-y-4">
                  {['directory', 'lotto'].map(appId => (
                    <div key={appId}>
                      <p className="text-sm font-semibold text-brand-700 mb-2 capitalize">
                        {appId === 'lotto' ? 'Lotto Syndicate' : 'Resident Directory'}
                      </p>
                      {appAdmins[appId]?.length > 0 ? (
                        <div className="space-y-2">
                          {appAdmins[appId].map(name => (
                            <ContactCard key={name} name={name} note={`Look up contact details in the Directory.`} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-brand-400 text-sm">No administrators listed — contact Keith Dyke for help.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Callout>
              📖 <strong>Remember:</strong> You can find phone numbers and email addresses for any resident
              in the <strong>Resident Directory</strong>.
            </Callout>
          </div>
        )}

      </div>

      {/* Back to dashboard */}
      <div className="mt-6">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-brand-500 hover:text-brand-700 transition-colors"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <h2 className="font-display text-lg text-brand-800 mb-2">{title}</h2>
      {children}
    </div>
  )
}

function Steps({ steps }) {
  return (
    <ol className="space-y-3">
      {steps.map(({ n, text }) => (
        <li key={n} className="flex gap-3 items-start">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-800 text-white text-sm font-bold flex items-center justify-center">
            {n}
          </span>
          <span className="text-brand-600 pt-0.5">{text}</span>
        </li>
      ))}
    </ol>
  )
}

function NavItem({ icon, label, description }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-brand-50 border border-brand-100">
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div>
        <p className="font-semibold text-brand-800 text-sm">{label}</p>
        <p className="text-brand-500 text-sm">{description}</p>
      </div>
    </div>
  )
}

function Callout({ children }) {
  return (
    <div className="bg-gold-50 border border-gold-200 rounded-lg px-4 py-3 text-brand-700 text-sm">
      {children}
    </div>
  )
}

function ContactCard({ name, note }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-brand-50 border border-brand-100">
      <span className="text-xl flex-shrink-0">👤</span>
      <div>
        <p className="font-semibold text-brand-800 text-sm">{name}</p>
        <p className="text-brand-500 text-sm">{note}</p>
      </div>
    </div>
  )
}

function AdminContact({ appId, admins, loading }) {
  const names = admins[appId] || []
  return (
    <div className="pt-2 border-t border-brand-100">
      <p className="text-sm font-semibold text-brand-700 mb-2">Need help with this section?</p>
      {loading ? (
        <p className="text-brand-400 text-sm">Loading...</p>
      ) : names.length > 0 ? (
        <div className="space-y-2">
          {names.map(name => (
            <ContactCard key={name} name={name} note="Look up their contact details in the Directory." />
          ))}
        </div>
      ) : (
        <ContactCard name={GENERAL_HELP_CONTACT} note="Look up contact details in the Directory." />
      )}
    </div>
  )
}
