// A Számlák modul a Fuvarozás 2 színeit használja (.szamlak a globals.css-ben,
// a .fuvarozas2-vel közös blokkban) — döntés: 2026-09-25 (Budaházi Zoltán).
// A wrapper a main belső paddingját ellensúlyozva festi a teljes tartalomterületet,
// ugyanúgy, mint az app/fuvarozas2/layout.tsx.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="szamlak -mx-4 -my-5 -mb-24 min-h-[calc(100vh-0px)] px-4 py-5 pb-24 md:-mx-8 md:-my-7 md:-mb-7 md:px-8 md:py-7 md:pb-7">
      {children}
    </div>
  );
}
