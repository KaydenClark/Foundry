import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const DECORATIVE_EXEMPTIONS = Object.freeze({
  ".floor-asset": "architectural image with no semantic text",
  ".mirror-bars i": "non-text mirror indicator",
  ".mirror-sheen": "non-text lighting effect",
  ".vertical-route": "non-text route line",
  ".legend-token": "non-text Job Order key",
});

function splitSelectorList(source) {
  const selectors = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (character === "," && parentheses === 0 && brackets === 0) {
      selectors.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  selectors.push(source.slice(start).trim());
  return selectors.filter(Boolean);
}

function parseRules(source) {
  const rules = [];
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");

  function declarations(body) {
    return body.split(";").flatMap((entry) => {
      const colon = entry.indexOf(":");
      if (colon === -1) return [];
      return [{
        property: entry.slice(0, colon).trim().toLowerCase(),
        value: entry.slice(colon + 1).trim(),
      }];
    });
  }

  function walk(block, contexts = []) {
    let cursor = 0;
    while (cursor < block.length) {
      const open = block.indexOf("{", cursor);
      if (open === -1) return;

      const header = block.slice(cursor, open).trim();
      let depth = 1;
      let close = open + 1;
      while (close < block.length && depth > 0) {
        if (block[close] === "{") depth += 1;
        if (block[close] === "}") depth -= 1;
        close += 1;
      }

      const body = block.slice(open + 1, close - 1);
      if (/^@(?:media|supports|layer)\b/.test(header)) {
        walk(body, [...contexts, header]);
      } else if (!header.startsWith("@")) {
        for (const selector of splitSelectorList(header)) {
          rules.push({
            selector: selector.trim(),
            body,
            declarations: declarations(body),
            contexts,
            order: rules.length,
          });
        }
      }
      cursor = close;
    }
  }

  walk(clean);
  return rules;
}

const rules = parseRules(stylesheet);

function tokenValues(candidateRules) {
  return Object.fromEntries(
    candidateRules
      .filter((rule) => rule.selector === ":root")
      .flatMap((rule) => rule.declarations)
      .filter(({ property }) => property.startsWith("--"))
      .map(({ property, value }) => [property, value]),
  );
}

function resolveLength(value, tokens, label) {
  const normalized = value.trim();
  const pixels = normalized.match(/^([+-]?(?:\d+|\d*\.\d+))px$/);
  if (pixels) return Number(pixels[1]);

  const token = normalized.match(/^var\((--[\w-]+)\)$/);
  if (token) {
    const resolved = tokens[token[1]];
    if (resolved === undefined) throw new Error(`Unsupported ${label}: unresolved ${token[1]}`);
    return resolveLength(resolved, tokens, label);
  }

  const clamp = normalized.match(/^clamp\(\s*([+-]?(?:\d+|\d*\.\d+))px\s*,\s*[^,]+,\s*([+-]?(?:\d+|\d*\.\d+))px\s*\)$/);
  if (clamp) return Number(clamp[1]);

  throw new Error(`Unsupported ${label}: ${normalized}`);
}

const rawTokens = tokenValues(rules);
const rootTokens = Object.fromEntries(
  Object.entries(rawTokens).flatMap(([name, value]) => {
    try {
      return [[name, resolveLength(value, rawTokens, `token ${name}`)]];
    } catch {
      return [];
    }
  }),
);

function declarationsFor(selector) {
  return rules.filter((rule) => rule.selector === selector).map((rule) => rule.body);
}

function fontSizes(body, tokens = rawTokens) {
  return body.split(";").flatMap((entry) => {
    const colon = entry.indexOf(":");
    if (colon === -1) return [];
    const property = entry.slice(0, colon).trim().toLowerCase();
    const value = entry.slice(colon + 1).trim();
    if (!["font", "font-size"].includes(property) || value === "inherit") return [];

    if (property === "font-size") return [resolveLength(value, tokens, "font size")];

    const clamp = value.match(/clamp\([^)]*\)/)?.[0];
    if (clamp) return [resolveLength(clamp, tokens, "font size")];

    for (const match of value.matchAll(/var\((--[\w-]+)\)/g)) {
      if (tokens[match[1]] === undefined) continue;
      try {
        return [resolveLength(`var(${match[1]})`, tokens, "font size")];
      } catch {
        // Font-family tokens are not lengths; continue until a size is found.
      }
    }

    const pixels = value.match(/([+-]?(?:\d+|\d*\.\d+))px/);
    if (pixels) return [Number(pixels[1])];

    throw new Error(`Unsupported font size: ${value}`);
  });
}

function selectorCompounds(selector) {
  return selector
    .replace(/::?[\w-]+(?:\([^)]*\))?/g, "")
    .split(/\s*(?:[>+~]|\s)\s*/)
    .filter(Boolean)
    .map((compound) => new Set(compound.match(/[#.]?[A-Za-z_][\w-]*|\*/g) ?? []));
}

function closingParenthesis(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`Unclosed functional pseudo selector: ${source}`);
}

function expandPositiveFunctionalPseudos(selector) {
  const functional = /:(?:is|where)\(/.exec(selector);
  if (!functional) return [selector];

  const openIndex = functional.index + functional[0].length - 1;
  const closeIndex = closingParenthesis(selector, openIndex);
  const prefix = selector.slice(0, functional.index);
  const suffix = selector.slice(closeIndex + 1);
  const argumentsList = splitSelectorList(selector.slice(openIndex + 1, closeIndex));

  return argumentsList.flatMap((argument) =>
    expandPositiveFunctionalPseudos(`${prefix}${argument}${suffix}`),
  );
}

function selectorRefinesTarget(candidate, target) {
  const targetCompounds = selectorCompounds(target);
  return expandPositiveFunctionalPseudos(candidate).some((variant) => {
    const candidateCompounds = selectorCompounds(variant);
    let candidateIndex = 0;

    return targetCompounds.every((targetCompound) => {
      while (candidateIndex < candidateCompounds.length) {
        const candidateCompound = candidateCompounds[candidateIndex];
        candidateIndex += 1;
        if ([...targetCompound].every((token) => candidateCompound.has(token))) return true;
      }
      return false;
    });
  });
}

function assertControlTarget(selector, candidateRules = rules) {
  const tokens = tokenValues(candidateRules);
  const declarations = candidateRules
    .filter((rule) => selectorRefinesTarget(rule.selector, selector))
    .flatMap((rule) => rule.declarations)
    .filter(({ property }) => property === "min-height");

  assert.ok(declarations.length > 0, `${selector} must declare a minimum target height`);
  for (const declaration of declarations) {
    const size = resolveLength(declaration.value, tokens, `${selector} min-height`);
    assert.ok(size >= 44, `${selector} target override renders below 44px: ${size}px`);
  }
}

test("semantic type tokens keep meaningful interface text readable at 100% zoom", () => {
  assert.equal(rootTokens["--type-min"], 12);
  assert.equal(rootTokens["--type-primary"], 14);
  assert.equal(rootTokens["--type-heading"], 16);

  const semanticSelectors = [
    ".safety-lockup span",
    ".section-heading span",
    ".job-order-spec > header span",
    ".journey-card small",
    ".crossing-band",
    ".stack-heading b",
    ".floor-room.is-live-location::after",
    ".vertical-crossing span",
    ".stack-legend",
    ".inspector-grid dt",
    ".trace-panel > header small",
    ".trace-panel li > small",
    ".transport-heading small",
    ".page-heading span",
    ".overview-readout dt",
    ".workflow-summary-band span",
    ".workflow-table small",
    ".plane-ledger > button small",
    ".hall-lineup small",
    ".parts-ledger > header small",
    ".history-ledger article small",
    ".empty-state strong",
  ];

  for (const selector of semanticSelectors) {
    const sizes = declarationsFor(selector).flatMap((body) => fontSizes(body));
    assert.ok(sizes.length > 0, `${selector} must declare a semantic font size`);
    assert.ok(sizes.every((size) => size >= 12), `${selector} renders below 12px: ${sizes.join(", ")}`);
  }

  const undersized = rules.flatMap(({ selector, body }) =>
    fontSizes(body)
      .filter((size) => size < 12)
      .map((size) => `${selector}: ${size}px`),
  );
  assert.deepEqual(undersized, [], `meaningful text cannot render below 12px:\n${undersized.join("\n")}`);
});

test("primary navigation, controls, inspector values, and prose use the primary scale", () => {
  const primarySelectors = [
    ".primary-nav button",
    ".schematic-controls > header button",
    ".schematic-range > span",
    ".schematic-toggle",
    ".floor-label strong",
    ".floor-room strong",
    ".inspector-grid dd",
    ".inspector-focus button",
    ".trace-panel li > p",
    ".transport-button",
    ".speed-control select",
    ".page-heading p",
    ".primary-action",
    ".boundary-callout p",
    ".workflow-table p",
    ".plane-ledger > button p",
    ".hall-lineup p",
    ".parts-ledger p",
    ".empty-state p",
  ];

  for (const selector of primarySelectors) {
    const sizes = declarationsFor(selector).flatMap((body) => fontSizes(body));
    assert.ok(sizes.length > 0, `${selector} must declare a primary font size`);
    assert.ok(sizes.every((size) => size >= 14), `${selector} renders below 14px: ${sizes.join(", ")}`);
  }
});

test("controls keep practical targets without zoom or whole-page transforms", () => {
  assert.equal(rootTokens["--target-min"], 44);

  const targetSelectors = [
    ".primary-nav button",
    ".atlas-rotation-controls button",
    ".schematic-controls > header button",
    ".schematic-range input",
    ".schematic-toggle",
    ".floor-label",
    ".floor-room",
    ".job-token",
    ".vertical-crossing",
    ".inspector-focus button",
    ".transport-button",
    ".speed-control select",
    ".primary-action",
    ".history-ledger article button",
  ];

  for (const selector of targetSelectors) {
    assertControlTarget(selector);
  }

  assert.doesNotMatch(stylesheet, /(^|[;{])\s*zoom\s*:/m);
  for (const selector of ["html", "body", ".app-shell", ".app-header", ".app-main", ".page-fill", ".content-page", ".run-player"]) {
    assert.ok(
      declarationsFor(selector).every((body) => !/(^|;)\s*transform\s*:/.test(body)),
      `${selector} must not scale or transform the page`,
    );
  }
});

test("decorative exemptions stay non-semantic and never hide a font-size escape hatch", () => {
  assert.deepEqual(Object.keys(DECORATIVE_EXEMPTIONS), [
    ".floor-asset",
    ".mirror-bars i",
    ".mirror-sheen",
    ".vertical-route",
    ".legend-token",
  ]);

  for (const selector of Object.keys(DECORATIVE_EXEMPTIONS)) {
    const bodies = declarationsFor(selector);
    assert.ok(bodies.length > 0, `${selector} exemption must match a shipped decorative rule`);
    assert.deepEqual(bodies.flatMap((body) => fontSizes(body)), [], `${selector} cannot exempt semantic text`);
  }
});

test("mobile header copy wraps in place instead of becoming a scrolling strip", () => {
  assert.ok(
    declarationsFor(".app-header").some((body) => /overflow-x\s*:\s*visible/.test(body)),
    "the mobile header must cancel tablet horizontal scrolling",
  );
  assert.ok(
    declarationsFor(".safety-lockup").some((body) => /grid-template-columns\s*:\s*1fr/.test(body)),
    "the mobile safety boundary must wrap in one readable column",
  );
});

test("wide Run Player keeps rail, Factory, and inspector visible together", () => {
  const runPlayer = declarationsFor(".run-player")[0];
  assert.match(runPlayer, /grid-template-columns\s*:\s*minmax\([^;]+\)\s+minmax\([^;]+\)\s+minmax\([^;]+\)/);
  assert.match(declarationsFor(".run-player > .journey-rail")[0], /grid-column\s*:\s*1/);
  assert.match(declarationsFor(".run-player > .factory-stack")[0], /grid-column\s*:\s*2/);
  assert.match(declarationsFor(".run-player > .run-inspector")[0], /grid-column\s*:\s*3/);

  const contentWidth = 1280 - 16;
  const sidePaneWidth = Math.max(260, contentWidth * 0.22);
  const factoryWidth = contentWidth - (sidePaneWidth * 2);
  const fourColumnControlWidth = (4 * 180) + (3 * 16) + (2 * 12);
  const inspectorColumnWidth = (sidePaneWidth - 24) / 2;
  assert.equal(Math.round(factoryWidth), 708);
  assert.equal(fourColumnControlWidth, 792);
  assert.ok(factoryWidth < fourColumnControlWidth, "1280px Factory cannot contain the four-column control grid");
  assert.ok(inspectorColumnWidth < 144, "1280px inspector cannot contain two readable detail columns");

  const constrainedRules = rules.filter((rule) =>
    rule.contexts.some((context) => /min-width:\s*1201px/.test(context) && /max-width:\s*1439px/.test(context)),
  );
  assert.match(
    constrainedRules.find((rule) => rule.selector === ".schematic-control-grid")?.body ?? "",
    /grid-template-columns\s*:\s*repeat\(2\s*,\s*minmax\(0\s*,\s*1fr\)\)/,
  );
  assert.match(
    constrainedRules.find((rule) => rule.selector === ".inspector-grid")?.body ?? "",
    /grid-template-columns\s*:\s*1fr/,
  );
});

test("wide tri-pane inspectors keep values readable inside the narrow side pane", () => {
  assert.match(
    declarationsFor(".inspector-grid")[0],
    /grid-template-columns\s*:\s*1fr/,
  );
  assert.match(
    declarationsFor(".inspector-grid > div")[0],
    /border-right\s*:\s*0/,
  );
});

test("only the explicit Atlas canvas owns horizontal panning", () => {
  assert.ok(declarationsFor(".factory-stack").every((body) => !/overflow-x\s*:\s*auto/.test(body)));
  assert.ok(declarationsFor(".stack-canvas").some((body) => /overflow-x\s*:\s*auto/.test(body)));
  assert.ok(declarationsFor(".stack-world").some((body) => /min-width\s*:\s*1080px/.test(body)));
});

test("font and target mutations fail closed instead of disappearing behind valid declarations", () => {
  const fontMutation = parseRules(`${stylesheet}\n@media (max-width: 520px) { .primary-nav button { font-size: .5rem; } }`).at(-1);
  assert.throws(() => fontSizes(fontMutation.body), /unsupported font size/i);

  const targetMutation = parseRules(`${stylesheet}\n@media (max-width: 520px) { .transport-button { min-height: 1px; } }`);
  assert.throws(
    () => assertControlTarget(".transport-button", targetMutation),
    /target override renders below 44px: 1px/,
  );

  const variantMutation = parseRules(`${stylesheet}\n@media (max-width: 520px) { .transport-button.compact { min-height: 1px; } }`);
  assert.throws(
    () => assertControlTarget(".transport-button", variantMutation),
    /target override renders below 44px: 1px/,
  );
});

test(":where() target refinements cannot hide undersized overrides", () => {
  const mutation = parseRules(`${stylesheet}\n:where(.transport-button).compact { min-height: 1px; }`);
  assert.throws(
    () => assertControlTarget(".transport-button", mutation),
    /target override renders below 44px: 1px/,
  );
});

test(":is() target refinements remain visible through ancestor selectors", () => {
  const mutation = parseRules(`${stylesheet}\n.toolbar :is(.transport-button) { min-height: 1px; }`);
  assert.throws(
    () => assertControlTarget(".transport-button", mutation),
    /target override renders below 44px: 1px/,
  );
});

test("functional pseudo selector lists preserve comma-separated alternatives", () => {
  const mutation = parseRules(`${stylesheet}\n:where(.other, .transport-button).compact { min-height: 1px; }`);
  const addedRules = mutation.slice(rules.length);
  assert.equal(addedRules.length, 1);
  assert.equal(addedRules[0].selector, ":where(.other, .transport-button).compact");
  assert.throws(
    () => assertControlTarget(".transport-button", mutation),
    /target override renders below 44px: 1px/,
  );
});
