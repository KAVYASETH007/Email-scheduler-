import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
}

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-16 text-center">
      <div className="bg-gray-50 p-4 rounded-full mb-4 border border-gray-100">
        <Inbox className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-sm font-bold text-gray-800 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 max-w-xs">{description}</p>
    </div>
  );
}