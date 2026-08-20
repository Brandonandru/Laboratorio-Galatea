// build-blog.js
// Trae los posts marcados como "Publicado" desde la base de Notion
// y los inyecta en index.html, entre los marcadores BLOG_POSTS_START / BLOG_POSTS_END.
//
// Variables de entorno necesarias:
//   NOTION_TOKEN        -> token secreto de la integración de Notion
//   NOTION_DATABASE_ID  -> ID de la base "Blog - Laboratorio Galatea"
 
const fs = require("fs");
const path = require("path");
 
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const INDEX_HTML_PATH = process.env.INDEX_HTML_PATH || "index.html";
 
const START_MARKER = "<!-- BLOG_POSTS_START -->";
const END_MARKER = "<!-- BLOG_POSTS_END -->";
 
if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error(
    "Faltan variables de entorno. Necesitás NOTION_TOKEN y NOTION_DATABASE_ID."
  );
  process.exit(1);
}
 
function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
 
function formatDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("es-UY", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
 
async function queryPublishedPosts() {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          property: "Estado",
          select: { equals: "Publicado" },
        },
        sorts: [
          {
            property: "Fecha de publicación",
            direction: "descending",
          },
        ],
      }),
    }
  );
 
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error consultando Notion (${res.status}): ${text}`);
  }
 
  const data = await res.json();
  return data.results;
}
 
function getPlainText(richTextArray = []) {
  return richTextArray.map((t) => t.plain_text).join("");
}
 
function getFileUrl(fileProp) {
  const file = fileProp?.files?.[0];
  if (!file) return null;
  return file.type === "external" ? file.external.url : file.file.url;
}
 
function postToHtml(page) {
  const props = page.properties;
 
  const title = getPlainText(props["Título"]?.title);
  const summary = getPlainText(props["Resumen"]?.rich_text);
  const category = props["Categoría"]?.select?.name || "";
  const coverUrl = getFileUrl(props["Imagen de portada"]);
  const slug = getPlainText(props["Slug"]?.rich_text);
 
  // Estructura idéntica a la que ya usa el sitio (clases .post, .post-media,
  // .post-body, .eyebrow, .read) para que el diseño no cambie.
  const mediaStyle = coverUrl
    ? ` style="background-image:url('${escapeHtml(
        coverUrl
      )}');background-size:cover;background-position:center;"`
    : "";
 
  return `        <article class="post">
          <div class="post-media"${mediaStyle}></div>
          <div class="post-body">
            ${category ? `<span class="eyebrow">${escapeHtml(category)}</span>` : ""}
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(summary)}</p>
            <span class="read">Leer más →</span>
          </div>
        </article>`;
}
 
async function main() {
  console.log("Buscando posts publicados en Notion...");
  const posts = await queryPublishedPosts();
  console.log(`Encontrados ${posts.length} post(s) publicado(s).`);
 
  const postsHtml = posts.map(postToHtml).join("\n");
 
  const indexPath = path.resolve(process.cwd(), INDEX_HTML_PATH);
  if (!fs.existsSync(indexPath)) {
    console.error(`No se encontró el archivo: ${indexPath}`);
    process.exit(1);
  }
 
  const originalHtml = fs.readFileSync(indexPath, "utf-8");
 
  if (!originalHtml.includes(START_MARKER) || !originalHtml.includes(END_MARKER)) {
    console.error(
      `No se encontraron los marcadores ${START_MARKER} / ${END_MARKER} en ${INDEX_HTML_PATH}.\n` +
        "Agregalos una vez, manualmente, en el lugar del HTML donde querés que aparezcan los posts."
    );
    process.exit(1);
  }
 
  const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`);
  const newBlock = `${START_MARKER}\n${postsHtml}\n      ${END_MARKER}`;
  const updatedHtml = originalHtml.replace(regex, newBlock);
 
  if (updatedHtml === originalHtml) {
    console.log("Sin cambios: el contenido del blog ya está actualizado.");
  } else {
    fs.writeFileSync(indexPath, updatedHtml, "utf-8");
    console.log(`Listo. ${INDEX_HTML_PATH} actualizado con ${posts.length} post(s).`);
  }
}
 
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
 

