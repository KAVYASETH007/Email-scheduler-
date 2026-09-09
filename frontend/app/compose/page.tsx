'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Clock, UploadCloud, X, ChevronDown, Calendar } from 'lucide-react';

export default function ComposePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [recipients, setRecipients] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delayBetween, setDelayBetween] = useState('3000');
  const [hourlyLimit, setHourlyLimit] = useState('50');
  
  const [actionType, setActionType] = useState<'send' | 'schedule'>('send');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleHour, setScheduleHour] = useState('09');
  const [scheduleMinute, setScheduleMinute] = useState('00');
  
  const [isSending, setIsSending] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
      const foundEmails = text.match(emailRegex) || [];
      const uniqueEmails = Array.from(new Set([...recipients, ...foundEmails]));
      setRecipients(uniqueEmails);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && currentInput.trim()) {
      e.preventDefault();
      const email = currentInput.trim().replace(',', '');
      if (email && !recipients.includes(email)) {
        setRecipients([...recipients, email]);
        setCurrentInput('');
      }
    }
  };

  const handleSubmit = async () => {
    if (recipients.length === 0 || !subject || !body) return alert("Please fill all required fields.");
    
    let scheduledStartIso = new Date().toISOString();
    if (actionType === 'schedule') {
      if (!scheduleDate) return alert("Please select a schedule date.");
      const [year, month, day] = scheduleDate.split('-').map(Number);
      const hr = parseInt(scheduleHour) || 0;
      const min = parseInt(scheduleMinute) || 0;
      const targetDate = new Date(year, month - 1, day, hr, min, 0);
      scheduledStartIso = targetDate.toISOString();
    }
    
    setIsSending(true);

    try {
      await fetch('http://localhost:4000/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: session?.user?.email || 'kavya@example.com',
          subject,
          body,
          recipients,
          scheduledStart: scheduledStartIso,
          // THE FIX: Explicitly sending these numbers to the backend
          delayBetween: parseInt(delayBetween),
          hourlyLimit: parseInt(hourlyLimit)
        })
      });
      router.push('/');
    } catch (err) {
      alert('Failed to submit campaign');
      setIsSending(false);
    }
  };

  const removeRecipient = (emailToRemove: string) => {
    setRecipients(recipients.filter(e => e !== emailToRemove));
  };

  return (
    <div className="h-screen w-full bg-white text-gray-900 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="hover:bg-gray-100 p-2 rounded-full transition">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-bold text-base">Compose New Email</h1>
        </div>

        <div 
          className="relative flex items-stretch shadow-sm rounded-full h-9"
          onMouseLeave={() => setIsDropdownOpen(false)}
        >
          <button 
            onClick={handleSubmit}
            disabled={isSending}
            className="bg-[#00b050] text-white px-6 rounded-l-full font-medium text-xs hover:bg-[#009844] transition disabled:opacity-50 flex items-center justify-center min-w-[150px]"
          >
            {isSending ? 'Processing...' : actionType === 'send' ? 'Send' : 'Schedule Campaign'}
          </button>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="bg-[#00b050] hover:bg-[#009844] text-white px-3 rounded-r-full transition border-l border-white/20 flex items-center justify-center"
          >
            <ChevronDown size={14} />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-11 w-44 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 text-xs overflow-hidden">
              <button 
                onClick={() => { setActionType('send'); setIsDropdownOpen(false); }}
                className={`w-full text-left px-4 py-2 hover:bg-gray-50 font-medium transition-colors ${actionType === 'send' ? 'text-[#00b050] bg-gray-50' : 'text-gray-700'}`}
              >
                Send Now
              </button>
              <button 
                onClick={() => { setActionType('schedule'); setIsDropdownOpen(false); }}
                className={`w-full text-left px-4 py-2 hover:bg-gray-50 font-medium transition-colors ${actionType === 'schedule' ? 'text-[#00b050] bg-gray-50' : 'text-gray-700'}`}
              >
                Schedule Campaign
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-6 overflow-y-auto max-w-5xl mx-auto w-full space-y-4">
        <div className="flex items-center border-b border-gray-100 pb-3 text-xs">
          <span className="w-16 text-gray-400 font-medium">From:</span>
          <span className="text-gray-800 font-medium">{session?.user?.email || 'kavya@example.com'}</span>
        </div>

        <div className="border-b border-gray-100 pb-3">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2 flex-1 pr-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-16 text-gray-400 font-medium text-xs flex-shrink-0">To:</span>
                <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                  {recipients.map((email) => (
                    <span key={email} className="bg-[#eaf7f0] text-[#00b050] px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-[#bbf7d0] text-xs font-medium">
                      {email}
                      <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => removeRecipient(email)} />
                    </span>
                  ))}
                  <input 
                    type="email" 
                    placeholder={recipients.length === 0 ? "Type email and press enter or upload CSV..." : "Add another..."}
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 min-w-[200px] text-xs focus:outline-none bg-transparent py-1"
                  />
                </div>
              </div>
              {recipients.length > 0 && (
                <span className="text-[10px] text-[#00b050] font-bold ml-16">{recipients.length} email(s) added</span>
              )}
            </div>

            <input type="file" accept=".csv, .txt" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-[#00b050] font-medium hover:bg-gray-50 px-3 py-1.5 rounded-lg transition border border-gray-200 text-xs shadow-sm flex-shrink-0"
            >
              <UploadCloud size={14} /> Upload CSV/TXT
            </button>
          </div>
        </div>

        <div className="flex items-center border-b border-gray-100 pb-3 text-xs">
          <span className="w-16 text-gray-400 font-medium">Subject:</span>
          <input 
            type="text" 
            placeholder="Enter subject line..." 
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 focus:outline-none text-gray-900 text-xs"
          />
        </div>

        <div className="flex items-center gap-6 border-b border-gray-100 pb-3 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-medium">Delay (ms):</span>
            <input 
              type="number" 
              value={delayBetween}
              onChange={(e) => setDelayBetween(e.target.value)}
              className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-center focus:outline-none focus:border-[#00b050]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-medium">Hourly Limit:</span>
            <input 
              type="number" 
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-center focus:outline-none focus:border-[#00b050]"
            />
          </div>

          {actionType === 'schedule' ? (
            <div className="flex items-center gap-3 bg-[#eaf7f0] px-3 py-1.5 rounded-lg border border-[#bbf7d0]">
              <div className="flex items-center gap-1.5 text-[#00b050] font-medium">
                <Calendar size={14} />
                <span>Date:</span>
                <input 
                  type="date" 
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="bg-white px-2 py-0.5 rounded border border-[#bbf7d0] text-gray-800 text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 text-[#00b050] font-medium">
                <Clock size={14} />
                <span>Time (HR : MIN):</span>
                <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-[#bbf7d0]">
                  <input 
                    type="number" 
                    min="0" 
                    max="23" 
                    placeholder="HR" 
                    value={scheduleHour} 
                    onChange={(e) => setScheduleHour(e.target.value.padStart(2, '0'))}
                    className="w-8 text-center bg-transparent text-gray-800 focus:outline-none font-semibold text-xs" 
                  />
                  <span className="text-gray-400">:</span>
                  <input 
                    type="number" 
                    min="0" 
                    max="59" 
                    placeholder="MIN" 
                    value={scheduleMinute} 
                    onChange={(e) => setScheduleMinute(e.target.value.padStart(2, '0'))}
                    className="w-8 text-center bg-transparent text-gray-800 focus:outline-none font-semibold text-xs" 
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-400 text-xs">
              <Clock size={14} />
              <span>Starts immediately</span>
            </div>
          )}
        </div>

        <textarea 
          placeholder="Type your email body here..." 
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full flex-1 p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#00b050] resize-none text-xs bg-gray-50 min-h-[300px]"
        />
      </div>
    </div>
  );
}