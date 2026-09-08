// Egyszerű, User-Agent alapú eszközfelismerés. Nem tökéletes — pl. az
// iPadOS 13+ alapértelmezetten asztali Safari User-Agentet küld, ez UA
// alapján nem különböztethető meg egy Mac géptől —, de a gyakorlati esetek
// (telefon vs. asztali/laptop gép) túlnyomó többségét helyesen azonosítja,
// és ez elég egy alapértelmezett nézet eldöntéséhez.
const MOBILE_USER_AGENT_RE =
  /Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini|Mobile/i;
const TABLET_HINT_RE = /iPad|Tablet|PlayBook|Silk/i;

export function isMobileUserAgent(
  userAgent: string | null | undefined
): boolean {
  if (!userAgent) return false;
  if (TABLET_HINT_RE.test(userAgent)) return false;
  return MOBILE_USER_AGENT_RE.test(userAgent);
}
