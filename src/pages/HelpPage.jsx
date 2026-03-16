import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const TABS = ['Getting Started', 'Navigating the App', 'Directory', 'Social Calendar', 'Blog', 'Recommendations', 'Lotto Syndicate', 'Contact & Help']

// Configurable general help contact
const GENERAL_HELP_CONTACT = 'Keith Dyke'

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState(0)
  const navigate = useNavigate()
  const [appAdmins, setAppAdmins] = useState({}) // { lotto: ['Keith Dyke', ...], directory: [...] }
  const [loadingAdmins, setLoadingAdmins] = useState(true)
  const [calendarCategories, setCalendarCategories] = useState([])

  useEffect(() => {
    fetchAppAdmins()
    fetchCalendarCategories()
  }, [])

  async function fetchCalendarCategories() {
    const { data } = await supabase
      .from('calendar_categories')
      .select('id, name, description, color, required_tag')
      .order('id')
    if (data) setCalendarCategories(data)
  }

  async function fetchAppAdmins() {
    try {
      const { data, error } = await supabase.rpc('get_app_admins')
      if (error) throw error

      const grouped = {}
      for (const row of data) {
        if (!grouped[row.app_id]) grouped[row.app_id] = []
        if (!grouped[row.app_id].includes(row.display_name)) {
          grouped[row.app_id].push(row.display_name)
        }
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
        <p className="text-brand-500 mb-3">
          Welcome to Vintage @ Hamilton! Everything you need to get started and make the most of the portal.
        </p>
        <div className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-3 text-sm text-brand-600">
          The directory lists all residents of Vintage @ Hamilton who have chosen to be listed. You can search
          by name, browse by address, and find contact details for your neighbours. This information is intended
          to be used only by residents of the community for Vintage @ Hamilton purposes and not for business
          solicitations. If you use this information for unintended purposes, the administrator reserves the
          right to block you from future use of the portal.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-brand-200">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${activeTab === i
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
              <NavItem icon="📅" label="Calendar" description="Community events and social activities — see what's coming up and RSVP." />
              <NavItem icon="🎱" label="Lotto Syndicate" description="Track the community Powerball syndicate — draws, winnings, payments, and member details." />
              <NavItem icon="📝" label="Blog" description="Community news, announcements, and posts from residents. React, comment, and share your own stories." />
              <NavItem icon="⭐" label="Recommendations" description="Share trusted recommendations for local services, contractors, and businesses — and warn neighbours about bad experiences." />
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

        {/* ── Social Calendar ── */}
        {activeTab === 3 && (
          <div className="space-y-6">
            <Section title="The Social Calendar 📅">
              <p className="text-brand-600">
                The Social Calendar is your community events hub — see what's coming up, RSVP to events you plan
                to attend, and add new events for everyone to enjoy.
              </p>
            </Section>

            <Section title="Viewing events">
              <Steps steps={[
                { n: 1, text: <>Click <strong>Calendar</strong> in the sidebar.</> },
                { n: 2, text: <>Use the <strong>List</strong> or <strong>Grid</strong> button to switch between a scrollable list and a monthly calendar view.</> },
                { n: 3, text: <>Use the <strong>Category</strong> dropdown to filter events by type (e.g. Social Events, Fitness, Committee Meetings).</> },
                { n: 4, text: <>Click any event to see full details — location, description, who's going, and any external links.</> },
              ]} />
            </Section>

            <Section title="RSVPing to an event">
              <p className="text-brand-600">
                On any event's detail view, click <strong>"I'm Going"</strong> to RSVP. You can see a count of who
                has signed up, and expand the attendee list to see names. Click again to cancel your RSVP.
              </p>
            </Section>

            <Section title="Adding an event">
              <Steps steps={[
                { n: 1, text: <>Click the <strong>"+ Add Event"</strong> button at the top of the calendar.</> },
                { n: 2, text: <>Fill in the event title, category, date, and time.</> },
                { n: 3, text: <>Optionally add a location, description, and a link to any external page (e.g. a sign-up form or map).</> },
                { n: 4, text: <>Click <strong>"Save Event"</strong> — the event will appear on the calendar immediately.</> },
              ]} />
            </Section>

            <Section title="Event categories">
              <p className="text-brand-600 mb-3">
                Events are organised by category so you can find what interests you:
              </p>
              <div className="space-y-2">
                {calendarCategories.length === 0 ? (
                  <p className="text-brand-400 text-sm">Loading categories…</p>
                ) : (
                  calendarCategories.map(cat => (
                    <CategoryBadge
                      key={cat.id}
                      color={cat.color}
                      name={cat.name}
                      description={cat.description || ''}
                      requiredTag={cat.required_tag}
                    />
                  ))
                )}
              </div>
            </Section>

            <Callout>
              💡 <strong>Tip:</strong> Upcoming events are also shown on your home dashboard — you'll always
              see what's next without even opening the calendar!
            </Callout>

            <AdminContact appId="calendar" admins={appAdmins} loading={loadingAdmins} />
          </div>
        )}

        {/* ── Blog ── */}
        {activeTab === 4 && (
          <div className="space-y-6">
            <Section title="The Community Blog 📝">
              <p className="text-brand-600">
                The Community Blog is where residents share news, stories, event recaps, and announcements.
                Anyone with blog access can write a post, leave comments, and react to what others have shared.
              </p>
            </Section>

            <Section title="Reading posts">
              <Steps steps={[
                { n: 1, text: <>Click <strong>Blog</strong> in the sidebar.</> },
                { n: 2, text: <>Browse the list of posts — you can see the author, how long ago it was posted, and a preview of the content.</> },
                { n: 3, text: <>Click the <strong>💬 comments button</strong> on any post card to open the full post and read or add comments.</> },
              ]} />
            </Section>

            <Section title="Reacting to posts">
              <p className="text-brand-600">
                Each post and comment has <strong>👍</strong> and <strong>❤️</strong> reaction buttons.
                Click one to add your reaction — click it again to remove it. Reactions are a quick way
                to show appreciation without needing to write a comment.
              </p>
            </Section>

            <Section title="Writing a post">
              <Steps steps={[
                { n: 1, text: <>Click the <strong>✏️ Write Post</strong> button at the top of the Blog page.</> },
                { n: 2, text: <>Give your post a title and write your content in the body field.</> },
                { n: 3, text: <>Optionally link your post to a calendar event — useful for event previews or recaps.</> },
                { n: 4, text: <>Click <strong>"Publish Post"</strong> — your post will appear immediately for everyone to read.</> },
              ]} />
            </Section>

            <Section title="Commenting on a post">
              <Steps steps={[
                { n: 1, text: <>Click the <strong>💬 comments button</strong> on a post card to open it.</> },
                { n: 2, text: <>Scroll to the bottom of the post and type your comment in the box.</> },
                { n: 3, text: <>Click <strong>"Post"</strong> or press <strong>Ctrl+Enter</strong> to submit.</> },
              ]} />
            </Section>

            <Section title="Reporting content">
              <p className="text-brand-600">
                If you see a post or comment that seems inappropriate, use the <strong>🚩 Report</strong> button
                to flag it. Add a brief reason and submit — an administrator will review it.
                Reporting is anonymous to other residents.
              </p>
            </Section>

            <Callout>
              💡 <strong>Tip:</strong> Use the search bar at the top of the Blog page to find posts by keyword —
              handy if you're looking for a specific announcement or recap.
            </Callout>

            <AdminContact appId="blog" admins={appAdmins} loading={loadingAdmins} />
          </div>
        )}

        {/* ── Recommendations ── */}
        {activeTab === 5 && (
          <div className="space-y-6">
            <Section title="Residents' Recommendations ⭐">
              <p className="text-brand-600">
                The Recommendations board is where neighbours share trusted tips and warn each other about
                bad experiences. There are two types of post — <strong>Recommendations</strong> for things
                worth trying, and <strong>Steer Clear</strong> warnings for things to avoid.
              </p>
            </Section>

            <Section title="Browsing recommendations">
              <Steps steps={[
                { n: 1, text: <>Click <strong>Recommendations</strong> in the sidebar.</> },
                { n: 2, text: <>Use the <strong>⭐ Recommendations</strong> and <strong>⚠️ Steer Clear</strong> tabs to switch between post types.</> },
                { n: 3, text: <>Filter by category (e.g. Contractors, Services, Leisure) and then subcategory to narrow down results.</> },
                { n: 4, text: <>Click any card to open the full post — description, contact details, photo, and neighbour reactions.</> },
              ]} />
            </Section>

            <Section title="Sharing a recommendation">
              <Steps steps={[
                { n: 1, text: <>Click the <strong>"+ Add Post"</strong> button at the top right.</> },
                { n: 2, text: <>Choose <strong>⭐ Recommendation</strong> or <strong>⚠️ Steer Clear</strong> at the top of the form.</> },
                { n: 3, text: <>Give your post a title, choose a category and subcategory, and write a description.</> },
                { n: 4, text: <>Optionally add a website link, contact phone/email, and a photo.</> },
                { n: 5, text: <>Click <strong>"Post Recommendation"</strong> (or "Post Warning" for Steer Clear).</> },
              ]} />
            </Section>

            <Section title="Editing your post">
              <p className="text-brand-600">
                You can edit a post you've written at any time — click the post to open it and use the <strong>✏️ Edit post</strong> button.
                You can update the title, description, contact details, and photo. Note that if your post has already received
                reactions from other residents, the post type (Recommendation vs Steer Clear) cannot be changed — you would
                need to remove and repost instead.
              </p>
            </Section>

            <Section title="Reacting to posts">
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
                  <p className="font-semibold text-brand-800 text-sm mb-1">⭐ Recommendations</p>
                  <p className="text-brand-500 text-sm">Click <strong>❤️</strong> to show you agree with a recommendation. Click <strong>👎</strong> to disagree — you'll be asked to explain why. Your comment goes to an administrator for review.</p>
                </div>
                <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
                  <p className="font-semibold text-brand-800 text-sm mb-1">⚠️ Steer Clear warnings</p>
                  <p className="text-brand-500 text-sm">Click <strong>👍</strong> if you've had the same bad experience. Click <strong>🤔</strong> if your experience was different — you'll be asked to share your perspective. Your comment goes to an administrator for review.</p>
                </div>
              </div>
            </Section>

            <Section title="Steer Clear warnings — what happens after posting">
              <p className="text-brand-600">
                Steer Clear warnings are posted immediately so neighbours can see them straight away.
                They are also flagged for an administrator to review, who will check the post is appropriate
                and either acknowledge it or remove it if necessary.
              </p>
            </Section>

            <Section title="Categories">
              <p className="text-brand-600 mb-3">Posts are organised into five main categories:</p>
              <div className="space-y-2">
                {[
                  { icon: '🔨', name: 'Contractors', desc: 'Cleaners, handypersons, builders, electricians, plumbers, landscapers, painters' },
                  { icon: '🏡', name: 'Home & Garden', desc: 'Tools & equipment, gadgets, furniture, plants & seeds' },
                  { icon: '🩺', name: 'Services', desc: 'Medical, financial, legal, pet care, childcare' },
                  { icon: '🎭', name: 'Leisure', desc: 'Clubs & teams, classes, restaurants, days out' },
                  { icon: '🛍️', name: 'Shopping', desc: 'Online and local stores' },
                ].map(({ icon, name, desc }) => (
                  <div key={name} className="flex gap-3 p-3 rounded-lg bg-brand-50 border border-brand-100">
                    <span className="text-xl flex-shrink-0">{icon}</span>
                    <div>
                      <p className="font-semibold text-brand-800 text-sm">{name}</p>
                      <p className="text-brand-500 text-sm">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Callout>
              💡 <strong>Remember:</strong> All posts represent personal opinions and experiences. Always do your
              own research before hiring a contractor or making a purchase based on a recommendation.
            </Callout>

            <AdminContact appId="recommendations" admins={appAdmins} loading={loadingAdmins} />
          </div>
        )}

        {/* ── Lotto Syndicate ── */}
        {activeTab === 6 && (
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
        {activeTab === 7 && (
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
                  {['directory', 'calendar', 'blog', 'recommendations', 'lotto'].map(appId => (
                    <div key={appId}>
                      <p className="text-sm font-semibold text-brand-700 mb-2 capitalize">
                        {appId === 'lotto' ? 'Lotto Syndicate' : appId === 'calendar' ? 'Social Calendar' : appId === 'blog' ? 'Community Blog' : appId === 'recommendations' ? 'Recommendations' : 'Resident Directory'}
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

function CategoryBadge({ color, name, description, requiredTag }) {
  return (
    <div className="flex gap-3 items-start p-3 rounded-lg bg-brand-50 border border-brand-100">
      <span
        className="flex-shrink-0 mt-0.5 w-3 h-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-brand-800 text-sm">{name}</p>
          {requiredTag && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {requiredTag} only
            </span>
          )}
        </div>
        {description && <p className="text-brand-500 text-sm mt-0.5">{description}</p>}
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
