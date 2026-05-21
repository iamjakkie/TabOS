import React, { useState } from 'react';

interface Props {
  onSelect: (ms: number) => void;
  onCancel: () => void;
}

const PRESETS = [
  { label: '1 hour', ms: 3_600_000 },
  { label: '4 hours', ms: 4 * 3_600_000 },
  { label: '1 day', ms: 86_400_000 },
  { label: '2 days', ms: 2 * 86_400_000 },
  { label: '1 week', ms: 7 * 86_400_000 },
];

export default function TimePicker({ onSelect, onCancel }: Props) {
  const [customDate, setCustomDate] = useState('');

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-56">
      <p className="text-xs font-medium text-gray-500 mb-2">Snooze until…</p>

      <div className="flex flex-col gap-1 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onSelect(p.ms)}
            className="text-sm px-2 py-1.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900 text-left text-gray-700 dark:text-gray-200"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
        <input
          type="datetime-local"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className="w-full text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => {
              const ms = customDate ? new Date(customDate).getTime() - Date.now() : 0;
              if (ms > 0) onSelect(ms);
            }}
            className="flex-1 text-xs px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
          >
            Set
          </button>
          <button
            onClick={onCancel}
            className="flex-1 text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
