// `npm run dev` 용 로컬 서버: index.html 화면과 /api/places 서버 함수를 한 번에 띄운다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root, ".env")); } catch {}

const { default: places } = await import("./api/places.js");
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/places") {
    res.status = code => { res.statusCode = code; return res; };
    res.json = obj => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(obj));
    };
    return places(req, res);
  }
  // 메인 폴더에 .env 같은 비밀 파일이 있으므로 index.html 하나만 내보낸다.
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(await readFile(path.join(root, "index.html")));
  }
  res.statusCode = 404;
  res.end("Not found");
});

// 포트가 이미 쓰이고 있으면 다음 번호로 넘어간다.
server.on("listening", () => console.log(`http://localhost:${server.address().port} 에서 열려요`));
function listen(port) {
  server.once("error", e => {
    if (e.code === "EADDRINUSE") listen(port + 1);
    else throw e;
  });
  server.listen(port);
}
listen(Number(PORT));
