import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourceDir = path.resolve(projectRoot, "..", "..", "content", "drafts", "ga_consensus");
const outDir = path.resolve(projectRoot, "public", "static-data");
const outFile = path.resolve(outDir, "ga-consensus-files.json");
const linksSource = path.resolve(sourceDir, ".zotero-citation-map.json");
const linksOut = path.resolve(outDir, "citation-links.json");

async function main() {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.startsWith("ga_") && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "ja"));

  const payload = [];
  for (const name of files) {
    const abs = path.resolve(sourceDir, name);
    const content = await fs.readFile(abs, "utf8");
    payload.push({ name, content });
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify({ files: payload }, null, 2), "utf8");
  console.log(`Wrote ${payload.length} files to ${path.relative(projectRoot, outFile)}`);

  // Bundle the citation-link map so the read-only remote can render clickable [n].
  const linksJson = await fs.readFile(linksSource, "utf8").catch(() => "{}");
  await fs.writeFile(linksOut, linksJson, "utf8");
  console.log(`Wrote citation links to ${path.relative(projectRoot, linksOut)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
