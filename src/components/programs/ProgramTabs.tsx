// A program's own sections as a row of tabs (LP-103), each a link to its hash,
// so back, forward and saved links work.

export default function ProgramTabs({
  label,
  tabs,
  current,
}: {
  label: string;
  tabs: Array<{ href: string; text: string; id: string }>;
  current: string;
}) {
  return (
    <nav className="row library-tabs program-tabs" aria-label={label}>
      {tabs.map((t) => (
        <a
          key={t.href}
          id={t.id}
          href={t.href}
          className={"btn" + (t.href === current ? " primary" : "")}
          aria-current={t.href === current ? "page" : undefined}
        >
          {t.text}
        </a>
      ))}
    </nav>
  );
}
