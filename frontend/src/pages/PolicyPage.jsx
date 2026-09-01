import React from 'react';
import { Link } from 'react-router-dom';
import { IconArrowLeft } from '../components/icons.jsx';

export default function PolicyPage({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-white dark:bg-sidebarDark text-gray-800 dark:text-gray-100">
      <div className="bg-panel dark:bg-panelDark px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link to="/login" className="text-white flex items-center">
          <IconArrowLeft className="w-[24px] h-[24px]" />
        </Link>
        <h1 className="text-white font-medium text-lg">{title}</h1>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="text-xs text-gray-400 mb-6">Last updated: {updated}</div>
        <div className="space-y-6 text-sm leading-relaxed">{children}</div>
      </div>
      <div className="text-center pb-10 text-xs text-gray-400 flex justify-center gap-4">
        <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:underline">Terms of Service</Link>
      </div>
    </div>
  );
}

export function Section({ h, children }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-2">{h}</h2>
      <div className="text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  );
}