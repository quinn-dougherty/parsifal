"use client";

export default function TerminalPage() {
  const ttydUrl =
    typeof window !== "undefined"
      ? `http://${window.location.hostname}:7681`
      : "";

  return (
    <iframe
      src={ttydUrl}
      className="flex-1 w-full border-0"
      allow="clipboard-read; clipboard-write"
    />
  );
}
