import { query } from "@/lib/db";

export async function GET() {
  try {
    // 1. Összes Bér fuvar (sajat típus, nem törölt)
    const allBerFuvarok = await query(
      `select id, tipus, datum, lerakas_datum, megrendelo, teljesitve, postazva, postazva_at, statusz
       from fuvar_megbizasok
       where tipus = 'sajat' and statusz <> 'torolt'
       order by datum desc
       limit 100`
    );

    // 2. Megbízások, amelyek jelent kellene hogy legyenek a Számla/Posta fülön
    const szamlaPostaKellene = await query(
      `select id, tipus, datum, lerakas_datum, megrendelo, teljesitve, postazva, postazva_at, statusz
       from fuvar_megbizasok
       where tipus = 'sajat' and statusz <> 'torolt'
         and (teljesitve or coalesce(lerakas_datum, datum) < current_date)
       order by datum desc
       limit 100`
    );

    // 3. Megbízások, amelyek már archívban vannak (postázva + 5 perc eltelt)
    const archivban = await query(
      `select id, tipus, datum, megrendelo, postazva, postazva_at,
              now() - postazva_at as "eltelt_ido"
       from fuvar_megbizasok
       where tipus = 'sajat' and statusz <> 'torolt'
         and postazva and postazva_at <= now() - interval '5 minutes'
       order by postazva_at desc
       limit 100`
    );

    // 4. Megbízások akik a Számla/Posta-n VANNAK (nem archívban)
    const szamlaPostaBennVan = await query(
      `select id, tipus, datum, lerakas_datum, megrendelo, teljesitve, postazva, postazva_at, statusz
       from fuvar_megbizasok
       where tipus = 'sajat' and statusz <> 'torolt'
         and (teljesitve or coalesce(lerakas_datum, datum) < current_date)
         and not (postazva and postazva_at <= now() - interval '5 minutes')
       order by teljesitve asc, coalesce(lerakas_datum, datum) desc, datum desc
       limit 100`
    );

    // 5. Ma vagy után készülő Bér fuvarok (még "Folyamatban")
    const folyamatban = await query(
      `select id, tipus, datum, lerakas_datum, megrendelo, teljesitve
       from fuvar_megbizasok
       where tipus = 'sajat' and statusz <> 'torolt'
         and not teljesitve
         and coalesce(lerakas_datum, datum) >= current_date
       order by coalesce(lerakas_datum, datum) asc
       limit 100`
    );

    return new Response(
      JSON.stringify(
        {
          summary: {
            osszesBerFuvarok: allBerFuvarok.length,
            szamlaPostaBennVan: szamlaPostaBennVan.length,
            archivban: archivban.length,
            folyamatban: folyamatban.length,
            szamlaPostaKelleneVolna: szamlaPostaKellene.length,
          },
          szamlaPostaBennVan,
          szamlaPostaKelleneLenne: szamlaPostaKellene.filter(
            (f: any) =>
              !(
                f.postazva &&
                new Date(f.postazva_at).getTime() <= Date.now() - 5 * 60 * 1000
              )
          ),
          archivban,
          folyamatban,
          allBerFuvarok,
        },
        null,
        2
      ),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
