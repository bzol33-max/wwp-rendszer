// A Jelenléti/üzenőfal 2026-10 (redesign 6) óta a közös kék sémát kapja; a
// .jelenlet a globals.css-ben már csak a lekerekítést állítja. A wrapper a main
// belső paddingját ellensúlyozza (a háttér a body-gradiens).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="jelenlet -mx-4 -my-5 -mb-24 min-h-[calc(100vh-0px)] px-4 py-5 pb-24 md:-mx-8 md:-my-7 md:-mb-7 md:px-8 md:py-7 md:pb-7">
      {children}
    </div>
  );
}
