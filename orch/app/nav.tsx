"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home" },
  { href: "/parsifal", label: "Parsifal" },
  { href: "/system", label: "System" },
  { href: "/terminal", label: "Terminal" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-gray-800 bg-gray-950 px-4">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap px-3 py-3 font-mono text-sm transition-colors ${
              active
                ? "border-b-2 border-white text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
