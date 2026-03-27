import Link from "next/link";

const routes = [
  { href: "/terminal", label: "Terminal", desc: "ttyd web terminal" },
  { href: "/system", label: "System", desc: "usage, info & sessions" },
  { href: "/parsifal", label: "Parsifal", desc: "agent orchestration" },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-6">
      <h1 className="mb-8 font-mono text-2xl font-bold text-white">
        Ole Q Doc's Agent Swarm
      </h1>
      <div className="grid w-full max-w-sm gap-4">
        {routes.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-5 py-4 transition-colors hover:border-gray-600 hover:bg-gray-800"
          >
            <span className="font-mono text-lg text-white">{r.label}</span>
            <span className="text-sm text-gray-500">{r.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
