'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Search,
  RotateCw,
  Clock,
  Send,
  LogOut,
  X,
  Bell,
} from 'lucide-react';

import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

interface EmailTask {
  id: string;
  recipientEmail: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  scheduledFor: string;
  sentAt?: string;
  subject?: string;
  body?: string;
  campaignId?: string;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>(
    'scheduled'
  );

  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<EmailTask[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [isSlackModalOpen, setIsSlackModalOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailTask | null>(null);

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // --------------------------------------------------
  // Redirect unauthenticated users
  // --------------------------------------------------

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // --------------------------------------------------
  // Fetch emails
  // --------------------------------------------------

  const fetchEmails = async (isBackground = false) => {
    if (!isBackground) {
      setIsLoading(true);
    }

    try {
      let res: Response;

      // Elasticsearch search
      if (searchQuery.trim() !== '') {
        res = await fetch(
          `${API_URL}/search?q=${encodeURIComponent(searchQuery)}`,
          {
            cache: 'no-store',
          }
        );
      } else {
        // Normal campaign fetch
        res = await fetch(`${API_URL}/campaigns`, {
          cache: 'no-store',
        });
      }

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();

      // Elasticsearch response
      if (searchQuery.trim() !== '') {
        setTasks(Array.isArray(data) ? data : []);
      } else {
        // Campaign response
        const allTasks: EmailTask[] = Array.isArray(data)
          ? data.flatMap((campaign: any) =>
              Array.isArray(campaign.emails)
                ? campaign.emails.map((task: any) => ({
                    ...task,
                    subject: campaign.subject,
                    body: campaign.body,
                    campaignId: campaign.id,
                  }))
                : []
            )
          : [];

        setTasks(allTasks);
      }
    } catch (error) {
      console.error('Failed to fetch emails:', error);

      if (!isBackground) {
        setTasks([]);
      }
    } finally {
      if (!isBackground) {
        setIsLoading(false);
      }
    }
  };

  // --------------------------------------------------
  // Search
  // --------------------------------------------------

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    const debounceTimer = setTimeout(() => {
      fetchEmails();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, status]);

  // --------------------------------------------------
  // Background polling
  // --------------------------------------------------

  useEffect(() => {
    if (status !== 'authenticated' || searchQuery.trim() !== '') {
      return;
    }

    const interval = setInterval(() => {
      fetchEmails(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [status, searchQuery]);

  // --------------------------------------------------
  // Loading authentication
  // --------------------------------------------------

  if (status === 'loading') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <LoadingSpinner text="Authenticating..." />
      </div>
    );
  }

  // --------------------------------------------------
  // User information
  // --------------------------------------------------

  const userName = session?.user?.name || 'User';
  const userEmail = session?.user?.email || '';

  const userInitial = userName
    .trim()
    .charAt(0)
    .toUpperCase() || 'U';

  // --------------------------------------------------
  // Filter scheduled/sent emails
  // --------------------------------------------------

  const filteredTasks = tasks.filter((task) => {
    if (activeTab === 'scheduled') {
      return task.status === 'PENDING';
    }

    return task.status === 'SENT' || task.status === 'FAILED';
  });

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="h-screen w-full flex bg-white text-gray-900 overflow-hidden relative">

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside className="w-64 border-r border-gray-200 p-4 flex flex-col flex-shrink-0 bg-white">

        {/* Logo */}
        <div className="text-xl font-black tracking-tight mb-6 px-2">
          ReachInbox.ai
        </div>

        {/* =================================================
            USER PROFILE
        ================================================= */}

        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg mb-4 border border-gray-100">

          <div className="flex items-center gap-3 overflow-hidden">

            {/* Avatar - FIXED */}
            <div
              className="
                w-9 h-9
                rounded-full
                bg-[#00b050]
                text-white
                flex
                items-center
                justify-center
                text-sm
                font-bold
                flex-shrink-0
              "
            >
              {userInitial}
            </div>

            {/* User Details */}
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate">
                {userName}
              </p>

              <p className="text-[10px] text-gray-500 truncate">
                {userEmail}
              </p>
            </div>

          </div>

          {/* Logout */}
          <button
            onClick={() =>
              signOut({
                callbackUrl: '/login',
              })
            }
            title="Logout"
            className="p-1"
          >
            <LogOut
              size={14}
              className="
                text-gray-400
                hover:text-red-500
                cursor-pointer
                transition
              "
            />
          </button>

        </div>

        {/* =================================================
            SLACK ALERTS
        ================================================= */}

        <button
          onClick={() => setIsSlackModalOpen(true)}
          className="
            w-full
            flex
            items-center
            justify-center
            gap-2
            border
            border-gray-200
            text-gray-700
            hover:bg-gray-50
            transition
            py-2
            rounded-lg
            font-medium
            text-xs
            mb-4
            shadow-sm
          "
        >
          <Bell
            size={14}
            className="text-[#00b050]"
          />

          Configure Alerts
        </button>

        {/* =================================================
            COMPOSE
        ================================================= */}

        <button
          onClick={() => router.push('/compose')}
          className="
            w-full
            border
            border-[#00b050]
            text-[#00b050]
            hover:bg-[#00b050]
            hover:text-white
            transition
            py-2.5
            rounded-full
            font-medium
            text-sm
            mb-6
            shadow-sm
          "
        >
          Compose
        </button>

        {/* =================================================
            CORE
        ================================================= */}

        <div
          className="
            text-[10px]
            font-bold
            text-gray-400
            uppercase
            tracking-wider
            px-2
            mb-2
          "
        >
          Core
        </div>

        <div className="space-y-1">

          {/* Scheduled */}
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`
              w-full
              flex
              items-center
              justify-between
              px-3
              py-2
              rounded-lg
              text-xs
              font-medium
              transition
              ${
                activeTab === 'scheduled'
                  ? 'bg-[#eaf7f0] text-[#00b050]'
                  : 'text-gray-600 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <Clock size={14} />
              Scheduled
            </div>
          </button>

          {/* Sent */}
          <button
            onClick={() => setActiveTab('sent')}
            className={`
              w-full
              flex
              items-center
              justify-between
              px-3
              py-2
              rounded-lg
              text-xs
              font-medium
              transition
              ${
                activeTab === 'sent'
                  ? 'bg-[#eaf7f0] text-[#00b050]'
                  : 'text-gray-600 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <Send size={14} />
              Sent
            </div>
          </button>

        </div>

      </aside>

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <main className="flex-1 flex flex-col bg-white overflow-hidden">

        {/* =================================================
            TOP BAR
        ================================================= */}

        <div className="p-4 border-b border-gray-200 flex items-center justify-between">

          {/* Search */}
          <div className="relative w-96">

            <Search
              className="
                absolute
                left-3
                top-2.5
                text-gray-400
              "
              size={16}
            />

            <input
              type="text"
              placeholder="Search via Elasticsearch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="
                w-full
                pl-10
                pr-4
                py-2
                bg-[#f7f9f8]
                rounded-full
                text-xs
                focus:outline-none
                border
                border-gray-200
                focus:border-gray-300
                transition
              "
            />

          </div>

          {/* Refresh */}
          <div className="flex items-center gap-3 text-gray-500">

            <RotateCw
              size={16}
              className="
                cursor-pointer
                hover:text-gray-800
                transition
              "
              onClick={() => fetchEmails(false)}
            />

          </div>

        </div>

        {/* =================================================
            EMAIL LIST
        ================================================= */}

        <div className="flex-1 overflow-y-auto">

          {isLoading ? (

            <LoadingSpinner
              text={
                searchQuery.trim() !== ''
                  ? 'Searching index...'
                  : 'Loading emails...'
              }
            />

          ) : filteredTasks.length === 0 ? (

            <EmptyState
              title={
                activeTab === 'scheduled'
                  ? 'No scheduled emails'
                  : 'No sent emails'
              }
              description={
                searchQuery.trim() !== ''
                  ? 'No emails match your search.'
                  : activeTab === 'scheduled'
                  ? 'You currently have no scheduled emails.'
                  : 'You currently have no sent emails.'
              }
            />

          ) : (

            <div className="divide-y divide-gray-100">

              {filteredTasks.map((task) => (

                <div
                  key={task.id}
                  onClick={() => setSelectedEmail(task)}
                  className="
                    px-6
                    py-4
                    flex
                    items-center
                    justify-between
                    hover:bg-gray-50
                    transition
                    cursor-pointer
                    text-xs
                  "
                >

                  <div className="flex items-center gap-4 flex-1">

                    {/* Recipient */}
                    <span className="font-semibold w-48 truncate">
                      To: {task.recipientEmail}
                    </span>

                    {/* Status / Time */}
                    <span
                      className={`
                        px-2.5
                        py-1
                        rounded-full
                        text-[10px]
                        flex
                        items-center
                        gap-1
                        font-medium
                        w-36
                        justify-center
                        ${
                          activeTab === 'scheduled'
                            ? 'bg-[#fef3c7] text-[#92400e]'
                            : task.status === 'SENT'
                            ? 'bg-[#eaf7f0] text-[#00b050]'
                            : 'bg-red-50 text-red-600'
                        }
                      `}
                    >

                      {activeTab === 'scheduled' ? (
                        <>
                          <Clock size={10} />

                          {new Date(
                            task.scheduledFor
                          ).toLocaleString()}
                        </>
                      ) : (
                        <>
                          <Send size={10} />

                          {task.status}
                        </>
                      )}

                    </span>

                    {/* Subject */}
                    <span className="text-gray-600 truncate flex-1">
                      {task.subject || '(No subject)'}
                    </span>

                  </div>

                </div>

              ))}

            </div>

          )}

        </div>

      </main>

      {/* =====================================================
          EMAIL DETAILS MODAL
      ===================================================== */}

      {selectedEmail && (

        <div
          className="
            fixed
            inset-0
            bg-black/50
            flex
            items-center
            justify-center
            z-50
            p-4
          "
        >

          <div
            className="
              bg-white
              w-full
              max-w-2xl
              rounded-xl
              shadow-2xl
              overflow-hidden
              flex
              flex-col
              max-h-[85vh]
            "
          >

            {/* Modal Header */}
            <div
              className="
                px-6
                py-4
                border-b
                border-gray-100
                flex
                justify-between
                items-center
                bg-gray-50
              "
            >

              <h2 className="font-bold text-sm">
                Email Details
              </h2>

              <button
                onClick={() => setSelectedEmail(null)}
                className="text-gray-400 hover:text-gray-800"
              >
                <X size={18} />
              </button>

            </div>

            {/* Modal Body */}
            <div
              className="
                p-6
                overflow-y-auto
                flex-1
                text-sm
                space-y-4
              "
            >

              {/* To */}
              <div className="flex items-start gap-4">
                <span className="w-16 text-gray-400 font-medium text-xs">
                  To:
                </span>

                <span className="font-semibold text-gray-900">
                  {selectedEmail.recipientEmail}
                </span>
              </div>

              {/* Status */}
              <div className="flex items-start gap-4">

                <span className="w-16 text-gray-400 font-medium text-xs">
                  Status:
                </span>

                <span
                  className={`
                    px-2.5
                    py-1
                    rounded-md
                    text-[10px]
                    font-bold
                    ${
                      selectedEmail.status === 'PENDING'
                        ? 'bg-[#fef3c7] text-[#92400e]'
                        : selectedEmail.status === 'SENT'
                        ? 'bg-[#eaf7f0] text-[#00b050]'
                        : 'bg-red-50 text-red-600'
                    }
                  `}
                >
                  {selectedEmail.status}
                </span>

              </div>

              {/* Time */}
              <div className="flex items-start gap-4">

                <span className="w-16 text-gray-400 font-medium text-xs">
                  Time:
                </span>

                <span className="text-gray-900">
                  {new Date(
                    selectedEmail.status === 'SENT' &&
                    selectedEmail.sentAt
                      ? selectedEmail.sentAt
                      : selectedEmail.scheduledFor
                  ).toLocaleString()}
                </span>

              </div>

              {/* Subject */}
              <div
                className="
                  flex
                  items-start
                  gap-4
                  border-b
                  border-gray-100
                  pb-4
                "
              >

                <span className="w-16 text-gray-400 font-medium text-xs">
                  Subject:
                </span>

                <span className="font-semibold text-gray-900">
                  {selectedEmail.subject || '(No subject)'}
                </span>

              </div>

              {/* Body */}
              <div
                className="
                  pt-2
                  text-gray-800
                  whitespace-pre-wrap
                  leading-relaxed
                "
              >
                {selectedEmail.body || '(No body)'}
              </div>

            </div>

            {/* Modal Footer */}
            <div
              className="
                px-6
                py-4
                border-t
                border-gray-100
                bg-gray-50
                flex
                justify-end
              "
            >

              <button
                onClick={() => setSelectedEmail(null)}
                className="
                  px-4
                  py-2
                  bg-gray-200
                  hover:bg-gray-300
                  text-gray-800
                  rounded-lg
                  text-xs
                  font-medium
                  transition
                "
              >
                Close
              </button>

            </div>

          </div>

        </div>

      )}

      {/* =====================================================
          SLACK OAUTH MODAL
      ===================================================== */}

      {isSlackModalOpen && (

        <div
          className="
            fixed
            inset-0
            bg-black/50
            flex
            items-center
            justify-center
            z-50
            p-4
          "
        >

          <div
            className="
              bg-white
              w-full
              max-w-md
              rounded-xl
              shadow-2xl
              p-6
              relative
            "
          >

            {/* Close */}
            <button
              onClick={() => setIsSlackModalOpen(false)}
              className="
                absolute
                right-4
                top-4
                text-gray-400
                hover:text-gray-600
              "
            >
              <X size={18} />
            </button>

            {/* Heading */}
            <h2 className="text-base font-bold mb-2">
              Connect Slack Workspace
            </h2>

            {/* Description */}
            <p className="text-xs text-gray-500 mb-6">
              Authorize via Slack OAuth to receive instant
              rate-limit alerts directly in your channel when
              campaigns hit volume caps.
            </p>

            {/* Slack OAuth */}
            <button
              onClick={() => {
                window.location.href = `${API_URL}/slack/install`;
              }}
              className="
                w-full
                flex
                items-center
                justify-center
                gap-2
                bg-[#4A154B]
                text-white
                hover:bg-[#3b113c]
                transition
                py-3
                rounded-lg
                font-semibold
                text-xs
                shadow-sm
                mb-4
              "
            >
              Connect with Slack OAuth
            </button>

            {/* Close */}
            <div className="flex justify-end">

              <button
                onClick={() => setIsSlackModalOpen(false)}
                className="
                  px-4
                  py-2
                  text-xs
                  font-medium
                  text-gray-600
                  hover:bg-gray-100
                  rounded-lg
                "
              >
                Close
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}