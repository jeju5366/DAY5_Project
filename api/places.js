// 위치정보 + 일반정보 API를 서버에서 불러와 `데이터 고유번호`로 합쳐 내려주는 함수.
// 인증키는 서버 환경변수로만 읽고, 브라우저에는 내려보내지 않는다.

const BASE = process.env.ODCLOUD_BASE || "https://api.odcloud.kr/api";
const SOURCES = {
  location: { path: "/15109570/v1/uddi:8781448b-81a8-487c-bc95-d26335bafa82", keyEnv: "JEJU_LOCATION_API_KEY" },
  general: { path: "/15109587/v1/uddi:56c2b3a4-4b4b-46cd-a1fa-f928ef731ffb", keyEnv: "JEJU_GENERAL_API_KEY" },
};
const PER_PAGE = 500;
const MAX_PAGES = 20;
const TTL = 60 * 60 * 1000;
const GENERAL_FIELDS = ["분류", "디렉토리1", "디렉토리2", "제목", "부제목", "저작자", "주제", "내용", "목차", "초록", "발행자", "발행일", "자료유형", "자료형태", "출처", "기여자", "참고문헌"];

let cache = null;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const str = v => (v == null ? "" : String(v));
// 포털의 Encoding 키(%가 들어간 값)를 넣어도 이중 인코딩되지 않게 한다.
const normalizeKey = k => (k.includes("%") ? decodeURIComponent(k) : k);

async function fetchAll({ path, keyEnv }) {
  const raw = process.env[keyEnv];
  if (!raw || !raw.trim()) throw new HttpError(500, `${keyEnv} 환경변수가 비어 있어요`);
  const key = normalizeKey(raw.trim());
  const out = [];
  let total = Infinity;
  for (let page = 1; out.length < total && page <= MAX_PAGES; page++) {
    const url = `${BASE}${path}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${encodeURIComponent(key)}`;
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch {
      throw new HttpError(502, "공공데이터 서버에 연결하지 못했어요");
    }
    if (!res.ok) throw new HttpError(502, `공공데이터 서버 응답 오류 (${res.status}, ${keyEnv})`);
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.data)) throw new HttpError(502, "공공데이터 응답 형식이 달라요");
    total = body.totalCount ?? body.data.length;
    out.push(...body.data);
    if (!body.data.length) break;
  }
  return out;
}

function merge(locations, generals) {
  const loc = new Map(locations.map(x => [str(x["데이터 고유번호"]), x]));
  const gen = new Map(generals.map(x => [str(x["데이터 고유번호"]), x]));
  const ids = [...new Set([...loc.keys(), ...gen.keys()])].sort((a, b) => Number(a) - Number(b));
  return ids.map(id => {
    const a = loc.get(id) || {};
    const b = gen.get(id) || {};
    const item = {
      id,
      장소명: str(a.장소명 || b.장소명),
      위도: str(a.위도 || b.위도),
      경도: str(a.경도 || b.경도),
      우편번호: str(a.우편번호),
      위치: str(a.위치),
      좌표계값: str(a.좌표계값),
    };
    for (const f of GENERAL_FIELDS) item[f] = str(b[f]);
    item.링크 = str(b.링크 || a["데이터 상세보기 URL"]);
    return item;
  });
}

export default async function handler(req, res) {
  try {
    if (!cache || Date.now() - cache.at > TTL) {
      const [locations, generals] = await Promise.all([fetchAll(SOURCES.location), fetchAll(SOURCES.general)]);
      cache = { at: Date.now(), items: merge(locations, generals) };
    }
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ count: cache.items.length, items: cache.items });
  } catch (e) {
    const known = e instanceof HttpError;
    res.status(known ? e.status : 500).json({ error: known ? e.message : "서버 오류가 났어요" });
  }
}
