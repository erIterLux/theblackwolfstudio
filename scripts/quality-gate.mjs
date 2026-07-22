import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const srcDir = path.join(root, 'src');
const publicDir = path.join(root, 'public');
const reportDir = path.join(root, 'quality');
const failures = [];
const warnings = [];
const notes = [];

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target, predicate);
    return predicate(target) ? [target] : [];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(2)} MB`;
}

function addFailure(message) {
  failures.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function addNote(message) {
  notes.push(message);
}

function auditRequiredFiles() {
  const required = [
    'src/App.jsx',
    'src/main.jsx',
    'src/components/system/AppErrorBoundary.jsx',
    'src/components/system/NetworkStatusBanner.jsx',
    'src/components/system/RouteAnnouncer.jsx',
    'src/styles/verification-hardening.css',
    'firebase.json',
  ];

  required.forEach((file) => {
    if (!fs.existsSync(path.join(root, file))) addFailure(`Missing required file: ${file}`);
  });
}

function auditRoutes() {
  const appPath = path.join(srcDir, 'App.jsx');
  if (!fs.existsSync(appPath)) return;
  const source = fs.readFileSync(appPath, 'utf8');
  const routes = [...source.matchAll(/<Route\s+[^>]*path="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = routes.filter((route, index) => routes.indexOf(route) !== index);
  if (duplicates.length) addFailure(`Duplicate route paths: ${[...new Set(duplicates)].join(', ')}`);
  if (!routes.includes('*')) addFailure('The marketing route tree has no catch-all page.');
  if (!routes.includes('member/*')) addFailure('The member route tree has no catch-all page.');
  if (!routes.includes('instructor/*')) addFailure('The instructor route tree has no catch-all page.');
  addNote(`Route audit found ${routes.length} explicit route patterns.`);
}

function auditJsx() {
  const files = walk(srcDir, (file) => /\.(jsx|tsx)$/.test(file));
  let imagesWithoutAlt = 0;
  let targetBlankWithoutRel = 0;
  let implicitButtons = 0;

  files.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const imageMatches = source.match(/<img\b(?![^>]*\balt\s*=)[^>]*>/gs) || [];
    const blankMatches = source.match(/<a\b(?=[^>]*target=["']_blank["'])(?![^>]*\brel\s*=)[^>]*>/gs) || [];
    const buttonMatches = source.match(/<button\b(?![^>]*\btype\s*=)[^>]*>/gs) || [];

    if (imageMatches.length) {
      imagesWithoutAlt += imageMatches.length;
      addFailure(`${relative(file)} has ${imageMatches.length} <img> element(s) without alt.`);
    }
    if (blankMatches.length) {
      targetBlankWithoutRel += blankMatches.length;
      addWarning(`${relative(file)} has target="_blank" without rel.`);
    }
    if (buttonMatches.length) {
      implicitButtons += buttonMatches.length;
      addWarning(`${relative(file)} has ${buttonMatches.length} button(s) without explicit type.`);
    }
  });

  addNote(`JSX audit: ${files.length} files, ${imagesWithoutAlt} missing alt, ${targetBlankWithoutRel} unsafe blank links, ${implicitButtons} implicit buttons.`);
}

function auditStyles() {
  const files = walk(path.join(srcDir, 'styles'), (file) => file.endsWith('.css'));
  let tinyTextRules = 0;
  let importantRules = 0;

  files.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const tinyMatches = source.match(/font-size\s*:\s*(?:0\.[0-6]\d*rem|(?:[0-9]|1[01])px)\s*;/g) || [];
    const importantMatches = source.match(/!important/g) || [];
    tinyTextRules += tinyMatches.length;
    importantRules += importantMatches.length;
  });

  if (tinyTextRules > 20) addWarning(`${tinyTextRules} CSS declarations use text smaller than approximately 12px.`);
  if (importantRules > 40) addWarning(`${importantRules} !important declarations remain in the stylesheet stack.`);
  addNote(`CSS audit: ${files.length} files, ${tinyTextRules} very-small text rules, ${importantRules} !important rules.`);
}


function auditNorwesterFont() {
  const fontDirectory = path.join(publicDir, 'fonts');
  if (!fs.existsSync(fontDirectory)) {
    addWarning('public/fonts was not present in this verification copy. Confirm the existing Norwester file remains in the deployed project.');
    return;
  }

  const files = fs.readdirSync(fontDirectory);
  const match = files.find((file) => file.toLowerCase() === 'norwester.otf');
  if (!match) {
    addWarning('No Norwester OTF file was found in public/fonts.');
    return;
  }

  const globalCssPath = path.join(srcDir, 'styles', 'global.css');
  if (!fs.existsSync(globalCssPath)) return;
  const css = fs.readFileSync(globalCssPath, 'utf8');
  const reference = css.match(/url\(["']?\/fonts\/([^"')]+)["']?\)/i)?.[1];
  if (reference && reference !== match) {
    addFailure(`Norwester filename casing does not match the CSS URL: CSS uses ${reference}, file is ${match}.`);
  } else {
    addNote(`Norwester font verified at public/fonts/${match}.`);
  }
}

function auditPublicAssets() {
  const assets = walk(publicDir, (file) => fs.statSync(file).size > 0);
  assets.forEach((file) => {
    const size = fs.statSync(file).size;
    if (size > 750 * 1024) addWarning(`${relative(file)} is ${formatBytes(size)} and should be compressed or resized.`);
    if (/black-wolf-mark\.(png|jpg|jpeg)$/i.test(file) && size > 250 * 1024) {
      addWarning(`${relative(file)} is ${formatBytes(size)} even though it is displayed as a small logo.`);
    }
  });
  addNote(`Public asset audit checked ${assets.length} files.`);
}

function auditBuild() {
  if (!fs.existsSync(distDir)) {
    addFailure('dist/ does not exist. Run npm run build before the quality gate.');
    return [];
  }

  const files = walk(distDir, (file) => fs.statSync(file).isFile());
  const entries = files.map((file) => {
    const contents = fs.readFileSync(file);
    return {
      file: relative(file),
      bytes: contents.length,
      gzipBytes: /\.(js|css|html|svg|json)$/i.test(file) ? zlib.gzipSync(contents).length : null,
    };
  });

  const js = entries.filter((entry) => entry.file.endsWith('.js'));
  const css = entries.filter((entry) => entry.file.endsWith('.css'));
  const totalJsGzip = js.reduce((sum, entry) => sum + (entry.gzipBytes || 0), 0);
  const totalCssGzip = css.reduce((sum, entry) => sum + (entry.gzipBytes || 0), 0);
  const largestJs = [...js].sort((a, b) => b.bytes - a.bytes)[0];

  js.forEach((entry) => {
    if (entry.bytes > 1.25 * 1024 * 1024) addFailure(`${entry.file} exceeds the 1.25 MB JavaScript chunk ceiling.`);
    else if (entry.bytes > 750 * 1024) addWarning(`${entry.file} exceeds the 750 KB JavaScript warning budget.`);
  });
  if (totalJsGzip > 900 * 1024) addWarning(`Total JavaScript gzip size is ${formatBytes(totalJsGzip)}.`);
  if (totalCssGzip > 180 * 1024) addWarning(`Total CSS gzip size is ${formatBytes(totalCssGzip)}.`);

  addNote(`Build audit: ${js.length} JS chunks, ${css.length} CSS chunks, total JS gzip ${formatBytes(totalJsGzip)}, total CSS gzip ${formatBytes(totalCssGzip)}.`);
  if (largestJs) addNote(`Largest JS chunk: ${largestJs.file} (${formatBytes(largestJs.bytes)}, ${formatBytes(largestJs.gzipBytes)} gzip).`);
  return entries;
}

function auditHostingHeaders() {
  const file = path.join(root, 'firebase.json');
  if (!fs.existsSync(file)) return;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const headers = config?.hosting?.headers || [];
  const sources = headers.map((item) => item.source);
  if (!sources.includes('/assets/**')) addFailure('Hashed Vite assets do not have a dedicated immutable cache rule.');
  if (!sources.includes('/index.html')) addFailure('index.html does not have a dedicated no-cache rule.');

  const broadImmutable = headers.some((item) => (
    item.source === '**/*.@(js|css|png|jpg|jpeg|svg|webp|woff|woff2|otf|ttf)'
    && item.headers?.some((header) => header.value?.includes('immutable'))
  ));
  if (broadImmutable) addFailure('Unhashed public assets still use a one-year immutable cache rule.');
}

function writeReport(buildEntries) {
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    passed: failures.length === 0,
    failures,
    warnings,
    notes,
    buildEntries,
  };
  fs.writeFileSync(path.join(reportDir, 'quality-gate-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const markdown = [
    '# Black Wolf Studio quality gate',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '## Failures',
    ...(failures.length ? failures.map((item) => `- ${item}`) : ['- None']),
    '',
    '## Warnings',
    ...(warnings.length ? warnings.map((item) => `- ${item}`) : ['- None']),
    '',
    '## Notes',
    ...notes.map((item) => `- ${item}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(reportDir, 'quality-gate-report.md'), markdown);
}

auditRequiredFiles();
auditRoutes();
auditJsx();
auditStyles();
auditNorwesterFont();
auditPublicAssets();
auditHostingHeaders();
const buildEntries = auditBuild();
writeReport(buildEntries);

console.log('\nBlack Wolf Studio quality gate');
notes.forEach((item) => console.log(`  • ${item}`));
warnings.forEach((item) => console.warn(`  WARNING: ${item}`));
failures.forEach((item) => console.error(`  ERROR: ${item}`));
console.log(`\nReport: ${path.relative(root, path.join(reportDir, 'quality-gate-report.md'))}`);

if (failures.length) process.exitCode = 1;
