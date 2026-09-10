// Az /attekintes felhasználónkénti beállításai (színséma, fülek) a
// bejelentkezett felhasználó megjelenítendő neve (session.name) alapján
// dőlnek el. Az összehasonlítást ékezettől, szóköztől és kis/nagybetűtől
// függetlenné tesszük, hogy a rendszerben pontosan rögzített névformától
// (szóközzel vagy anélkül, ékezettel vagy anélkül) függetlenül működjön.
export function normalizeNev(nev: string): string {
  return nev
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}
