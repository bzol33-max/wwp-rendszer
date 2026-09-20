// A Jelenléti/üzenőfal a terv saját palettájával jelenik meg (.jelenlet a
// globals.css-ben), nem a régi bézs témával — ugyanaz a döntés, mint a
// Fuvarozás 2-nél (2026-09-20, Budaházi Zoltán). A wrapper a main belső
// paddingját ellensúlyozva a teljes tartalomterületet befesti.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="jelenlet -mx-4 -my-5 -mb-24 min-h-[calc(100vh-0px)] px-4 py-5 pb-24 md:-mx-8 md:-my-7 md:-mb-7 md:px-8 md:py-7 md:pb-7">
      {children}
    </div>
  );
}
