import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ text = "Loading data..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-gray-400">
      <Loader2 className="w-8 h-8 animate-spin mb-4 text-[#00b050]" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}