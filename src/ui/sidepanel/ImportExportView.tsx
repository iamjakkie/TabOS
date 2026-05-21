import React, { useState, useRef } from 'react';
import { decompressArchive, parseURLList } from '../../portability/importer';

type Strategy = 'clean' | 'merge' | 'workspace';

export default function ImportExportView() {
  const [strategy, setStrategy] = useState<Strategy>('merge');
  const [status, setStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport(scope: 'full' | 'selective') {
    await chrome.runtime.sendMessage({
      type: 'TRIGGER_EXPORT',
      payload: { scope, includeArchived: true, includeEmbeddings: false, includeClassifierState: true },
    });
    setStatus('Export started — check your downloads folder.');
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus('Reading file…');

    try {
      let json: string;
      if (file.name.endsWith('.tabos')) {
        const buffer = await file.arrayBuffer();
        json = decompressArchive(buffer);
      } else if (file.name.endsWith('.json')) {
        json = await file.text();
      } else {
        // Assume OneTab / URL list
        const text = await file.text();
        const entries = parseURLList(text);
        await chrome.runtime.sendMessage({
          type: 'TRIGGER_IMPORT',
          payload: { archiveJson: JSON.stringify({ version: 1, tabEntries: entries }), strategy: 'merge' },
        });
        setStatus(`Imported ${entries.length} tabs from URL list.`);
        setIsImporting(false);
        return;
      }

      const result = await chrome.runtime.sendMessage({
        type: 'TRIGGER_IMPORT',
        payload: { archiveJson: json, strategy },
      });

      setStatus(result?.ok ? 'Import complete.' : `Import failed: ${result?.error}`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="p-4 space-y-6 text-sm">
      <h2 className="font-semibold text-base">Import / Export</h2>

      {/* Export */}
      <section className="space-y-2">
        <h3 className="font-medium text-gray-500 uppercase text-xs tracking-wider">Export</h3>
        <button
          onClick={() => handleExport('full')}
          className="w-full py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600"
        >
          Export all tabs (.tabos)
        </button>
        <p className="text-xs text-gray-400">
          Creates a gzipped archive of all your tabs, workspaces, and settings.
        </p>
      </section>

      {/* Import */}
      <section className="space-y-3">
        <h3 className="font-medium text-gray-500 uppercase text-xs tracking-wider">Import</h3>

        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Import strategy</p>
          {(['merge', 'clean', 'workspace'] as Strategy[]).map((s) => (
            <label key={s} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="strategy"
                value={s}
                checked={strategy === s}
                onChange={() => setStrategy(s)}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium capitalize">{s === 'clean' ? 'Clean (wipe & replace)' : s === 'merge' ? 'Merge (non-destructive)' : 'Workspace-selective'}</div>
                <div className="text-xs text-gray-400">
                  {s === 'clean' && 'Removes all local data, loads archive. Use for fresh machine setup.'}
                  {s === 'merge' && 'Keeps local data, adds new tabs from archive. Deduplicates by URL.'}
                  {s === 'workspace' && 'Imports only selected workspaces from the archive.'}
                </div>
              </div>
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 py-2 px-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:border-indigo-400 transition-colors">
          <span className="text-gray-500">
            {isImporting ? 'Importing…' : 'Choose .tabos, .json, or URL list file'}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".tabos,.json,.txt"
            className="hidden"
            onChange={handleFileImport}
            disabled={isImporting}
          />
        </label>
      </section>

      {status && (
        <div className="text-xs px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          {status}
        </div>
      )}
    </div>
  );
}
