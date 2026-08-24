import yaml from "js-yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { transformInternalLink } from "../../util/path";
import {
  matchSelectedTes3CellsToLocations,
  MAX_TES3_PLUGIN_BYTES,
  parseTes3Plugin,
} from "./tes3-plugin-parser";
import type { ParsedTes3Cell } from "./tes3-plugin-parser";

type SubmissionKind = "new-mod" | "edit-mod" | "edit-location";
type Entrance = { sourceIndex?: number; x: string; y: string; region: string };
type ModOption = { slug: string; title: string };
type WikiPageOption = {
  path: string;
  title: string;
  type: "mod" | "location";
  aliases: string[];
};
type ComponentRelation = { type: string; target: string };
type ExteriorEdit = { cell: string; landscape: boolean; references: number };
type NewLocationEntrance = { x: number; y: number; region: string };
type NewLocationDraft = {
  slug: string;
  cell: string;
  region: string;
  x: number;
  y: number;
  additionalEntrances: NewLocationEntrance[];
  description: string;
};
type MapLocationDetail = {
  cell: string;
  x: number;
  y: number;
  region: string;
  entrances: Array<{ x: number; y: number }>;
};
type LocationVariantDraft = {
  cell: string;
  mode: "" | "variant" | "main" | "entrance";
  plugin: string;
  componentId: string;
  x: number;
  y: number;
  region: string;
  additionalEntrances: NewLocationEntrance[];
};
type MapLocationChangeDraft = {
  cell: string;
  mode: "variant" | "main" | "entrance";
  plugin: string;
  componentId: string;
};
type InstallComponent = {
  id: string;
  automaticId: boolean;
  expanded: boolean;
  name: string;
  type: string;
  plugins: string[];
  relations: ComponentRelation[];
  mapLocations: string[];
  mapExteriorEdits: ExteriorEdit[];
  mapPluginMessage: string;
  mapPluginError: boolean;
  notes: string;
};
type ContributionOptions = {
  schemaVersion: number;
  contributors: string[];
  categories: string[];
  events: string[];
  mapLocations: string[];
  mapLocationDetails: MapLocationDetail[];
  modSlugs: string[];
  mods: ModOption[];
  wikiPages: WikiPageOption[];
  componentTypes: string[];
  relationshipTypes: string[];
};
type ContributionState = {
  kind: SubmissionKind;
  startedAt: string;
  website: string;
  contributorName: string;
  rememberContributor: boolean;
  targetPath: string;
  baseSha256: string;
  originalFrontmatter: Record<string, unknown>;
  title: string;
  slug: string;
  authors: string[];
  url: string;
  pictureUrl: string;
  showcaseUrl: string;
  category: string;
  events: string[];
  legacyEvents: string[];
  mapEnabled: boolean;
  mapLocations: string[];
  mapExteriorEdits: ExteriorEdit[];
  mapPluginMessage: string;
  mapPluginError: boolean;
  newLocations: NewLocationDraft[];
  locationVariants: LocationVariantDraft[];
  mapLocationChanges: MapLocationChangeDraft[];
  componentsEnabled: boolean;
  componentsTouched: boolean;
  components: InstallComponent[];
  cell: string;
  region: string;
  x: string;
  y: string;
  uespUrl: string;
  entrances: Entrance[];
  article: string;
  reviewPayload: Record<string, unknown> | null;
};

type NexusModMetadata = {
  name: string;
  author: string;
  description: string;
  pictureUrl: string;
};

type PluginParserState = {
  downloadUrl: string;
  file: File | null;
  fileName: string;
  cells: ParsedTes3Cell[];
  newLocations: NewLocationDraft[];
  locationVariants: LocationVariantDraft[];
  locationChoiceError: string;
  nexus: NexusModMetadata | null;
};

const WORKER_ENDPOINT =
  "https://darkelfmodding-wiki-submissions.melchior-dahrk.workers.dev/submit";
const NEXUS_METADATA_ENDPOINT = WORKER_ENDPOINT.replace(
  /\/submit$/u,
  "/nexus-mod",
);
const TURNSTILE_SITE_KEY = "0x4AAAAAAEGiDP91lRPZHrbI";
const TYPE_LABELS: Record<SubmissionKind, string> = {
  "new-mod": "Add a new mod page",
  "edit-mod": "Edit an existing mod page",
  "edit-location": "Edit an existing map location",
};
const NEW_MOD_ARTICLE_TEMPLATE = `> Extract from mod description
## World Edits
Description of world edits.
## Other Notes
Other notes about the mod.
`;
const encoder = new TextEncoder();
let turnstileLoader: Promise<void> | null = null;
const CONTRIBUTOR_COOKIE = "wiki_contributor_name";
const CONTRIBUTOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const UNSUBMITTED_EDITS_MESSAGE =
  "You have unsubmitted edits. Are you sure you would like to leave the page?";

let trackedContributionState: ContributionState | null = null;
let cleanContributionSnapshot = "";

function contributionSnapshot(state: ContributionState): string {
  const { startedAt, website, reviewPayload, ...draft } = state;
  return JSON.stringify(draft);
}

function trackContributionState(state: ContributionState) {
  trackedContributionState = state;
  cleanContributionSnapshot = contributionSnapshot(state);
}

function clearTrackedContributionState() {
  trackedContributionState = null;
  cleanContributionSnapshot = "";
}

function hasUnsubmittedEdits(): boolean {
  return (
    trackedContributionState !== null &&
    contributionSnapshot(trackedContributionState) !== cleanContributionSnapshot
  );
}

function confirmLeavingContribution(): boolean {
  if (!hasUnsubmittedEdits()) return true;
  if (!window.confirm(UNSUBMITTED_EDITS_MESSAGE)) return false;
  clearTrackedContributionState();
  return true;
}

document.addEventListener("prenav", (event) => {
  if (!confirmLeavingContribution()) event.preventDefault();
});

document.addEventListener(
  "click",
  (event) => {
    if (!hasUnsubmittedEdits() || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download"))
      return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    const url = new URL(link.href, window.location.href);
    if (
      url.origin === window.location.origin &&
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    )
      return;
    if (
      url.origin === window.location.origin &&
      (url.pathname === "/wiki" || url.pathname.startsWith("/wiki/")) &&
      !("routerIgnore" in link.dataset)
    )
      return;
    if (!confirmLeavingContribution()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsubmittedEdits()) return;
  event.preventDefault();
  event.returnValue = UNSUBMITTED_EDITS_MESSAGE;
});

const filenamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const modTargetPattern = /^wiki\/content\/mods\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;
const locationTargetPattern =
  /^wiki\/content\/locations\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;
const isValidWikiFilename = (value: string): boolean =>
  filenamePattern.test(value);
const isSafeEditTargetPath = (value: string): boolean =>
  !value.endsWith("/index.md") &&
  !value.includes("..") &&
  !value.includes("\\") &&
  !value.includes("\0") &&
  (modTargetPattern.test(value) || locationTargetPattern.test(value));
const slugifyWikiFilename = (value: string): string =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

function rememberedContributorName(): string {
  const prefix = `${CONTRIBUTOR_COOKIE}=`;
  const encoded = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!encoded) return "";
  try {
    const value = decodeURIComponent(encoded).trim();
    return value.length >= 2 && value.length <= 100 && !/[<>\r\n]/u.test(value)
      ? value
      : "";
  } catch {
    return "";
  }
}

function forgetContributorName() {
  document.cookie = `${CONTRIBUTOR_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
}

function persistContributorPreference(state: ContributionState) {
  if (!state.rememberContributor) {
    forgetContributorName();
    return;
  }
  document.cookie = `${CONTRIBUTOR_COOKIE}=${encodeURIComponent(state.contributorName.trim())}; Max-Age=${CONTRIBUTOR_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
}

const create = (tag: string, className = "", text = ""): HTMLElement => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

const makeButton = (
  label: string,
  onClick: () => void,
  className = "contribution-button",
): HTMLButtonElement => {
  const button = create("button", className, label) as HTMLButtonElement;
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
};

const intro = (root: HTMLElement): HTMLParagraphElement => {
  const paragraph = root.querySelector<HTMLParagraphElement>(
    ".wiki-contribution-intro",
  );
  if (!paragraph) throw new Error("The contribution introduction is missing.");
  return paragraph.cloneNode(true) as HTMLParagraphElement;
};

const notice = (): HTMLParagraphElement => {
  const paragraph = create("p", "contribution-notice") as HTMLParagraphElement;
  paragraph.textContent =
    "Submitting will open a GitHub pull request. It will be reviewed prior to inclusion on the site.";
  return paragraph;
};

function appendChildren(
  parent: HTMLElement,
  ...children: Array<Node | null | undefined>
) {
  for (const child of children) if (child) parent.append(child);
  return parent;
}

function textInput(
  value: string,
  onInput: (value: string) => void,
  options: {
    required?: boolean;
    maxLength?: number;
    type?: string;
    placeholder?: string;
  } = {},
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = options.type ?? "text";
  input.value = value;
  input.required = options.required ?? false;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function field(
  labelText: string,
  control: HTMLElement,
  helpText = "",
): HTMLElement {
  const wrapper = create("div", "contribution-field");
  const label = document.createElement("label");
  const caption = create("span", "contribution-label", labelText);
  appendChildren(label, caption, control);
  wrapper.append(label);
  if (helpText) wrapper.append(create("p", "contribution-help", helpText));
  return wrapper;
}

function fieldset(title: string): HTMLFieldSetElement {
  const result = create(
    "fieldset",
    "contribution-fieldset",
  ) as HTMLFieldSetElement;
  result.append(create("legend", "", title));
  return result;
}

function contributorEditor(
  state: ContributionState,
  options: ContributionOptions,
): HTMLFieldSetElement {
  const details = fieldset("Contributor");
  const input = textInput(
    state.contributorName,
    (value) => {
      state.contributorName = value;
    },
    {
      required: true,
      maxLength: 100,
      placeholder: "Choose an existing name or enter a new one",
    },
  );
  input.autocomplete = "username";
  input.setAttribute("list", "wiki-contributor-names");
  const names = document.createElement("datalist");
  names.id = "wiki-contributor-names";
  for (const contributor of options.contributors) {
    names.append(new Option(contributor, contributor));
  }
  const control = create("div", "contribution-contributor-control");
  control.append(input, names);
  details.append(
    field(
      "User name",
      control,
      "This public display name will appear in contribution history and on the leaderboard. Names are self-reported, not verified accounts.",
    ),
  );
  const remember = document.createElement("input");
  remember.type = "checkbox";
  remember.checked = state.rememberContributor;
  remember.addEventListener("change", () => {
    state.rememberContributor = remember.checked;
    if (!remember.checked) forgetContributorName();
  });
  const rememberLabel = document.createElement("label");
  rememberLabel.className = "contribution-inline contribution-remember-name";
  rememberLabel.append(
    remember,
    document.createTextNode("Remember user name on this device"),
  );
  details.append(rememberLabel);
  return details;
}

function blankState(kind: SubmissionKind): ContributionState {
  const contributorName = rememberedContributorName();
  return {
    kind,
    startedAt: new Date().toISOString(),
    website: "",
    contributorName,
    rememberContributor: Boolean(contributorName),
    targetPath: "",
    baseSha256: "",
    originalFrontmatter: {},
    title: "",
    slug: "",
    authors: [""],
    url: "",
    pictureUrl: "",
    showcaseUrl: "",
    category: "",
    events: [],
    legacyEvents: [],
    mapEnabled: kind === "new-mod",
    mapLocations: [],
    mapExteriorEdits: [],
    mapPluginMessage: "",
    mapPluginError: false,
    newLocations: [],
    locationVariants: [],
    mapLocationChanges: [],
    componentsEnabled: false,
    componentsTouched: false,
    components: [],
    cell: "",
    region: "",
    x: "",
    y: "",
    uespUrl: "",
    entrances: [],
    article: kind === "new-mod" ? NEW_MOD_ARTICLE_TEMPLATE : "",
    reviewPayload: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} has an unsupported value in the current page.`);
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function mapLocationChangeArray(
  value: unknown,
  label: string,
): MapLocationChangeDraft[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${label} has an unsupported value in the current page.`);
  }
  return value.map((rawChange, index) => {
    if (!isRecord(rawChange)) {
      throw new Error(`${label} entry ${index + 1} is not an object.`);
    }
    const cell = stringValue(rawChange.cell).trim();
    const plugin = stringValue(rawChange.plugin).trim();
    const componentId = stringValue(rawChange.component).trim();
    const mode = stringValue(rawChange.mode);
    if (!cell || !plugin || !["variant", "main", "entrance"].includes(mode)) {
      throw new Error(`${label} entry ${index + 1} is malformed.`);
    }
    return {
      cell,
      plugin,
      componentId,
      mode: mode as MapLocationChangeDraft["mode"],
    };
  });
}

function exteriorEditArray(
  value: unknown,
  legacyValue: unknown,
  label: string,
): ExteriorEdit[] {
  if (value === undefined) {
    return stringArray(legacyValue, `${label} legacy cells`).map((cell) => ({
      cell,
      landscape: true,
      references: 0,
    }));
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} has an unsupported value in the current page.`);
  }
  return value.map((rawEdit, index) => {
    if (!isRecord(rawEdit)) {
      throw new Error(`${label} edit ${index + 1} is not an object.`);
    }
    if (
      typeof rawEdit.cell !== "string" ||
      typeof rawEdit.landscape !== "boolean" ||
      !Number.isSafeInteger(rawEdit.references) ||
      Number(rawEdit.references) < 0
    ) {
      throw new Error(`${label} edit ${index + 1} is malformed.`);
    }
    return {
      cell: rawEdit.cell.trim(),
      landscape: rawEdit.landscape,
      references: Number(rawEdit.references),
    };
  });
}

function installComponents(value: unknown): InstallComponent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new Error(
      "Components have an unsupported value in the current page.",
    );
  return value.map((rawComponent, componentIndex) => {
    if (!isRecord(rawComponent))
      throw new Error(`Component ${componentIndex + 1} is not an object.`);
    const rawRelations = rawComponent.relations ?? [];
    if (!Array.isArray(rawRelations)) {
      throw new Error(
        `Component ${componentIndex + 1} relations are not a list.`,
      );
    }
    const relations = rawRelations.map((rawRelation, relationIndex) => {
      if (!isRecord(rawRelation)) {
        throw new Error(
          `Component ${componentIndex + 1} relation ${relationIndex + 1} is not an object.`,
        );
      }
      return {
        type: stringValue(rawRelation.type),
        target: stringValue(rawRelation.target),
      };
    });
    return {
      id: stringValue(rawComponent.id),
      automaticId: false,
      expanded: false,
      name: stringValue(rawComponent.name),
      type: stringValue(rawComponent.type),
      plugins: stringArray(
        rawComponent.plugins,
        `Component ${componentIndex + 1} plugins`,
      ),
      relations,
      mapLocations: stringArray(
        rawComponent.map_locations,
        `Component ${componentIndex + 1} map locations`,
      ),
      mapExteriorEdits: exteriorEditArray(
        rawComponent.map_exterior_edits,
        rawComponent.map_exterior_cells,
        `Component ${componentIndex + 1} exterior edits`,
      ),
      mapPluginMessage: "",
      mapPluginError: false,
      notes: stringValue(rawComponent.notes),
    };
  });
}

function parseWikiMarkdown(source: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = source.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u,
  );
  if (!match)
    throw new Error(
      "The current page does not contain valid YAML frontmatter delimiters.",
    );
  const parsed = yaml.load(match[1]);
  if (!isRecord(parsed))
    throw new Error("The current page frontmatter is not an object.");
  return { frontmatter: parsed, body: match[2] };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function legacyUespUrl(value: string): string {
  if (!value) return "";
  if (/^https?:\/\//iu.test(value)) return value;
  return `https://en.uesp.net/wiki/Morrowind:${encodeURI(value.replace(/ /gu, "_"))}`;
}

async function loadEditState(
  path: string,
  options: ContributionOptions,
): Promise<ContributionState> {
  if (!isSafeEditTargetPath(path))
    throw new Error(
      "The requested edit target is not a supported wiki article path.",
    );
  const rawUrl = `https://raw.githubusercontent.com/morrowind-modding-showcases/morrowind-modding-showcases.github.io/main/${path}`;
  const response = await fetch(rawUrl, {
    headers: { Accept: "text/plain" },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "The current wiki source could not be loaded from the main branch.",
    );
  const bytes = await response.arrayBuffer();
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The current wiki source is not valid UTF-8.");
  }
  const parsed = parseWikiMarkdown(source);
  const isMod = path.startsWith("wiki/content/mods/");
  const state = blankState(isMod ? "edit-mod" : "edit-location");
  state.targetPath = path;
  state.baseSha256 = await sha256Hex(bytes);
  state.originalFrontmatter = parsed.frontmatter;
  state.article = parsed.body.replace(/^\r?\n/u, "");
  if (isMod) {
    const categories = parsed.frontmatter.categories;
    if (
      !Array.isArray(categories) ||
      categories.length !== 1 ||
      typeof categories[0] !== "string"
    ) {
      throw new Error(
        "The current mod has an invalid category shape and cannot be safely edited with this form.",
      );
    }
    if (!options.categories.includes(categories[0])) {
      throw new Error(
        "The current mod category is no longer in the controlled category list.",
      );
    }
    const currentLocations = stringArray(
      parsed.frontmatter.map_locations,
      "Map locations",
    );
    const currentExteriorEdits = exteriorEditArray(
      parsed.frontmatter.map_exterior_edits,
      parsed.frontmatter.map_exterior_cells,
      "Exterior edits",
    );
    if (
      currentLocations.some(
        (location) => !options.mapLocations.includes(location),
      )
    ) {
      throw new Error(
        "The current mod contains a map location outside the controlled list.",
      );
    }
    const currentEvents = stringArray(parsed.frontmatter.events, "Events");
    if (currentEvents.length > 1) {
      throw new Error(
        "The current mod has more than one event and cannot be safely edited with this form.",
      );
    }
    state.title = stringValue(parsed.frontmatter.title);
    state.authors = stringArray(parsed.frontmatter.authors, "Authors");
    state.url = stringValue(parsed.frontmatter.url);
    state.pictureUrl = stringValue(parsed.frontmatter.picture_url);
    state.showcaseUrl = stringValue(parsed.frontmatter.showcase_url);
    state.category = categories[0];
    state.events = currentEvents;
    state.legacyEvents = currentEvents.filter(
      (event) => !options.events.includes(event),
    );
    state.mapEnabled = parsed.frontmatter.map_enabled === true;
    state.mapLocations = state.mapEnabled ? currentLocations : [];
    state.mapExteriorEdits = state.mapEnabled ? currentExteriorEdits : [];
    state.components = installComponents(parsed.frontmatter.components);
    state.componentsEnabled = state.components.length > 0;
    state.componentsTouched = parsed.frontmatter.components !== undefined;
    state.mapLocationChanges = mapLocationChangeArray(
      parsed.frontmatter.map_location_changes,
      "Map location changes",
    );
  } else {
    const rawEntrances = parsed.frontmatter.additional_entrances ?? [];
    if (
      !Array.isArray(rawEntrances) ||
      rawEntrances.some((entrance) => !isRecord(entrance))
    ) {
      throw new Error(
        "The current location has unsupported additional-entrance metadata.",
      );
    }
    state.cell =
      stringValue(parsed.frontmatter.cell) ||
      stringValue(parsed.frontmatter.title);
    state.region = stringValue(parsed.frontmatter.region);
    state.x = Number.isInteger(parsed.frontmatter.x)
      ? String(parsed.frontmatter.x)
      : "";
    state.y = Number.isInteger(parsed.frontmatter.y)
      ? String(parsed.frontmatter.y)
      : "";
    if (!state.x || !state.y)
      throw new Error(
        "The current location coordinates are not signed whole numbers.",
      );
    state.uespUrl = legacyUespUrl(stringValue(parsed.frontmatter.uesp_wiki));
    state.entrances = rawEntrances.map((entrance, sourceIndex) => {
      if (!Number.isInteger(entrance.x) || !Number.isInteger(entrance.y)) {
        throw new Error(
          "An existing additional entrance has unsupported coordinates.",
        );
      }
      return {
        sourceIndex,
        x: String(entrance.x),
        y: String(entrance.y),
        region: stringValue(entrance.region),
      };
    });
  }
  return state;
}

function serializeWikiMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const content = String(body).replace(/^(?:\r\n|\n)/u, "");
  return `---\n${yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    forceQuotes: true,
    quotingType: '"',
  })}---\n${content}`;
}

function optionalProperty(
  record: Record<string, unknown>,
  key: string,
  value: string,
) {
  if (value.trim()) record[key] = value.trim();
  else delete record[key];
}

function componentsForFrontmatter(
  state: ContributionState,
): Record<string, unknown>[] {
  return state.components.map((component) => ({
    id: component.id.trim(),
    name: component.name.trim(),
    type: component.type,
    plugins: deduplicate(component.plugins),
    relations: component.relations.map((relation) => ({
      type: relation.type,
      target: relation.target,
    })),
    map_locations: deduplicate(component.mapLocations),
    map_exterior_edits: component.mapExteriorEdits.map((edit) => ({
      cell: canonicalExteriorCell(edit.cell) ?? edit.cell,
      landscape: edit.landscape,
      references: edit.references,
    })),
    notes: component.notes.trim(),
  }));
}

function mapLocationChangesForFrontmatter(
  changes: MapLocationChangeDraft[],
): Record<string, unknown>[] {
  return changes.map((change) => {
    const generated: Record<string, unknown> = {
      cell: change.cell.trim(),
      mode: change.mode,
      plugin: change.plugin.trim(),
    };
    if (change.componentId.trim()) {
      generated.component = change.componentId.trim();
    }
    return generated;
  });
}

function generatedMarkdown(state: ContributionState): string {
  let frontmatter: Record<string, unknown>;
  if (state.kind === "new-mod") {
    frontmatter = {
      title: state.title.trim(),
      authors: state.authors,
      url: state.url.trim(),
      categories: [state.category],
      map_enabled: state.mapEnabled,
      map_locations: state.mapLocations,
      map_exterior_edits: state.mapExteriorEdits,
      draft: false,
      events: state.events,
    };
    if (state.pictureUrl.trim())
      frontmatter.picture_url = state.pictureUrl.trim();
    if (state.showcaseUrl.trim())
      frontmatter.showcase_url = state.showcaseUrl.trim();
    if (
      state.componentsTouched &&
      state.componentsEnabled &&
      state.components.length > 0
    ) {
      frontmatter.components = componentsForFrontmatter(state);
    }
    if (state.mapLocationChanges.length > 0) {
      frontmatter.map_location_changes = mapLocationChangesForFrontmatter(
        state.mapLocationChanges,
      );
    }
  } else if (state.kind === "edit-mod") {
    frontmatter = {
      ...state.originalFrontmatter,
      title: state.title.trim(),
      authors: state.authors,
      categories: [state.category],
      events: state.events,
      map_enabled: state.mapEnabled,
      map_locations: state.mapLocations,
      map_exterior_edits: state.mapExteriorEdits,
    };
    delete frontmatter.map_exterior_cells;
    delete frontmatter.description;
    optionalProperty(frontmatter, "url", state.url);
    optionalProperty(frontmatter, "picture_url", state.pictureUrl);
    optionalProperty(frontmatter, "showcase_url", state.showcaseUrl);
    if (state.componentsTouched) {
      if (state.componentsEnabled && state.components.length > 0) {
        frontmatter.components = componentsForFrontmatter(state);
      } else {
        delete frontmatter.components;
      }
    }
    if (state.mapLocationChanges.length > 0) {
      frontmatter.map_location_changes = mapLocationChangesForFrontmatter(
        state.mapLocationChanges,
      );
    } else {
      delete frontmatter.map_location_changes;
    }
  } else {
    frontmatter = {
      ...state.originalFrontmatter,
      title: state.cell.trim(),
      cell: state.cell.trim(),
      x: Number(state.x),
      y: Number(state.y),
    };
    optionalProperty(frontmatter, "region", state.region);
    optionalProperty(frontmatter, "uesp_wiki", state.uespUrl);
    const originals = Array.isArray(
      state.originalFrontmatter.additional_entrances,
    )
      ? state.originalFrontmatter.additional_entrances
      : [];
    const entrances = state.entrances.map((entrance) => {
      const original = isRecord(originals[entrance.sourceIndex ?? -1])
        ? (originals[entrance.sourceIndex ?? -1] as Record<string, unknown>)
        : {};
      const result = {
        ...original,
        x: Number(entrance.x),
        y: Number(entrance.y),
      };
      optionalProperty(result, "region", entrance.region);
      return result;
    });
    if (entrances.length) frontmatter.additional_entrances = entrances;
    else delete frontmatter.additional_entrances;
  }
  return serializeWikiMarkdown(frontmatter, state.article);
}

function downloadTextFile(contents: string, filename: string) {
  const blobUrl = URL.createObjectURL(
    new Blob([contents], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  }
}

function downloadMarkdownFile(state: ContributionState) {
  const markdown = state.reviewPayload?.generatedMarkdown;
  if (typeof markdown !== "string") return;

  const filename = state.targetPath
    ? (state.targetPath.split("/").pop() ?? "wiki-page.md")
    : `${state.slug}.md`;
  downloadTextFile(markdown, filename);
}

function deduplicate(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLocaleLowerCase("en-US");
    if (value && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function normalizedLocationRegion(value: string): string {
  return value.trim().replace(/\s+Region$/iu, "");
}

function mergeNewLocationDrafts(
  ...groups: NewLocationDraft[][]
): NewLocationDraft[] {
  const byCell = new Map<string, NewLocationDraft>();
  for (const draft of groups.flat()) {
    const cell = draft.cell.trim();
    if (!cell) continue;
    const key = cell.toLocaleLowerCase("en-US");
    const current = byCell.get(key);
    const incoming = {
      ...draft,
      slug: slugifyWikiFilename(cell),
      cell,
      region: normalizedLocationRegion(draft.region),
      additionalEntrances: draft.additionalEntrances.map((entrance) => ({
        ...entrance,
        region: normalizedLocationRegion(entrance.region),
      })),
    };
    if (!current) {
      byCell.set(key, incoming);
      continue;
    }
    const coordinates = new Set([
      `${current.x},${current.y}`,
      ...current.additionalEntrances.map(
        (entrance) => `${entrance.x},${entrance.y}`,
      ),
    ]);
    for (const entrance of [
      { x: incoming.x, y: incoming.y, region: incoming.region },
      ...incoming.additionalEntrances,
    ]) {
      const coordinateKey = `${entrance.x},${entrance.y}`;
      if (coordinates.has(coordinateKey)) continue;
      coordinates.add(coordinateKey);
      current.additionalEntrances.push(entrance);
    }
    if (!current.region && incoming.region) current.region = incoming.region;
    if (!current.description.trim() && incoming.description.trim()) {
      current.description = incoming.description;
    }
  }
  return [...byCell.values()];
}

function newLocationDraftForCell(cell: ParsedTes3Cell): NewLocationDraft {
  const [primary, ...additional] = cell.doorMarkers;
  if (!primary)
    throw new Error("A new map location requires an exterior doormarker.");
  return {
    slug: slugifyWikiFilename(cell.name),
    cell: cell.name,
    region: normalizedLocationRegion(primary.region),
    x: primary.x,
    y: primary.y,
    additionalEntrances: additional.map((marker) => ({
      x: marker.x,
      y: marker.y,
      region: normalizedLocationRegion(marker.region),
    })),
    description: "",
  };
}

function locationDraftForCell(
  state: PluginParserState,
  cell: ParsedTes3Cell,
): NewLocationDraft | undefined {
  const key = cell.name.toLocaleLowerCase("en-US");
  return state.newLocations.find(
    (draft) => draft.cell.toLocaleLowerCase("en-US") === key,
  );
}

function locationVariantForCell(
  state: PluginParserState,
  cell: ParsedTes3Cell,
): LocationVariantDraft | undefined {
  const key = cell.name.toLocaleLowerCase("en-US");
  return state.locationVariants.find(
    (variant) => variant.cell.toLocaleLowerCase("en-US") === key,
  );
}

function modAddedLocationDetail(
  cell: ParsedTes3Cell,
  options: ContributionOptions,
): MapLocationDetail | undefined {
  const detail = options.mapLocationDetails.find(
    (candidate) =>
      candidate.cell.toLocaleLowerCase("en-US") ===
      cell.name.toLocaleLowerCase("en-US"),
  );
  const primary = cell.doorMarkers[0];
  if (!detail || !primary) return undefined;
  return detail;
}

function locationVariantDraftForCell(
  cell: ParsedTes3Cell,
  mode: "variant" | "main" | "entrance",
  plugin: string,
): LocationVariantDraft {
  const [primary, ...additional] = cell.doorMarkers;
  if (!primary)
    throw new Error("A location variant requires an exterior doormarker.");
  return {
    cell: cell.name,
    mode,
    plugin,
    componentId: "",
    x: primary.x,
    y: primary.y,
    region: normalizedLocationRegion(primary.region),
    additionalEntrances: additional.map((marker) => ({
      x: marker.x,
      y: marker.y,
      region: normalizedLocationRegion(marker.region),
    })),
  };
}

function mergeLocationVariantDrafts(
  ...groups: LocationVariantDraft[][]
): LocationVariantDraft[] {
  const bySource = new Map<string, LocationVariantDraft>();
  for (const variant of groups.flat()) {
    const key = [variant.cell, variant.componentId, variant.plugin]
      .map((value) => value.trim().toLocaleLowerCase("en-US"))
      .join(":");
    if (variant.cell.trim() && variant.plugin.trim())
      bySource.set(key, variant);
  }
  return [...bySource.values()];
}

function mapLocationChangeForVariant(
  variant: LocationVariantDraft,
): MapLocationChangeDraft | null {
  if (!variant.mode) return null;
  return {
    cell: variant.cell.trim(),
    mode: variant.mode,
    plugin: variant.plugin.trim(),
    componentId: variant.componentId.trim(),
  };
}

function mergeMapLocationChanges(
  ...groups: MapLocationChangeDraft[][]
): MapLocationChangeDraft[] {
  const bySource = new Map<string, MapLocationChangeDraft>();
  for (const change of groups.flat()) {
    const cell = change.cell.trim();
    const plugin = change.plugin.trim();
    const componentId = change.componentId.trim();
    if (!cell || !plugin) continue;
    const key = [cell, componentId, plugin]
      .map((value) => value.toLocaleLowerCase("en-US"))
      .join(":");
    bySource.set(key, { ...change, cell, plugin, componentId });
  }
  return [...bySource.values()];
}

function isSingleLine(value: string): boolean {
  return !/[\r\n\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function wholeNumber(value: string): number | null {
  if (!/^-?\d+$/u.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function exteriorCellCoordinates(
  value: string,
): { x: number; y: number } | null {
  const match = value.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/u);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
}

function canonicalExteriorCell(value: string): string | null {
  const cell = exteriorCellCoordinates(value);
  return cell ? `${cell.x}, ${cell.y}` : null;
}

function mergeExteriorEdits(...groups: ExteriorEdit[][]): ExteriorEdit[] {
  const byCell = new Map<string, ExteriorEdit>();
  for (const edit of groups.flat()) {
    const cell = canonicalExteriorCell(edit.cell) ?? edit.cell.trim();
    const key = cell.toLocaleLowerCase("en-US");
    if (!cell) continue;
    const current = byCell.get(key) ?? {
      cell,
      landscape: false,
      references: 0,
    };
    current.landscape ||= edit.landscape === true;
    current.references = Number.isSafeInteger(edit.references)
      ? current.references + edit.references
      : Number.NaN;
    byCell.set(key, current);
  }
  return [...byCell.values()];
}

function validateState(
  state: ContributionState,
  options: ContributionOptions,
): string[] {
  const errors: string[] = [];
  state.contributorName = state.contributorName.trim();
  if (
    state.contributorName.length < 2 ||
    state.contributorName.length > 100 ||
    !isSingleLine(state.contributorName) ||
    /[<>]/u.test(state.contributorName)
  ) {
    errors.push(
      "Contributor name is required and must be 2 to 100 characters on one line.",
    );
  }
  if (!state.article.trim()) errors.push("Article text is required.");
  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    state.title = state.title.trim();
    state.authors = deduplicate(state.authors);
    state.url = state.url.trim();
    if (!state.title || !isSingleLine(state.title))
      errors.push("Mod title is required on one line.");
    if (state.kind === "new-mod" && state.authors.length === 0)
      errors.push("At least one author is required.");
    if (!/^https?:\/\/[^\s]+$/iu.test(state.url))
      errors.push(
        "Download URL is required and must be a complete HTTP(S) URL.",
      );
    for (const [label, value] of [
      ["Picture URL", state.pictureUrl],
      ["Showcase URL", state.showcaseUrl],
    ] as const) {
      if (value.trim() && !/^https?:\/\/[^\s]+$/iu.test(value.trim()))
        errors.push(`${label} must be a complete HTTP(S) URL.`);
    }
    if (state.kind === "new-mod") {
      state.slug = slugifyWikiFilename(state.title);
      if (!isValidWikiFilename(state.slug))
        errors.push(
          "Page filename may use only lowercase letters, numbers, and single hyphens.",
        );
      if (
        options.modSlugs.some(
          (slug) =>
            slug.toLocaleLowerCase("en-US") ===
            state.slug.toLocaleLowerCase("en-US"),
        )
      ) {
        errors.push("That mod filename already exists.");
      }
    }
    if (!options.categories.includes(state.category))
      errors.push("Choose one controlled category.");
    const allowedEvents = new Set([...options.events, ...state.legacyEvents]);
    if (state.events.some((event) => !allowedEvents.has(event)))
      errors.push("Events must use the controlled list.");
    state.newLocations = mergeNewLocationDrafts(state.newLocations);
    state.locationVariants = mergeLocationVariantDrafts(state.locationVariants);
    state.mapLocationChanges = mergeMapLocationChanges(
      state.mapLocationChanges,
      state.locationVariants
        .map(mapLocationChangeForVariant)
        .filter((change): change is MapLocationChangeDraft => change !== null),
    );
    const allowedMapLocations = new Set([
      ...options.mapLocations.map((location) =>
        location.toLocaleLowerCase("en-US"),
      ),
      ...state.newLocations.map((location) =>
        location.cell.toLocaleLowerCase("en-US"),
      ),
    ]);
    if (
      state.mapLocations.some(
        (location) =>
          !allowedMapLocations.has(location.toLocaleLowerCase("en-US")),
      )
    )
      errors.push("Map locations must use the controlled list.");
    state.mapExteriorEdits = mergeExteriorEdits(state.mapExteriorEdits);
    for (const edit of state.mapExteriorEdits) {
      const cell = exteriorCellCoordinates(edit.cell);
      if (!cell)
        errors.push(
          `Exterior cell "${edit.cell}" must use signed X, Y coordinates.`,
        );
      if (!Number.isSafeInteger(edit.references) || edit.references < 0) {
        errors.push(
          `Exterior cell "${edit.cell}" needs a non-negative reference count.`,
        );
      }
    }
    const hasComponentMapCoverage =
      state.componentsEnabled &&
      state.components.some(
        (component) =>
          component.mapLocations.length > 0 ||
          component.mapExteriorEdits.length > 0,
      );
    if (
      state.mapEnabled &&
      state.mapLocations.length === 0 &&
      state.mapExteriorEdits.length === 0 &&
      !hasComponentMapCoverage
    )
      errors.push(
        "Choose at least one map location or exterior cell when map inclusion is enabled.",
      );
    if (!state.mapEnabled) {
      state.mapLocations = [];
      state.mapExteriorEdits = [];
      state.newLocations = [];
      state.locationVariants = [];
      state.mapLocationChanges = [];
      for (const component of state.components) {
        component.mapLocations = [];
        component.mapExteriorEdits = [];
      }
    }
    if (state.componentsEnabled) {
      if (state.components.length === 0)
        errors.push("Add at least one component or choose No.");
      const componentIds = new Set<string>();
      for (const [index, component] of state.components.entries()) {
        component.name = component.name.trim();
        component.id = component.id.trim();
        component.plugins = deduplicate(component.plugins);
        component.mapLocations = deduplicate(component.mapLocations);
        component.mapExteriorEdits = mergeExteriorEdits(
          component.mapExteriorEdits,
        );
        const label = `Component ${index + 1}`;
        if (!component.name || !isSingleLine(component.name))
          errors.push(`${label} needs a name.`);
        if (!isValidWikiFilename(component.id)) {
          errors.push(
            `${label} ID must use lowercase letters, numbers, and single hyphens.`,
          );
        } else if (componentIds.has(component.id.toLocaleLowerCase("en-US"))) {
          errors.push(`${label} uses a duplicate component ID.`);
        }
        componentIds.add(component.id.toLocaleLowerCase("en-US"));
        if (!options.componentTypes.includes(component.type))
          errors.push(`${label} needs a valid type.`);
        if (component.plugins.some((plugin) => !isSingleLine(plugin))) {
          errors.push(`${label} plugin filenames must each use one line.`);
        }
        if (
          component.mapLocations.some(
            (location) =>
              !allowedMapLocations.has(location.toLocaleLowerCase("en-US")),
          )
        ) {
          errors.push(`${label} map locations must use the controlled list.`);
        }
        for (const edit of component.mapExteriorEdits) {
          const cell = exteriorCellCoordinates(edit.cell);
          if (!cell) {
            errors.push(
              `${label} exterior cell "${edit.cell}" must use signed X, Y coordinates.`,
            );
          }
          if (!Number.isSafeInteger(edit.references) || edit.references < 0) {
            errors.push(
              `${label} exterior cell "${edit.cell}" needs a non-negative reference count.`,
            );
          }
        }
        const relationIds = new Set<string>();
        for (const [relationIndex, relation] of component.relations.entries()) {
          const relationLabel = `${label} relationship ${relationIndex + 1}`;
          if (!options.relationshipTypes.includes(relation.type)) {
            errors.push(`${relationLabel} needs a valid relationship type.`);
          }
          if (!options.mods.some((mod) => mod.slug === relation.target)) {
            errors.push(`${relationLabel} needs an existing related mod.`);
          }
          const relationId =
            `${relation.type}:${relation.target}`.toLocaleLowerCase("en-US");
          if (relationIds.has(relationId))
            errors.push(`${relationLabel} is duplicated.`);
          relationIds.add(relationId);
        }
        if (component.notes.length > 5_000)
          errors.push(`${label} notes are too long.`);
      }
    } else if (state.componentsTouched) {
      state.components = [];
    }
    const coveredLocations = new Set(
      [
        ...state.mapLocations,
        ...state.components.flatMap((component) => component.mapLocations),
      ].map((location) => location.toLocaleLowerCase("en-US")),
    );
    const newLocationCells = new Set<string>();
    for (const [index, location] of state.newLocations.entries()) {
      location.cell = location.cell.trim();
      const label = location.cell
        ? `New location "${location.cell}"`
        : `New location ${index + 1}`;
      location.region = normalizedLocationRegion(location.region);
      location.description = location.description.trim();
      location.slug = slugifyWikiFilename(location.cell);
      const key = location.cell.toLocaleLowerCase("en-US");
      if (!location.cell || !isSingleLine(location.cell))
        errors.push(`${label} needs a one-line cell name.`);
      if (!isValidWikiFilename(location.slug))
        errors.push(`${label} could not generate a safe filename.`);
      if (newLocationCells.has(key))
        errors.push(`${label} duplicates another new location.`);
      newLocationCells.add(key);
      if (location.region && !isSingleLine(location.region))
        errors.push(`${label} exterior-cell region must be one line when provided.`);
      if (
        !Number.isSafeInteger(location.x) ||
        !Number.isSafeInteger(location.y)
      )
        errors.push(`${label} has invalid doormarker coordinates.`);
      if (!location.description)
        errors.push(
          `${label} needs a description in the New map locations section.`,
        );
      if (location.description.length > 20_000)
        errors.push(`${label} description is too long.`);
      const entranceCoordinates = new Set([`${location.x},${location.y}`]);
      for (const entrance of location.additionalEntrances) {
        if (
          !Number.isSafeInteger(entrance.x) ||
          !Number.isSafeInteger(entrance.y)
        ) {
          errors.push(
            `${label} has invalid additional doormarker coordinates.`,
          );
        }
        const coordinateKey = `${entrance.x},${entrance.y}`;
        if (entranceCoordinates.has(coordinateKey))
          errors.push(`${label} contains duplicate doormarker coordinates.`);
        entranceCoordinates.add(coordinateKey);
      }
      if (!coveredLocations.has(key))
        errors.push(
          `${label} must be included in the main or component map coverage.`,
        );
    }
    const mainVariantCells = new Set<string>();
    for (const [index, variant] of state.locationVariants.entries()) {
      const label = `Location choice ${index + 1}`;
      if (!variant.mode)
        errors.push(
          `${label} needs a variant, main-location, or entrance choice.`,
        );
      const cellKey = variant.cell.toLocaleLowerCase("en-US");
      if (variant.mode === "main") {
        if (mainVariantCells.has(cellKey)) {
          errors.push(
            `Only one main location may be selected for ${variant.cell}.`,
          );
        }
        mainVariantCells.add(cellKey);
      }
      if (!variant.plugin.trim() || !isSingleLine(variant.plugin)) {
        errors.push(`${label} needs a one-line plugin filename.`);
      }
      if (!coveredLocations.has(cellKey)) {
        errors.push(`${label} must be included in map coverage.`);
      }
      if (variant.componentId) {
        const component = state.components.find(
          (candidate) => candidate.id === variant.componentId,
        );
        if (!component) errors.push(`${label} references a removed component.`);
        else {
          if (
            !component.mapLocations.some(
              (location) => location.toLocaleLowerCase("en-US") === cellKey,
            )
          ) {
            errors.push(`${label} must be covered by its component.`);
          }
          if (!component.plugins.includes(variant.plugin)) {
            errors.push(`${label} must use a plugin listed on its component.`);
          }
        }
      } else if (
        !state.mapLocations.some(
          (location) => location.toLocaleLowerCase("en-US") === cellKey,
        )
      ) {
        errors.push(`${label} must be included in the main mod map coverage.`);
      }
    }
    const retainedMainCells = new Set<string>();
    for (const [index, change] of state.mapLocationChanges.entries()) {
      const label = `Retained location change ${index + 1}`;
      const cellKey = change.cell.toLocaleLowerCase("en-US");
      if (change.mode === "main") {
        if (retainedMainCells.has(cellKey)) {
          errors.push(
            `Only one main location may be retained for ${change.cell}.`,
          );
        }
        retainedMainCells.add(cellKey);
      }
      if (!coveredLocations.has(cellKey)) {
        errors.push(`${label} must be included in map coverage.`);
      }
      if (change.componentId) {
        const component = state.components.find(
          (candidate) => candidate.id === change.componentId,
        );
        if (!component) errors.push(`${label} references a removed component.`);
        else {
          if (
            !component.mapLocations.some(
              (location) => location.toLocaleLowerCase("en-US") === cellKey,
            )
          ) {
            errors.push(`${label} must be covered by its component.`);
          }
          if (!component.plugins.includes(change.plugin)) {
            errors.push(`${label} must use a plugin listed on its component.`);
          }
        }
      } else if (
        !state.mapLocations.some(
          (location) => location.toLocaleLowerCase("en-US") === cellKey,
        )
      ) {
        errors.push(`${label} must be included in the main mod map coverage.`);
      }
    }
  } else {
    state.cell = state.cell.trim();
    if (!state.cell || !isSingleLine(state.cell))
      errors.push("Cell name is required on one line.");
    if (wholeNumber(state.x) === null || wholeNumber(state.y) === null) {
      errors.push("X and Y coordinates must be signed whole numbers.");
    }
    if (
      state.uespUrl.trim() &&
      !/^https?:\/\/[^\s]+$/iu.test(state.uespUrl.trim())
    ) {
      errors.push("UESP URL must be a complete HTTP(S) URL.");
    }
    for (const [index, entrance] of state.entrances.entries()) {
      if (
        wholeNumber(entrance.x) === null ||
        wholeNumber(entrance.y) === null
      ) {
        errors.push(
          `Additional entrance ${index + 1} requires signed whole-number X and Y coordinates.`,
        );
      }
    }
  }
  try {
    if (encoder.encode(generatedMarkdown(state)).byteLength > 100 * 1024) {
      errors.push("Generated Markdown must be at most 100 KiB.");
    }
  } catch {
    errors.push("The proposed Markdown could not be generated.");
  }
  return errors;
}

function changesFor(state: ContributionState): Record<string, unknown> {
  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    const changes: Record<string, unknown> = {
      title: state.title,
      authors: state.authors,
      url: state.url,
      picture_url: state.pictureUrl.trim(),
      showcase_url: state.showcaseUrl.trim(),
      categories: [state.category],
      events: state.events,
      map_enabled: state.mapEnabled,
      map_locations: state.mapEnabled ? state.mapLocations : [],
      map_exterior_edits: state.mapEnabled ? state.mapExteriorEdits : [],
      map_location_changes: state.mapEnabled
        ? mapLocationChangesForFrontmatter(state.mapLocationChanges)
        : [],
      new_locations: (state.mapEnabled ? state.newLocations : []).map(
        (location) => ({
          slug: location.slug,
          cell: location.cell,
          region: location.region,
          x: location.x,
          y: location.y,
          additional_entrances: location.additionalEntrances.map(
            (entrance) => ({
              x: entrance.x,
              y: entrance.y,
              region: entrance.region,
            }),
          ),
          description: location.description,
        }),
      ),
      location_variants: (state.mapEnabled ? state.locationVariants : []).map(
        (variant) => ({
          cell: variant.cell,
          mode: variant.mode,
          plugin: variant.plugin,
          component_id: variant.componentId,
          x: variant.x,
          y: variant.y,
          region: variant.region,
          additional_entrances: variant.additionalEntrances.map((entrance) => ({
            x: entrance.x,
            y: entrance.y,
            region: entrance.region,
          })),
        }),
      ),
    };
    if (state.kind === "new-mod") changes.slug = state.slug;
    if (
      state.componentsTouched &&
      (state.kind === "edit-mod" || state.componentsEnabled)
    ) {
      changes.components = state.componentsEnabled
        ? componentsForFrontmatter(state)
        : [];
    }
    return changes;
  }
  return {
    cell: state.cell,
    region: state.region.trim(),
    x: Number(state.x),
    y: Number(state.y),
    uesp_wiki: state.uespUrl.trim(),
    additional_entrances: state.entrances.map((entrance) => {
      const result: Record<string, unknown> = {
        x: Number(entrance.x),
        y: Number(entrance.y),
        region: entrance.region.trim(),
      };
      if (state.kind === "edit-location")
        result.sourceIndex = entrance.sourceIndex;
      return result;
    }),
  };
}

function buildPayload(state: ContributionState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    schemaVersion: 4,
    submissionId: crypto.randomUUID(),
    kind: state.kind,
    contributorName: state.contributorName,
    notes: "",
    createdAt: new Date().toISOString(),
    changes: changesFor(state),
    generatedMarkdown: generatedMarkdown(state),
  };
  if (state.kind === "edit-mod" || state.kind === "edit-location") {
    payload.target = { path: state.targetPath, baseSha256: state.baseSha256 };
  }
  return payload;
}

function safeUrl(value: unknown, image = false): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, window.location.origin);
    if (image && !/^https?:$/u.test(url.protocol)) return null;
    if (!image && !["http:", "https:", "mailto:"].includes(url.protocol))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

const wikiPageIdentity = (value: string): string =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "");

function resolveWikiPage(
  target: string,
  pages: WikiPageOption[],
): { page: WikiPageOption; anchor: string } | null {
  const anchorIndex = target.indexOf("#");
  const anchor = anchorIndex >= 0 ? target.slice(anchorIndex) : "";
  const file = (anchorIndex >= 0 ? target.slice(0, anchorIndex) : target)
    .trim()
    .replace(/^\.?\//u, "")
    .replace(/^wiki\//u, "")
    .replace(/\.md$/iu, "");
  const normalizedPath = file.toLocaleLowerCase("en-US");
  const explicit = pages.find(
    (page) => page.path.toLocaleLowerCase("en-US") === normalizedPath,
  );
  if (explicit) return { page: explicit, anchor };

  const identity = wikiPageIdentity(file);
  const matches = pages.filter((page) =>
    [page.title, ...page.aliases].some(
      (label) => wikiPageIdentity(label) === identity,
    ),
  );
  return matches.length === 1 ? { page: matches[0], anchor } : null;
}

function wikiPageHref(page: WikiPageOption, anchor = ""): string {
  const transformed = transformInternalLink(`${page.path}${anchor}`);
  return `/wiki/${transformed.replace(/^\.\//u, "")}`;
}

function renderObsidianLinks(
  value: string,
  pages: WikiPageOption[],
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const obsidianLinkPattern =
    /\[\[([^\[\]\|#\\]+)?(#+[^\[\]\|#\\]+)?(?:\\?\|([^\[\]#]*))?\]\]/gu;
  let cursor = 0;

  for (const match of value.matchAll(obsidianLinkPattern)) {
    const index = match.index ?? 0;
    if (index > 0 && value[index - 1] === "!") continue;

    fragment.append(document.createTextNode(value.slice(cursor, index)));
    const [source, rawFile = "", rawAnchor = "", rawAlias] = match;
    const file = rawFile.trim();
    const anchor = rawAnchor.trim();
    const target = `${file}${anchor}`;
    if (!target) {
      fragment.append(document.createTextNode(source));
      cursor = index + source.length;
      continue;
    }

    const link = document.createElement("a");
    const externalUrl = /^https?:\/\//iu.test(file) ? safeUrl(target) : null;
    if (externalUrl) {
      link.href = externalUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.classList.add("internal");
      const resolved = resolveWikiPage(target, pages);
      if (resolved) {
        link.href = wikiPageHref(resolved.page, resolved.anchor);
        link.dataset.wikiTarget = `${resolved.page.path}${resolved.anchor}`;
      } else {
        link.setAttribute("href", transformInternalLink(target));
      }
    }
    const fallbackLabel = anchor
      ? anchor.replace(/^#+/u, "")
      : (file.split(/[\\/]/u).at(-1) ?? file).replace(/\.md$/iu, "");
    link.textContent = rawAlias === undefined ? fallbackLabel : rawAlias.trim();
    fragment.append(link);
    cursor = index + source.length;
  }

  fragment.append(document.createTextNode(value.slice(cursor)));
  return fragment;
}

function renderMarkdown(
  markdown: string,
  container: HTMLElement,
  pages: WikiPageOption[] = [],
) {
  container.replaceChildren();
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as any;
  const definitions = new Map<string, any>();
  for (const child of tree.children ?? [])
    if (child.type === "definition") definitions.set(child.identifier, child);
  const renderNode = (node: any, allowObsidianLinks = true): Node | null => {
    if (node.type === "text")
      return allowObsidianLinks
        ? renderObsidianLinks(node.value ?? "", pages)
        : document.createTextNode(node.value ?? "");
    if (node.type === "html") return document.createTextNode(node.value ?? "");
    if (node.type === "break") return document.createElement("br");
    if (node.type === "thematicBreak") return document.createElement("hr");
    if (node.type === "inlineCode") return create("code", "", node.value ?? "");
    if (node.type === "code") {
      const pre = document.createElement("pre");
      pre.append(create("code", "", node.value ?? ""));
      return pre;
    }
    if (node.type === "image" || node.type === "imageReference") {
      const source =
        node.type === "imageReference"
          ? definitions.get(node.identifier)?.url
          : node.url;
      const url = safeUrl(source, true);
      if (!url) return document.createTextNode(node.alt ?? "");
      const image = document.createElement("img");
      image.src = url;
      image.alt = node.alt ?? "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      return image;
    }
    const tag =
      node.type === "root"
        ? "div"
        : node.type === "paragraph"
          ? "p"
          : node.type === "heading"
            ? `h${Math.min(6, Math.max(1, node.depth ?? 2))}`
            : node.type === "strong"
              ? "strong"
              : node.type === "emphasis"
                ? "em"
                : node.type === "delete"
                  ? "del"
                  : node.type === "blockquote"
                    ? "blockquote"
                    : node.type === "list"
                      ? node.ordered
                        ? "ol"
                        : "ul"
                      : node.type === "listItem"
                        ? "li"
                        : node.type === "table"
                          ? "table"
                          : node.type === "tableRow"
                            ? "tr"
                            : node.type === "tableCell"
                              ? "td"
                              : node.type === "link" ||
                                  node.type === "linkReference"
                                ? "a"
                                : "span";
    const element = document.createElement(tag);
    if (tag === "a") {
      const target =
        node.type === "linkReference"
          ? definitions.get(node.identifier)?.url
          : node.url;
      const resolved =
        typeof target === "string" ? resolveWikiPage(target, pages) : null;
      if (resolved) {
        (element as HTMLAnchorElement).href = wikiPageHref(
          resolved.page,
          resolved.anchor,
        );
        element.dataset.wikiTarget = `${resolved.page.path}${resolved.anchor}`;
      } else {
        const url = safeUrl(target);
        if (!url)
          return document.createTextNode(
            (node.children ?? [])
              .map((child: any) => child.value ?? "")
              .join(""),
          );
        (element as HTMLAnchorElement).href = url;
        element.classList.add("external");
        if (new URL(url).origin !== window.location.origin) {
          (element as HTMLAnchorElement).target = "_blank";
          (element as HTMLAnchorElement).rel = "noopener noreferrer";
        }
      }
    }
    for (const child of node.children ?? []) {
      const rendered = renderNode(child, allowObsidianLinks && tag !== "a");
      if (rendered) element.append(rendered);
    }
    return element;
  };
  const rendered = renderNode(tree);
  if (rendered) container.append(...Array.from(rendered.childNodes));
}

function authorEditor(
  state: ContributionState,
  rerender: () => void,
): HTMLElement {
  const wrapper = create("div", "contribution-field");
  wrapper.append(create("span", "contribution-label", "Authors"));
  state.authors.forEach((author, index) => {
    const row = create("div", "contribution-repeat-row");
    const input = textInput(
      author,
      (value) => {
        state.authors[index] = value;
      },
      { maxLength: 200 },
    );
    input.setAttribute("aria-label", `Author ${index + 1}`);
    row.append(input);
    if (state.authors.length > 1) {
      row.append(
        makeButton("Remove", () => {
          state.authors.splice(index, 1);
          rerender();
        }),
      );
    }
    wrapper.append(row);
  });
  wrapper.append(
    makeButton("Add another author", () => {
      state.authors.push("");
      rerender();
    }),
  );
  return wrapper;
}

function modTargetSelect(
  relation: ComponentRelation,
  options: ContributionOptions,
): HTMLElement {
  const wrapper = create("div", "contribution-reference-search");
  const search = textInput("", () => {}, {
    type: "search",
    placeholder: "Search wiki mods",
  });
  search.className = "contribution-search";
  search.setAttribute("aria-label", "Search wiki mods");
  const select = document.createElement("select");
  select.required = true;
  select.setAttribute("aria-label", "Related mod");
  const results = create("div", "contribution-reference-results");
  results.hidden = true;
  const status = create("p", "contribution-help");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  let searchMatches: ModOption[] = [];
  const chooseMod = (mod: ModOption) => {
    relation.target = mod.slug;
    search.value = "";
    renderOptions();
  };
  const renderOptions = () => {
    const query = search.value.trim().toLocaleLowerCase("en-US");
    searchMatches = options.mods.filter(
      (mod) =>
        !query ||
        mod.title.toLocaleLowerCase("en-US").includes(query) ||
        mod.slug.toLocaleLowerCase("en-US").includes(query),
    );
    const displayedMods = new Map(
      options.mods
        .filter(
          (mod) => mod.slug === relation.target || searchMatches.includes(mod),
        )
        .map((mod) => [mod.slug, mod]),
    );
    const placeholder =
      query && searchMatches.length === 0
        ? "No matching wiki mods"
        : "Choose a related mod";
    select.replaceChildren(new Option(placeholder, ""));
    for (const mod of displayedMods.values()) {
      select.append(new Option(mod.title, mod.slug));
    }
    select.value = relation.target;
    results.replaceChildren();
    results.hidden = !query;
    if (query) {
      for (const mod of searchMatches) {
        const result = makeButton(
          mod.title,
          () => chooseMod(mod),
          "contribution-reference-option",
        );
        result.setAttribute("aria-label", `Choose ${mod.title}`);
        results.append(result);
      }
    }
    status.textContent = query
      ? searchMatches.length === 0
        ? "No wiki mods match that search."
        : `${searchMatches.length} matching wiki mod${searchMatches.length === 1 ? "" : "s"}.`
      : "";
  };
  search.addEventListener("input", renderOptions);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && search.value.trim()) {
      event.preventDefault();
      if (searchMatches.length === 1) chooseMod(searchMatches[0]);
    }
  });
  select.addEventListener("change", () => {
    relation.target = select.value;
    search.value = "";
    renderOptions();
  });
  renderOptions();
  appendChildren(wrapper, search, results, select, status);
  return wrapper;
}

function componentMapLocationSelect(
  component: InstallComponent,
  options: ContributionOptions,
  ...trailingControls: HTMLElement[]
): HTMLElement {
  const wrapper = create("div");
  const search = textInput("", () => {}, {
    placeholder: "Search map locations",
  });
  search.className = "contribution-search";
  const choices = create("div", "contribution-multiselect");
  const renderChoices = () => {
    const query = search.value.trim().toLocaleLowerCase("en-US");
    const matches = query
      ? options.mapLocations.filter((location) =>
          location.toLocaleLowerCase("en-US").includes(query),
        )
      : [];
    const displayed = new Set([...component.mapLocations, ...matches]);
    choices.replaceChildren();
    choices.hidden = displayed.size === 0 && !query;
    for (const location of options.mapLocations) {
      if (!displayed.has(location)) continue;
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = component.mapLocations.includes(location);
      input.addEventListener("change", () => {
        component.mapLocations = input.checked
          ? [...component.mapLocations, location]
          : component.mapLocations.filter((value) => value !== location);
        renderChoices();
      });
      appendChildren(label, input, document.createTextNode(location));
      choices.append(label);
    }
    if (query && matches.length === 0) {
      choices.append(
        create(
          "p",
          "contribution-help",
          "No controlled locations match that search.",
        ),
      );
    }
  };
  search.addEventListener("input", renderChoices);
  renderChoices();
  const searchRow = create("div", "contribution-map-search");
  appendChildren(searchRow, search, ...trailingControls);
  appendChildren(wrapper, searchRow, choices);
  return wrapper;
}

function blankComponent(): InstallComponent {
  return {
    id: "",
    automaticId: true,
    expanded: true,
    name: "",
    type: "variant",
    plugins: [""],
    relations: [],
    mapLocations: [],
    mapExteriorEdits: [],
    mapPluginMessage: "",
    mapPluginError: false,
    notes: "",
  };
}

function automaticComponentId(
  component: InstallComponent,
  components: InstallComponent[],
): string {
  const base = slugifyWikiFilename(component.name);
  if (!base) return "";
  const used = new Set(
    components
      .filter((candidate) => candidate !== component && candidate.id)
      .map((candidate) => candidate.id.toLocaleLowerCase("en-US")),
  );
  let result = base;
  let suffix = 2;
  while (used.has(result.toLocaleLowerCase("en-US"))) {
    result = `${base}-${suffix}`;
    suffix += 1;
  }
  return result;
}

function componentLandscapeEditor(
  root: HTMLElement,
  state: ContributionState,
  component: InstallComponent,
  options: ContributionOptions,
  rerender: () => void,
): HTMLElement {
  const wrapper = create("div", "contribution-component-landscape");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".esp,.esm";
  file.hidden = true;
  const upload = makeButton("Upload component plugin", () => {
    file.value = "";
    file.click();
  });
  wrapper.append(componentMapLocationSelect(component, options, upload, file));

  if (component.mapPluginMessage) {
    const status = create(
      "p",
      component.mapPluginError ? "contribution-error" : "contribution-notice",
      component.mapPluginMessage,
    );
    status.setAttribute(
      component.mapPluginError ? "role" : "aria-live",
      component.mapPluginError ? "alert" : "polite",
    );
    wrapper.append(status);
  } else {
    wrapper.append(
      create(
        "p",
        "contribution-help",
        `Upload an ESP or ESM up to ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB to prepopulate this component's named locations and exterior cells. The file is parsed locally and is never uploaded.`,
      ),
    );
  }
  wrapper.append(mapExteriorCellEditor(component, rerender));

  file.addEventListener("change", async () => {
    const plugin = file.files?.[0];
    if (!plugin) return;
    if (!/\.(?:esp|esm)$/iu.test(plugin.name)) {
      component.mapPluginMessage =
        "Choose a component plugin file ending in .esp or .esm.";
      component.mapPluginError = true;
      rerender();
      return;
    }
    if (plugin.size > MAX_TES3_PLUGIN_BYTES) {
      component.mapPluginMessage = `The component plugin file must be no larger than ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB.`;
      component.mapPluginError = true;
      rerender();
      return;
    }

    upload.disabled = true;
    upload.textContent = "Parsing...";
    component.mapPluginMessage = "";
    component.mapPluginError = false;
    try {
      const parserState = blankPluginParserState(state.newLocations);
      parserState.file = plugin;
      parserState.fileName = plugin.name;
      parserState.cells = parseTes3Plugin(await plugin.arrayBuffer());
      hydrateParserNewLocations(parserState);
      hydrateParserLocationChoices(
        parserState,
        options,
        state.mapLocationChanges,
        component.id,
      );
      renderPluginCells(root, options, parserState, {
        backLabel: "Back to component",
        onBack: () => renderForm(root, state, options),
        continueLabel: "Use selected cells for component",
        onContinue: () => {
          const selectedCount = selectedParserCells(parserState).length;
          const transfer = parserLocationTransfer(parserState, options);
          component.plugins = deduplicate([
            ...component.plugins.filter((value) => value.trim()),
            plugin.name,
          ]);
          const previousLocationCount = component.mapLocations.length;
          const previousExteriorCount = component.mapExteriorEdits.length;
          component.mapLocations = deduplicate([
            ...component.mapLocations,
            ...transfer.matched,
          ]);
          component.mapExteriorEdits = mergeExteriorEdits(
            component.mapExteriorEdits,
            transfer.exteriorEdits,
          );
          state.newLocations = mergeNewLocationDrafts(
            state.newLocations,
            parserState.newLocations,
          );
          state.locationVariants = mergeLocationVariantDrafts(
            state.locationVariants,
            parserState.locationVariants
              .filter((variant) =>
                parserState.cells.some(
                  (cell) =>
                    cell.selected &&
                    cell.name.toLocaleLowerCase("en-US") ===
                      variant.cell.toLocaleLowerCase("en-US"),
                ),
              )
              .map((variant) => ({
                ...variant,
                componentId: component.id,
              })),
          );
          const addedLocationCount =
            component.mapLocations.length - previousLocationCount;
          const addedExteriorCount =
            component.mapExteriorEdits.length - previousExteriorCount;
          const unmatchedMessage = transfer.unmatched.length
            ? ` ${transfer.unmatched.length} selected cell${transfer.unmatched.length === 1 ? " does" : "s do"} not yet have a matching wiki map location.`
            : "";
          component.mapPluginMessage = `${plugin.name}: added ${addedLocationCount} map location${addedLocationCount === 1 ? "" : "s"} and ${addedExteriorCount} exterior cell${addedExteriorCount === 1 ? "" : "s"} from ${selectedCount} selected cell${selectedCount === 1 ? "" : "s"}.${unmatchedMessage}`;
          component.mapPluginError = false;
          renderForm(root, state, options);
        },
      });
    } catch (error) {
      component.mapPluginMessage =
        error instanceof Error ? error.message : String(error);
      component.mapPluginError = true;
      rerender();
    }
  });

  return wrapper;
}

function componentEditor(
  root: HTMLElement,
  state: ContributionState,
  options: ContributionOptions,
  rerender: () => void,
): HTMLElement {
  const wrapper = create("div", "contribution-components");
  state.components.forEach((component, index) => {
    if (component.automaticId) {
      component.id = automaticComponentId(component, state.components);
    }
    const details = create(
      "details",
      "contribution-component",
    ) as HTMLDetailsElement;
    details.open = component.expanded;
    details.addEventListener("toggle", () => {
      component.expanded = details.open;
    });
    const summary = create(
      "summary",
      "contribution-component-summary",
      component.name.trim() || `Component ${index + 1}`,
    );
    const body = create("div", "contribution-component-body");
    details.append(summary, body);
    const name = textInput(
      component.name,
      (value) => {
        component.name = value;
        summary.textContent = value.trim() || `Component ${index + 1}`;
        if (component.automaticId) {
          const previousId = component.id;
          component.id = automaticComponentId(component, state.components);
          for (const variant of state.locationVariants) {
            if (variant.componentId === previousId) {
              variant.componentId = component.id;
            }
          }
          for (const change of state.mapLocationChanges) {
            if (change.componentId === previousId) {
              change.componentId = component.id;
            }
          }
          id.value = component.id;
        }
      },
      { required: true, maxLength: 200 },
    );
    const id = textInput(
      component.id,
      (value) => {
        const previousId = component.id;
        component.id = value;
        for (const variant of state.locationVariants) {
          if (variant.componentId === previousId) variant.componentId = value;
        }
        for (const change of state.mapLocationChanges) {
          if (change.componentId === previousId) change.componentId = value;
        }
      },
      { required: true, maxLength: 120 },
    );
    id.readOnly = component.automaticId;
    const type = document.createElement("select");
    type.required = true;
    for (const value of options.componentTypes) {
      type.append(new Option(value, value, false, value === component.type));
    }
    type.value = component.type;
    type.addEventListener("change", () => {
      component.type = type.value;
      rerender();
    });
    body.append(
      field("Name", name),
      field(
        "ID",
        id,
        component.automaticId
          ? "Generated automatically from the component name."
          : "Stable within this page. Use lowercase letters, numbers, and single hyphens.",
      ),
      field("Type", type),
    );

    const plugins = create("div", "contribution-field");
    plugins.append(create("span", "contribution-label", "Plugin filenames"));
    component.plugins.forEach((plugin, pluginIndex) => {
      const row = create("div", "contribution-repeat-row");
      row.append(
        textInput(
          plugin,
          (value) => {
            const previousPlugin = component.plugins[pluginIndex];
            component.plugins[pluginIndex] = value;
            for (const variant of state.locationVariants) {
              if (
                variant.componentId === component.id &&
                variant.plugin === previousPlugin
              ) {
                variant.plugin = value;
              }
            }
            for (const change of state.mapLocationChanges) {
              if (
                change.componentId === component.id &&
                change.plugin === previousPlugin
              ) {
                change.plugin = value;
              }
            }
          },
          { maxLength: 300, placeholder: "Example.esp" },
        ),
        makeButton("Remove", () => {
          const removedPlugin = component.plugins[pluginIndex];
          component.plugins.splice(pluginIndex, 1);
          state.locationVariants = state.locationVariants.filter(
            (variant) =>
              variant.componentId !== component.id ||
              variant.plugin !== removedPlugin,
          );
          state.mapLocationChanges = state.mapLocationChanges.filter(
            (change) =>
              change.componentId !== component.id ||
              change.plugin !== removedPlugin,
          );
          rerender();
        }),
      );
      plugins.append(row);
    });
    plugins.append(
      makeButton("Add plugin filename", () => {
        component.plugins.push("");
        rerender();
      }),
    );
    body.append(plugins);

    const relations = create("div", "contribution-field");
    relations.append(create("span", "contribution-label", "Related mods"));
    component.relations.forEach((relation, relationIndex) => {
      const row = create("div", "contribution-relation-row");
      const relationType = document.createElement("select");
      relationType.required = true;
      relationType.append(new Option("Choose relationship", ""));
      for (const value of options.relationshipTypes) {
        relationType.append(
          new Option(value, value, false, value === relation.type),
        );
      }
      relationType.value = relation.type;
      relationType.addEventListener("change", () => {
        relation.type = relationType.value;
      });
      row.append(
        field("Relationship type", relationType),
        field("Related mod", modTargetSelect(relation, options)),
        makeButton("Remove", () => {
          component.relations.splice(relationIndex, 1);
          rerender();
        }),
      );
      relations.append(row);
    });
    relations.append(
      makeButton("Add related mod", () => {
        component.relations.push({ type: "", target: "" });
        rerender();
      }),
    );
    body.append(relations);
    const replacesBase = ["variant", "translation"].includes(component.type);
    body.append(
      field(
        "Exterior edits (optional)",
        componentLandscapeEditor(root, state, component, options, rerender),
        replacesBase
          ? "This component replaces the parent mod's landscape coverage. Only this component's cells are shown for this install option."
          : "This component adds its cells to the parent mod's landscape coverage.",
      ),
    );
    const notes = document.createElement("textarea");
    notes.value = component.notes;
    notes.maxLength = 5_000;
    notes.rows = 4;
    notes.addEventListener("input", () => {
      component.notes = notes.value;
    });
    body.append(field("Notes (optional)", notes));
    body.append(
      makeButton("Remove component", () => {
        state.locationVariants = state.locationVariants.filter(
          (variant) => variant.componentId !== component.id,
        );
        state.mapLocationChanges = state.mapLocationChanges.filter(
          (change) => change.componentId !== component.id,
        );
        state.components.splice(index, 1);
        rerender();
      }),
    );
    wrapper.append(details);
  });
  wrapper.append(
    makeButton("Add another component", () => {
      state.components.push(blankComponent());
      rerender();
    }),
  );
  return wrapper;
}

function entranceEditor(
  state: ContributionState,
  rerender: () => void,
): HTMLElement {
  const wrapper = create("div", "contribution-field");
  wrapper.append(
    create("span", "contribution-label", "Additional entrance coordinates"),
  );
  state.entrances.forEach((entrance, index) => {
    const row = create("div", "contribution-repeat-row");
    row.append(
      field(
        "X coordinate",
        textInput(
          entrance.x,
          (value) => {
            entrance.x = value;
          },
          { required: true },
        ),
      ),
      field(
        "Y coordinate",
        textInput(
          entrance.y,
          (value) => {
            entrance.y = value;
          },
          { required: true },
        ),
      ),
      field(
        "Region (optional)",
        textInput(
          entrance.region,
          (value) => {
            entrance.region = value;
          },
          { maxLength: 200 },
        ),
      ),
      makeButton("Remove", () => {
        state.entrances.splice(index, 1);
        rerender();
      }),
    );
    wrapper.append(row);
  });
  if (state.entrances.length === 0) {
    wrapper.append(
      create(
        "p",
        "contribution-help",
        "This location has no existing additional entrances. New entrances require maintainer-assigned map metadata and cannot be added in edit mode.",
      ),
    );
  }
  return wrapper;
}

function eventSelect(
  state: ContributionState,
  options: ContributionOptions,
): HTMLSelectElement {
  const select = document.createElement("select");
  select.append(new Option("Choose an event", ""));
  for (const event of [...options.events, ...state.legacyEvents]) {
    const option = document.createElement("option");
    option.value = event;
    option.textContent = state.legacyEvents.includes(event)
      ? `${event} (legacy value)`
      : event;
    select.append(option);
  }
  select.value = state.events[0] ?? "";
  select.addEventListener("change", () => {
    state.events = select.value ? [select.value] : [];
  });
  return select;
}

function mapLocationSelect(
  state: ContributionState,
  options: ContributionOptions,
  ...trailingControls: HTMLElement[]
): HTMLElement {
  const wrapper = create("div");
  const search = textInput("", () => {}, {
    placeholder: "Search map locations",
  });
  search.className = "contribution-search";
  search.setAttribute("aria-label", "Search map locations");
  const choices = create("div", "contribution-multiselect");
  const renderChoices = () => {
    const query = search.value.trim().toLocaleLowerCase("en-US");
    const searchMatches = query
      ? options.mapLocations.filter((location) =>
          location.toLocaleLowerCase("en-US").includes(query),
        )
      : [];
    const displayedLocations = new Set([
      ...state.mapLocations,
      ...searchMatches,
    ]);
    choices.replaceChildren();
    choices.hidden = displayedLocations.size === 0 && !query;
    for (const location of options.mapLocations) {
      if (!displayedLocations.has(location)) continue;
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.mapLocations.includes(location);
      input.addEventListener("change", () => {
        state.mapLocations = input.checked
          ? [...state.mapLocations, location]
          : state.mapLocations.filter((value) => value !== location);
        renderChoices();
      });
      appendChildren(label, input, document.createTextNode(location));
      choices.append(label);
    }
    if (query && searchMatches.length === 0)
      choices.append(
        create(
          "p",
          "contribution-help",
          "No controlled locations match that search.",
        ),
      );
  };
  search.addEventListener("input", renderChoices);
  renderChoices();
  const searchRow = create("div", "contribution-map-search");
  appendChildren(searchRow, search, ...trailingControls);
  appendChildren(wrapper, searchRow, choices);
  return wrapper;
}

function mapExteriorCellEditor(
  coverage: { mapExteriorEdits: ExteriorEdit[] },
  rerender: () => void,
): HTMLElement {
  const wrapper = create("div", "contribution-exterior-cells");
  wrapper.append(
    create("h4", "", "Exterior cells"),
    create(
      "p",
      "contribution-help",
      "Enter each TES3 exterior grid cell, whether it contains a LAND record, and its modified-reference count.",
    ),
  );
  for (const [index, edit] of coverage.mapExteriorEdits.entries()) {
    const row = create("div", "contribution-exterior-cell-row");
    const input = textInput(
      edit.cell,
      (next) => {
        edit.cell = next;
      },
      { placeholder: "12, 11", maxLength: 40 },
    );
    input.setAttribute("aria-label", `Exterior cell ${index + 1} coordinates`);
    const landscapeLabel = document.createElement("label");
    const landscape = document.createElement("input");
    landscape.type = "checkbox";
    landscape.checked = edit.landscape;
    landscape.addEventListener("change", () => {
      edit.landscape = landscape.checked;
    });
    appendChildren(landscapeLabel, landscape, document.createTextNode("LAND"));
    const references = textInput(
      String(edit.references),
      (next) => {
        edit.references = Number(next);
      },
      { type: "number", placeholder: "0" },
    );
    references.min = "0";
    references.step = "1";
    references.setAttribute(
      "aria-label",
      `Exterior cell ${index + 1} modified references`,
    );
    row.append(
      input,
      landscapeLabel,
      references,
      makeButton("Remove", () => {
        coverage.mapExteriorEdits.splice(index, 1);
        rerender();
      }),
    );
    wrapper.append(row);
  }
  wrapper.append(
    makeButton("Add exterior cell", () => {
      coverage.mapExteriorEdits.push({
        cell: "",
        landscape: true,
        references: 0,
      });
      rerender();
    }),
  );
  return wrapper;
}

function mapLocationEditor(
  root: HTMLElement,
  state: ContributionState,
  options: ContributionOptions,
  rerender: () => void,
): HTMLElement {
  const wrapper = create("div");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".esp,.esm";
  file.hidden = true;
  const upload = makeButton("Upload plugin", () => {
    file.value = "";
    file.click();
  });
  wrapper.append(mapLocationSelect(state, options, upload, file));

  if (state.mapPluginMessage) {
    const status = create(
      "p",
      state.mapPluginError ? "contribution-error" : "contribution-notice",
      state.mapPluginMessage,
    );
    status.setAttribute(
      state.mapPluginError ? "role" : "aria-live",
      state.mapPluginError ? "alert" : "polite",
    );
    wrapper.append(status);
  } else {
    wrapper.append(
      create(
        "p",
        "contribution-help",
        `Upload an ESP or ESM up to ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB to prepopulate locations and exterior cells. The file is parsed locally and is never uploaded.`,
      ),
    );
  }
  wrapper.append(mapExteriorCellEditor(state, rerender));

  file.addEventListener("change", async () => {
    const plugin = file.files?.[0];
    if (!plugin) return;
    if (!/\.(?:esp|esm)$/iu.test(plugin.name)) {
      state.mapPluginMessage = "Choose a plugin file ending in .esp or .esm.";
      state.mapPluginError = true;
      rerender();
      return;
    }
    if (plugin.size > MAX_TES3_PLUGIN_BYTES) {
      state.mapPluginMessage = `The plugin file must be no larger than ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB.`;
      state.mapPluginError = true;
      rerender();
      return;
    }

    upload.disabled = true;
    upload.textContent = "Parsing...";
    state.mapPluginMessage = "";
    state.mapPluginError = false;
    try {
      const parserState = blankPluginParserState(state.newLocations);
      parserState.file = plugin;
      parserState.fileName = plugin.name;
      parserState.cells = parseTes3Plugin(await plugin.arrayBuffer());
      hydrateParserNewLocations(parserState);
      hydrateParserLocationChoices(
        parserState,
        options,
        state.mapLocationChanges,
      );
      renderPluginCells(root, options, parserState, {
        backLabel: "Back to mod page",
        onBack: () => renderForm(root, state, options),
        continueLabel: "Use selected cells",
        onContinue: () => {
          const selectedCount = selectedParserCells(parserState).length;
          const transfer = parserLocationTransfer(parserState, options);
          const previousCount = state.mapLocations.length;
          const previousExteriorCount = state.mapExteriorEdits.length;
          state.mapLocations = deduplicate([
            ...state.mapLocations,
            ...transfer.matched,
          ]);
          state.mapExteriorEdits = mergeExteriorEdits(
            state.mapExteriorEdits,
            transfer.exteriorEdits,
          );
          state.newLocations = mergeNewLocationDrafts(
            state.newLocations,
            parserState.newLocations,
          );
          state.locationVariants = mergeLocationVariantDrafts(
            state.locationVariants,
            parserState.locationVariants
              .filter((variant) =>
                parserState.cells.some(
                  (cell) =>
                    cell.selected &&
                    cell.name.toLocaleLowerCase("en-US") ===
                      variant.cell.toLocaleLowerCase("en-US"),
                ),
              )
              .map((variant) => ({ ...variant, componentId: "" })),
          );
          const addedCount = state.mapLocations.length - previousCount;
          const addedExteriorCount =
            state.mapExteriorEdits.length - previousExteriorCount;
          const unmatchedMessage = transfer.unmatched.length
            ? ` ${transfer.unmatched.length} selected cell${transfer.unmatched.length === 1 ? " does" : "s do"} not yet have a matching wiki map location.`
            : "";
          state.mapPluginMessage = `${plugin.name}: added ${addedCount} map location${addedCount === 1 ? "" : "s"} and ${addedExteriorCount} exterior cell${addedExteriorCount === 1 ? "" : "s"} from ${selectedCount} selected cell${selectedCount === 1 ? "" : "s"}.${unmatchedMessage}`;
          state.mapPluginError = false;
          renderForm(root, state, options);
        },
      });
    } catch (error) {
      state.mapPluginMessage =
        error instanceof Error
          ? error.message
          : "The plugin file could not be parsed.";
      state.mapPluginError = true;
      rerender();
    }
  });

  return wrapper;
}

function newLocationCollectionEditor(
  state: ContributionState,
  rerender: () => void,
): HTMLElement {
  const wrapper = create("section", "contribution-new-locations");
  wrapper.append(
    create("h3", "", "New map locations"),
    create(
      "p",
      "contribution-help",
      "Doormarker metadata filled the cell name, exterior region, and entrance coordinates. Add a description for each location; its Markdown file will be included in the same pull request as the mod page.",
    ),
  );
  for (const location of state.newLocations) {
    wrapper.append(
      newLocationDraftEditor(location, () => {
        const key = location.cell.toLocaleLowerCase("en-US");
        state.newLocations = state.newLocations.filter(
          (candidate) => candidate.cell.toLocaleLowerCase("en-US") !== key,
        );
        state.mapLocations = state.mapLocations.filter(
          (candidate) => candidate.toLocaleLowerCase("en-US") !== key,
        );
        for (const component of state.components) {
          component.mapLocations = component.mapLocations.filter(
            (candidate) => candidate.toLocaleLowerCase("en-US") !== key,
          );
        }
        rerender();
      }),
    );
  }
  return wrapper;
}

function blankPluginParserState(
  newLocations: NewLocationDraft[] = [],
): PluginParserState {
  return {
    downloadUrl: "",
    file: null,
    fileName: "",
    cells: [],
    newLocations: mergeNewLocationDrafts(newLocations),
    locationVariants: [],
    locationChoiceError: "",
    nexus: null,
  };
}

function hydrateParserNewLocations(state: PluginParserState) {
  for (const cell of state.cells) {
    if (!cell.interior || cell.doorMarkers.length === 0) continue;
    if (!locationDraftForCell(state, cell)) continue;
    state.newLocations = mergeNewLocationDrafts(state.newLocations, [
      newLocationDraftForCell(cell),
    ]);
  }
}

function hydrateParserLocationChoices(
  state: PluginParserState,
  options: ContributionOptions,
  retainedChanges: MapLocationChangeDraft[] = [],
  componentId = "",
) {
  for (const cell of state.cells) {
    if (!cell.interior || cell.doorMarkers.length === 0) continue;
    if (!modAddedLocationDetail(cell, options)) continue;
    if (locationVariantForCell(state, cell)) continue;
    const retained = retainedChanges.find(
      (change) =>
        change.cell.toLocaleLowerCase("en-US") ===
          cell.name.toLocaleLowerCase("en-US") &&
        change.plugin.toLocaleLowerCase("en-US") ===
          state.fileName.toLocaleLowerCase("en-US") &&
        change.componentId.toLocaleLowerCase("en-US") ===
          componentId.toLocaleLowerCase("en-US"),
    );
    const draft = locationVariantDraftForCell(
      cell,
      retained?.mode ?? "variant",
      state.fileName,
    );
    draft.componentId = componentId;
    state.locationVariants.push(draft);
  }
}

function nexusModId(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (!/(?:^|\.)nexusmods\.com$/iu.test(url.hostname)) return "";
    return url.pathname.match(/^\/morrowind\/mods\/(\d+)(?:\/|$)/iu)?.[1] ?? "";
  } catch {
    return "";
  }
}

function plainNexusDescription(value: string): string {
  if (!value) return "";
  const document = new DOMParser().parseFromString(value, "text/html");
  return (document.body.textContent ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1_000);
}

async function fetchNexusMetadata(
  downloadUrl: string,
): Promise<NexusModMetadata | null> {
  if (!nexusModId(downloadUrl)) return null;
  const endpoint = new URL(NEXUS_METADATA_ENDPOINT);
  endpoint.searchParams.set("url", downloadUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("The Nexus metadata service could not be reached.");
  }
  let result: any = null;
  try {
    result = await response.json();
  } catch {
    /* public error below */
  }
  if (!response.ok || result?.ok !== true || !isRecord(result.mod)) {
    if (response.status === 404 && result?.error === "Not found.") {
      throw new Error(
        "The deployed submission service does not yet expose the Nexus lookup endpoint.",
      );
    }
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "Nexus Mods metadata could not be loaded.",
    );
  }
  return {
    name: stringValue(result.mod.name).trim().slice(0, 200),
    author: stringValue(result.mod.author).trim().slice(0, 200),
    description: plainNexusDescription(stringValue(result.mod.description)),
    pictureUrl: stringValue(result.mod.pictureUrl).trim().slice(0, 2_000),
  };
}

function selectedParserCells(state: PluginParserState): ParsedTes3Cell[] {
  return state.cells.filter((cell) => cell.selected);
}

function parserLocationTransfer(
  state: PluginParserState,
  options: ContributionOptions,
): { matched: string[]; unmatched: string[]; exteriorEdits: ExteriorEdit[] } {
  return matchSelectedTes3CellsToLocations(state.cells, [
    ...options.mapLocations,
    ...state.newLocations.map((location) => location.cell),
  ]);
}

function parserTitle(state: PluginParserState): string {
  return (
    state.nexus?.name ||
    state.fileName.replace(/\.(?:esp|esm)$/iu, "").trim() ||
    "Parsed Morrowind plugin"
  );
}

function parsedPluginMarkdown(state: PluginParserState): string {
  const selected = selectedParserCells(state);
  const exteriorEdits = selected
    .filter((cell) => !cell.interior && cell.grid)
    .map((cell) => ({
      cell: `${cell.grid!.x}, ${cell.grid!.y}`,
      landscape: cell.landscapeEdited === true,
      references: cell.modifiedReferences,
    }));
  const frontmatter: Record<string, unknown> = {
    title: parserTitle(state),
    authors: state.nexus?.author ? [state.nexus.author] : [],
    url: state.downloadUrl.trim(),
    categories: ["Unknown"],
    map_enabled: selected.length > 0,
    map_locations: selected
      .filter((cell) => cell.interior)
      .map((cell) => cell.name),
    map_exterior_edits: exteriorEdits,
    draft: false,
    events: [],
  };
  if (state.nexus?.pictureUrl) frontmatter.picture_url = state.nexus.pictureUrl;
  return serializeWikiMarkdown(
    frontmatter,
    state.nexus?.description ? `${state.nexus.description}\n` : "",
  );
}

function parserDownloadFilename(state: PluginParserState): string {
  return `${slugifyWikiFilename(parserTitle(state)) || "parsed-plugin"}.md`;
}

function renderPluginUpload(
  root: HTMLElement,
  options: ContributionOptions,
  state = blankPluginParserState(),
  message = "",
) {
  const form = create("form", "contribution-form") as HTMLFormElement;
  form.noValidate = true;
  const details = fieldset("Plugin source");
  const downloadUrl = textInput(
    state.downloadUrl,
    (value) => {
      state.downloadUrl = value;
    },
    {
      required: true,
      maxLength: 2_000,
      type: "url",
      placeholder: "https://www.nexusmods.com/morrowind/mods/…",
    },
  );
  details.append(
    field(
      "Download URL",
      downloadUrl,
      "Required. Nexus Mods links automatically provide the mod name, author, description, and picture URL.",
    ),
  );
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".esp,.esm";
  file.required = true;
  file.addEventListener("change", () => {
    state.file = file.files?.[0] ?? null;
    state.fileName = state.file?.name ?? "";
  });
  details.append(
    field(
      "Plugin file",
      file,
      `Choose one ESP or ESM file up to ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB. It is parsed locally and is never uploaded.`,
    ),
  );
  const status = create(
    "p",
    message ? "contribution-error" : "contribution-help",
    message,
  );
  status.setAttribute("role", "status");
  if (!message) status.textContent = "No plugin data leaves your browser.";
  const actions = create("div", "contribution-actions");
  const back = makeButton("Back to choices", () =>
    renderChoices(root, options),
  );
  const parse = makeButton(
    "Parse plugin file",
    () => {},
    "contribution-button contribution-button-primary",
  );
  parse.type = "submit";
  actions.append(back, parse);
  form.append(details, status, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.downloadUrl = state.downloadUrl.trim();
    if (!/^https?:\/\/[^\s]+$/iu.test(state.downloadUrl)) {
      renderPluginUpload(
        root,
        options,
        state,
        "Enter a complete HTTP(S) download URL.",
      );
      return;
    }
    if (!state.file || !/\.(?:esp|esm)$/iu.test(state.file.name)) {
      renderPluginUpload(
        root,
        options,
        state,
        "Choose a plugin file ending in .esp or .esm.",
      );
      return;
    }
    if (state.file.size > MAX_TES3_PLUGIN_BYTES) {
      renderPluginUpload(
        root,
        options,
        state,
        `The plugin file must be no larger than ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB.`,
      );
      return;
    }
    parse.disabled = true;
    parse.textContent = "Parsing…";
    status.className = "wiki-contribution-loading";
    status.textContent = "Reading CELL and LAND records locally…";
    try {
      state.cells = parseTes3Plugin(await state.file.arrayBuffer());
      hydrateParserNewLocations(state);
      hydrateParserLocationChoices(state, options);
      state.nexus = null;
      if (nexusModId(state.downloadUrl)) {
        status.textContent = "Loading Nexus Mods metadata…";
        try {
          state.nexus = await fetchNexusMetadata(state.downloadUrl);
        } catch {
          // Nexus enrichment is optional; the locally parsed plugin remains fully usable.
        }
      }
      renderPluginCells(root, options, state);
    } catch (error) {
      renderPluginUpload(
        root,
        options,
        state,
        error instanceof Error
          ? error.message
          : "The plugin file could not be parsed.",
      );
    }
  });
  root.replaceChildren(
    intro(root),
    create("h2", "", "Parse plugin file"),
    form,
  );
}

function newLocationDraftEditor(
  draft: NewLocationDraft,
  onRemove?: () => void,
): HTMLElement {
  const editor = create("div", "contribution-new-location");
  const heading = create("div", "contribution-new-location-heading");
  heading.append(create("h4", "", draft.cell));
  if (onRemove) heading.append(makeButton("Remove location", onRemove));
  editor.append(heading);
  const metadata = create("div", "contribution-new-location-metadata");
  const staticValue = (value: string) =>
    create("output", "contribution-static-value", value);
  metadata.append(
    field("Cell name", staticValue(draft.cell)),
    field("Region", staticValue(draft.region)),
    field("Coordinates", staticValue(`${draft.x}, ${draft.y}`)),
  );
  editor.append(metadata);
  if (draft.additionalEntrances.length > 0) {
    editor.append(
      create(
        "p",
        "contribution-help",
        `${draft.additionalEntrances.length} additional exterior entrance${draft.additionalEntrances.length === 1 ? " was" : "s were"} detected and will be included automatically.`,
      ),
    );
  }
  const description = document.createElement("textarea");
  description.required = true;
  description.maxLength = 20_000;
  description.rows = 5;
  description.value = draft.description;
  description.placeholder = "Describe this location for the wiki.";
  description.addEventListener("input", () => {
    draft.description = description.value;
  });
  editor.append(
    field(
      "Description",
      description,
      "Required. This becomes the new location article text.",
    ),
  );
  return editor;
}

function renderPluginCells(
  root: HTMLElement,
  options: ContributionOptions,
  state: PluginParserState,
  formActions?: {
    backLabel: string;
    onBack: () => void;
    continueLabel: string;
    onContinue: () => void;
  },
) {
  const section = create("section", "contribution-parser");
  section.append(
    create("h2", "", "Choose edited cells"),
    create(
      "p",
      "contribution-help",
      `${state.fileName}: ${state.cells.length} unique edited cell${state.cells.length === 1 ? "" : "s"}. Available cells start selected, including cells with no modified references.`,
    ),
  );
  if (state.locationChoiceError) {
    const error = create("p", "contribution-error", state.locationChoiceError);
    error.setAttribute("role", "alert");
    section.append(error);
  }
  if (state.nexus) {
    section.append(
      create(
        "p",
        "contribution-notice",
        `Nexus Mods metadata loaded for ${state.nexus.name || "this mod"}.`,
      ),
    );
  }
  const list = create("div", "contribution-cell-list");
  if (state.cells.length === 0) {
    list.append(
      create(
        "p",
        "contribution-help",
        "This plugin does not contain any CELL or LAND records.",
      ),
    );
  }
  const wikiLocations = new Set(
    options.mapLocations.map((location) => location.toLocaleLowerCase("en-US")),
  );
  const newLocationCandidates = state.cells.filter(
    (cell) =>
      cell.interior &&
      cell.doorMarkers.length > 0 &&
      !wikiLocations.has(cell.name.toLocaleLowerCase("en-US")),
  );
  const newLocationCandidateNames = new Set(
    newLocationCandidates.map((cell) => cell.name.toLocaleLowerCase("en-US")),
  );
  const cellControls: Array<{
    cell: ParsedTes3Cell;
    checkbox: HTMLInputElement;
  }> = [];
  const selectionActions = create("div", "contribution-actions");
  const toggleAll = makeButton("Select all", () => {
    const shouldSelect = !cellControls.every(
      ({ checkbox }) => checkbox.checked,
    );
    for (const { cell, checkbox } of cellControls) {
      cell.selected = shouldSelect;
      checkbox.checked = shouldSelect;
    }
    syncToggleAll();
  });
  const syncToggleAll = () => {
    const allSelected =
      cellControls.length > 0 &&
      cellControls.every(({ checkbox }) => checkbox.checked);
    toggleAll.textContent = allSelected ? "Deselect all" : "Select all";
    toggleAll.setAttribute("aria-pressed", String(allSelected));
    toggleAll.disabled = cellControls.length === 0;
  };
  selectionActions.append(toggleAll);
  if (newLocationCandidates.length > 0) {
    const addAllNewLocations = makeButton("Add all new locations", () => {
      state.newLocations = mergeNewLocationDrafts(
        state.newLocations,
        newLocationCandidates.map((cell) => newLocationDraftForCell(cell)),
      );
      for (const cell of newLocationCandidates) cell.selected = true;
      renderPluginCells(root, options, state, formActions);
    });
    addAllNewLocations.disabled = newLocationCandidates.every((cell) =>
      Boolean(locationDraftForCell(state, cell)),
    );
    if (addAllNewLocations.disabled) {
      addAllNewLocations.textContent = "All new locations added";
      addAllNewLocations.title = "Every detected new location is already added.";
    }
    selectionActions.append(addAllNewLocations);
  }
  for (const cell of state.cells) {
    const isOnWiki = wikiLocations.has(cell.name.toLocaleLowerCase("en-US"));
    const draft = locationDraftForCell(state, cell);
    const modAddedLocation = isOnWiki
      ? modAddedLocationDetail(cell, options)
      : undefined;
    const locationVariant = locationVariantForCell(state, cell);
    const isLocationCandidate = newLocationCandidateNames.has(
      cell.name.toLocaleLowerCase("en-US"),
    );
    const isSelectable = !cell.interior || isOnWiki || Boolean(draft);
    if (!isSelectable) cell.selected = false;
    const row = document.createElement("div");
    row.className = "contribution-cell-row";
    if (!isSelectable && !isLocationCandidate)
      row.classList.add("contribution-cell-row-unavailable");
    if (isLocationCandidate)
      row.classList.add("contribution-cell-row-location-candidate");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = cell.selected;
    checkbox.disabled = !isSelectable || isLocationCandidate;
    checkbox.setAttribute("aria-label", `Select ${cell.displayName}`);
    if (!isSelectable && !isLocationCandidate) {
      const unavailableMessage =
        "This interior is not on the wiki and has no exterior doormarker.";
      checkbox.className = "contribution-cell-checkbox-unavailable";
      checkbox.setAttribute(
        "aria-label",
        `${cell.displayName}: ${unavailableMessage}`,
      );
      checkbox.title = unavailableMessage;
      row.title = unavailableMessage;
    }
    checkbox.addEventListener("change", () => {
      cell.selected = checkbox.checked;
      if (!checkbox.checked && modAddedLocation) {
        state.locationChoiceError = "";
      }
      syncToggleAll();
    });
    if (isSelectable && !isLocationCandidate)
      cellControls.push({ cell, checkbox });
    const indicator = create("span", "contribution-cell-indicator");
    indicator.append(checkbox);
    if (!isSelectable && !isLocationCandidate) {
      const unavailableMark = create(
        "span",
        "contribution-cell-unavailable-mark",
        "×",
      );
      unavailableMark.setAttribute("aria-hidden", "true");
      indicator.append(unavailableMark);
    }
    const content = create("span", "contribution-cell-content");
    content.append(create("strong", "", cell.displayName));
    const locationKind = cell.interior
      ? "Interior"
      : `Exterior (${cell.grid?.x ?? 0}, ${cell.grid?.y ?? 0})`;
    const regionDetail =
      cell.region && !cell.displayName.startsWith(`${cell.region} (`)
        ? ` · ${cell.region}`
        : "";
    const editDetail = cell.landscapeEdited
      ? `landscape edit · ${cell.modifiedReferences} modified reference${cell.modifiedReferences === 1 ? "" : "s"}`
      : `${cell.modifiedReferences} modified reference${cell.modifiedReferences === 1 ? "" : "s"}`;
    const markerDetail = cell.doorMarkers.length
      ? ` · ${cell.doorMarkers.length} exterior doormarker${cell.doorMarkers.length === 1 ? "" : "s"}`
      : "";
    content.append(
      create(
        "span",
        "contribution-cell-meta",
        `${cell.changeType} · ${editDetail} · ${locationKind}${regionDetail}${markerDetail}`,
      ),
    );
    const controls = create("span", "contribution-cell-controls");
    if (isLocationCandidate) {
      controls.append(
        makeButton(draft ? "Remove location" : "Add location", () => {
          if (draft) {
            state.newLocations = state.newLocations.filter(
              (location) =>
                location.cell.toLocaleLowerCase("en-US") !==
                cell.name.toLocaleLowerCase("en-US"),
            );
            cell.selected = false;
          } else {
            state.newLocations = mergeNewLocationDrafts(state.newLocations, [
              newLocationDraftForCell(cell),
            ]);
            cell.selected = true;
          }
          renderPluginCells(root, options, state, formActions);
        }),
      );
    }
    appendChildren(row, indicator, content, controls);
    list.append(row);
    if (modAddedLocation) {
      const choice = create("fieldset", "contribution-location-variant-choice");
      const legend = document.createElement("legend");
      legend.textContent = `${cell.name} is a mod-added location. How should this plugin's doormarkers be represented?`;
      choice.append(legend);
      for (const [mode, label] of [
        ["variant", `Use an install-specific location for ${state.fileName}`],
        ["main", "Make these coordinates the main location"],
        ["entrance", "Add these coordinates as new entrances"],
      ] as const) {
        const option = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `location-variant-${slugifyWikiFilename(cell.name)}`;
        radio.value = mode;
        radio.checked = locationVariant?.mode === mode;
        radio.addEventListener("change", () => {
          state.locationVariants = state.locationVariants.filter(
            (candidate) =>
              candidate.cell.toLocaleLowerCase("en-US") !==
              cell.name.toLocaleLowerCase("en-US"),
          );
          state.locationVariants.push(
            locationVariantDraftForCell(cell, mode, state.fileName),
          );
          state.locationChoiceError = "";
        });
        appendChildren(option, radio, document.createTextNode(label));
        choice.append(option);
      }
      list.append(choice);
    }
    if (draft) list.append(newLocationDraftEditor(draft));
  }
  syncToggleAll();
  const actions = create("div", "contribution-actions");
  actions.append(
    makeButton(
      formActions?.backLabel ?? "Choose another file",
      formActions?.onBack ?? (() => renderPluginUpload(root, options, state)),
    ),
    makeButton(
      formActions?.continueLabel ?? "Continue",
      () => {
        const unresolved = state.cells.filter(
          (cell) =>
            cell.selected &&
            modAddedLocationDetail(cell, options) &&
            !locationVariantForCell(state, cell)?.mode,
        );
        if (unresolved.length > 0) {
          state.locationChoiceError = `Choose whether ${unresolved.map((cell) => cell.name).join(", ")} should use an install-specific location, become the main location, or add entrances.`;
          renderPluginCells(root, options, state, formActions);
          return;
        }
        state.locationChoiceError = "";
        (
          formActions?.onContinue ??
          (() => renderPluginDestination(root, options, state))
        )();
      },
      "contribution-button contribution-button-primary",
    ),
  );
  section.append(selectionActions, list, actions);
  root.replaceChildren(intro(root), section);
}

function renderPluginDestination(
  root: HTMLElement,
  options: ContributionOptions,
  state: PluginParserState,
) {
  const selected = selectedParserCells(state);
  const transfer = parserLocationTransfer(state, options);
  const section = create("section", "contribution-parser");
  section.append(
    create("h2", "", "Use parsed plugin data"),
    create(
      "p",
      "contribution-help",
      `${selected.length} selected cell${selected.length === 1 ? "" : "s"}; ${transfer.matched.length} match wiki locations and ${transfer.exteriorEdits.length} are exterior cells.`,
    ),
  );
  if (transfer.unmatched.length) {
    section.append(
      create(
        "p",
        "contribution-stale-notice",
        `${transfer.unmatched.length} selected cell${transfer.unmatched.length === 1 ? " does" : "s do"} not yet have a wiki map location. They cannot be linked automatically until those location pages exist.`,
      ),
    );
  }
  const choices = create("div", "contribution-choices");
  const submit = create("button", "contribution-choice") as HTMLButtonElement;
  submit.type = "button";
  appendChildren(
    submit,
    create("strong", "", "Submit a new mod page"),
    document.createTextNode(
      "Open the regular contribution form with metadata and locations filled in.",
    ),
  );
  submit.addEventListener("click", () => {
    const contribution = blankState("new-mod");
    trackContributionState(contribution);
    contribution.title = parserTitle(state);
    contribution.slug = slugifyWikiFilename(contribution.title);
    contribution.url = state.downloadUrl;
    contribution.pictureUrl = state.nexus?.pictureUrl ?? "";
    contribution.authors = state.nexus?.author ? [state.nexus.author] : [""];
    contribution.category = options.categories.includes("Unknown")
      ? "Unknown"
      : "";
    contribution.mapLocations = transfer.matched;
    contribution.mapExteriorEdits = transfer.exteriorEdits;
    contribution.newLocations = mergeNewLocationDrafts(state.newLocations);
    contribution.locationVariants = mergeLocationVariantDrafts(
      state.locationVariants.filter((variant) =>
        selected.some(
          (cell) =>
            cell.name.toLocaleLowerCase("en-US") ===
            variant.cell.toLocaleLowerCase("en-US"),
        ),
      ),
    );
    contribution.mapEnabled =
      transfer.matched.length > 0 || transfer.exteriorEdits.length > 0;
    if (state.nexus?.description) {
      contribution.article = NEW_MOD_ARTICLE_TEMPLATE.replace(
        "Extract from mod description",
        state.nexus.description.trim().replace(/\r?\n/gu, "\n> "),
      );
    }
    renderForm(root, contribution, options);
  });
  const download = create("button", "contribution-choice") as HTMLButtonElement;
  download.type = "button";
  appendChildren(
    download,
    create("strong", "", "Download Markdown file"),
    document.createTextNode(
      "Download a draft containing every currently selected cell.",
    ),
  );
  download.addEventListener("click", () =>
    downloadTextFile(
      parsedPluginMarkdown(state),
      parserDownloadFilename(state),
    ),
  );
  choices.append(submit, download);
  section.append(choices);
  const actions = create("div", "contribution-actions");
  actions.append(
    makeButton("Back to cells", () => renderPluginCells(root, options, state)),
  );
  section.append(actions);
  root.replaceChildren(intro(root), section);
}

const EDITOR_ICON_PATHS: Record<string, string[]> = {
  bold: ["M6 4h8a4 4 0 0 1 0 8H6z", "M6 12h9a4 4 0 0 1 0 8H6z"],
  italic: ["M19 4h-9", "M14 20H5", "M15 4 9 20"],
  strike: ["M16 4H9a3 3 0 0 0-2.8 4", "M4 12h16", "M15 20H8a3 3 0 0 1-2.8-2"],
  heading: ["M6 4v16", "M18 4v16", "M6 12h12"],
  quote: [
    "M7 17H4a2 2 0 0 1-2-2v-3a5 5 0 0 1 5-5",
    "M17 17h-3a2 2 0 0 1-2-2v-3a5 5 0 0 1 5-5",
  ],
  bullet: [
    "M8 6h13",
    "M8 12h13",
    "M8 18h13",
    "M3 6h.01",
    "M3 12h.01",
    "M3 18h.01",
  ],
  ordered: [
    "M10 6h11",
    "M10 12h11",
    "M10 18h11",
    "M4 4h1v4",
    "M4 11h2l-2 3h2",
    "M4 17h2l-2 3h2",
  ],
  code: ["m8 18-6-6 6-6", "m16 6 6 6-6 6"],
  link: [
    "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1",
    "M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1",
  ],
  internal: ["M8 3H5v18h3", "M16 3h3v18h-3", "M9 12h6"],
};

function editorIcon(name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const data of EDITOR_ICON_PATHS[name] ?? []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    svg.append(path);
  }
  return svg;
}

function editorButton(
  label: string,
  icon: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = makeButton(label, onClick, "contribution-format-button");
  button.replaceChildren(editorIcon(icon));
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

function serializeFormattedMarkdown(editor: HTMLElement): string {
  const serializeChildren = (node: Node): string =>
    Array.from(node.childNodes)
      .map((child) => serialize(child))
      .join("");
  const serializeTable = (table: HTMLElement): string => {
    const rows = Array.from(
      table.querySelectorAll(
        ":scope > thead > tr, :scope > tbody > tr, :scope > tr",
      ),
    );
    const serialized = rows.map(
      (row) =>
        `| ${Array.from(row.children)
          .map((cell) => serializeChildren(cell).trim().replace(/\|/gu, "\\|"))
          .join(" | ")} |`,
    );
    if (serialized.length > 0) {
      const columns = rows[0]?.children.length ?? 1;
      serialized.splice(
        1,
        0,
        `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`,
      );
    }
    return serialized.length ? `${serialized.join("\n")}\n\n` : "";
  };
  const serializeList = (list: HTMLElement): string => {
    const ordered = list.tagName === "OL";
    const items = Array.from(list.children).filter(
      (child) => child.tagName === "LI",
    );
    return `${items
      .map((item, index) => {
        const marker = ordered ? `${index + 1}. ` : "- ";
        const content = serializeChildren(item).trim().replace(/\n/gu, "\n  ");
        return `${marker}${content}`;
      })
      .join("\n")}\n\n`;
  };
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE)
      return (node.textContent ?? "").replace(/\u00a0/gu, " ");
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName.toLocaleLowerCase("en-US");
    if (tag === "br") return "  \n";
    if (tag === "hr") return "---\n\n";
    if (/^h[1-6]$/u.test(tag))
      return `${"#".repeat(Number(tag.slice(1)))} ${serializeChildren(node).trim()}\n\n`;
    if (tag === "p" || tag === "div")
      return `${serializeChildren(node).replace(/\n+$/u, "")}\n\n`;
    if (tag === "strong" || tag === "b")
      return `**${serializeChildren(node)}**`;
    if (tag === "em" || tag === "i") return `*${serializeChildren(node)}*`;
    if (tag === "del" || tag === "s" || tag === "strike")
      return `~~${serializeChildren(node)}~~`;
    if (tag === "blockquote") {
      const quoted = serializeChildren(node).trim().replace(/^/gmu, "> ");
      return `${quoted}\n\n`;
    }
    if (tag === "ul" || tag === "ol") return serializeList(node);
    if (tag === "pre") {
      const value = node.textContent ?? "";
      const fence = value.includes("```") ? "````" : "```";
      return `${fence}\n${value.replace(/\n$/u, "")}\n${fence}\n\n`;
    }
    if (tag === "code") return `\`${serializeChildren(node)}\``;
    if (tag === "a") {
      const label = serializeChildren(node).trim();
      const wikiTarget = node.dataset.wikiTarget;
      if (wikiTarget) return `[[${wikiTarget}${label ? `|${label}` : ""}]]`;
      const href = node.getAttribute("href") ?? "";
      return href ? `[${label || href}](${href})` : label;
    }
    if (tag === "img") {
      const image = node as HTMLImageElement;
      return `![${image.alt}](${image.getAttribute("src") ?? ""})`;
    }
    if (tag === "table") return serializeTable(node);
    if (tag === "input") return "";
    return serializeChildren(node);
  };

  return serializeChildren(editor)
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trimEnd();
}

function markdownEditor(
  state: ContributionState,
  options: ContributionOptions,
): HTMLElement {
  const wrapper = create(
    "div",
    "contribution-field contribution-markdown-field",
  );
  wrapper.append(create("span", "contribution-label", "Article text"));
  const syntaxHelp = create("p", "contribution-help");
  const syntaxLink = document.createElement("a");
  syntaxLink.href = "https://obsidian.md/help/syntax";
  syntaxLink.target = "_blank";
  syntaxLink.rel = "noopener noreferrer";
  syntaxLink.textContent = "Obsidian formatting syntax";
  appendChildren(
    syntaxHelp,
    document.createTextNode("Formatting help: "),
    syntaxLink,
    document.createTextNode("."),
  );
  wrapper.append(syntaxHelp);
  const tabs = create("div", "contribution-tabs");
  const formattedButton = makeButton("Formatted", () => setMode(false));
  const markdownButton = makeButton("Markdown", () => setMode(true));
  formattedButton.setAttribute("role", "tab");
  markdownButton.setAttribute("role", "tab");
  const toolbar = create("div", "contribution-format-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Markdown formatting");
  const textarea = document.createElement("textarea");
  textarea.className = "contribution-markdown";
  textarea.required = true;
  textarea.value = state.article;
  textarea.setAttribute("aria-label", "Article Markdown");
  const formatted = create("div", "contribution-formatted-editor");
  formatted.contentEditable = "true";
  formatted.spellcheck = true;
  formatted.setAttribute("role", "textbox");
  formatted.setAttribute("aria-label", "Formatted article editor");
  formatted.setAttribute("aria-multiline", "true");
  formatted.dataset.placeholder = "Write the wiki article…";
  const suggestions = create("div", "contribution-link-suggestions");
  suggestions.hidden = true;
  suggestions.id = "wiki-link-suggestions";
  suggestions.setAttribute("role", "listbox");
  suggestions.setAttribute("aria-label", "Wiki page suggestions");
  const externalLinkPanel = create(
    "div",
    "contribution-external-link-panel",
  );
  externalLinkPanel.hidden = true;
  externalLinkPanel.id = "external-link-editor";
  externalLinkPanel.setAttribute("role", "dialog");
  externalLinkPanel.setAttribute("aria-label", "Insert external link");
  const externalLinkText = document.createElement("input");
  externalLinkText.type = "text";
  externalLinkText.setAttribute("aria-label", "Link text");
  externalLinkText.placeholder = "Link text";
  const externalLinkUrl = document.createElement("input");
  externalLinkUrl.type = "url";
  externalLinkUrl.setAttribute("aria-label", "Link URL");
  externalLinkUrl.placeholder = "https://example.com";
  const externalLinkError = create(
    "p",
    "contribution-external-link-error",
  );
  externalLinkError.hidden = true;
  externalLinkError.setAttribute("role", "alert");
  textarea.setAttribute("aria-controls", suggestions.id);
  textarea.setAttribute("aria-expanded", "false");
  formatted.setAttribute("aria-controls", suggestions.id);
  formatted.setAttribute("aria-expanded", "false");
  let sourceMode = false;
  let selectedSuggestion = 0;

  type ActiveWikiQuery =
    | { mode: "source"; start: number; end: number; query: string }
    | { mode: "formatted"; range: Range; query: string };
  type PendingExternalLink =
    | { mode: "source"; start: number; end: number }
    | { mode: "formatted"; range: Range; hadSelection: boolean };
  let pendingExternalLink: PendingExternalLink | null = null;
  let externalLinkButton: HTMLButtonElement | null = null;

  const sourceWikiQuery = (): ActiveWikiQuery | null => {
    const end = textarea.selectionStart;
    const before = textarea.value.slice(0, end);
    const start = before.lastIndexOf("[[");
    if (start < 0 || before.lastIndexOf("]]") > start) return null;
    const query = before.slice(start + 2);
    return /[\[\]\n\r]/u.test(query)
      ? null
      : { mode: "source", start, end, query };
  };
  const formattedWikiQuery = (): ActiveWikiQuery | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed)
      return null;
    const caret = selection.getRangeAt(0);
    if (!formatted.contains(caret.startContainer)) return null;
    const startElement =
      caret.startContainer instanceof Element
        ? caret.startContainer
        : caret.startContainer.parentElement;
    const block =
      startElement?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote") ??
      formatted;
    const beforeCaret = document.createRange();
    beforeCaret.selectNodeContents(block);
    beforeCaret.setEnd(caret.startContainer, caret.startOffset);
    const text = beforeCaret.toString();
    const start = text.lastIndexOf("[[");
    if (start < 0) return null;
    const query = text.slice(start + 2);
    if (/[\[\]\n\r]/u.test(query)) return null;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let remaining = start;
    let startNode: Node | null = walker.nextNode();
    while (startNode && remaining > (startNode.textContent?.length ?? 0)) {
      remaining -= startNode.textContent?.length ?? 0;
      startNode = walker.nextNode();
    }
    if (!startNode) return null;
    const range = document.createRange();
    range.setStart(startNode, remaining);
    range.setEnd(caret.startContainer, caret.startOffset);
    return { mode: "formatted", range, query };
  };
  const activeWikiQuery = (): ActiveWikiQuery | null =>
    sourceMode ? sourceWikiQuery() : formattedWikiQuery();
  const sourceCaretRect = (): Pick<
    DOMRect,
    "bottom" | "left" | "top"
  > => {
    const textareaRect = textarea.getBoundingClientRect();
    const computed = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    Object.assign(mirror.style, {
      position: "fixed",
      visibility: "hidden",
      pointerEvents: "none",
      boxSizing: computed.boxSizing,
      top: `${textareaRect.top}px`,
      left: `${textareaRect.left}px`,
      width: `${textareaRect.width}px`,
      minHeight: `${textareaRect.height}px`,
      padding: computed.padding,
      border: computed.border,
      font: computed.font,
      letterSpacing: computed.letterSpacing,
      lineHeight: computed.lineHeight,
      overflowWrap: computed.overflowWrap,
      tabSize: computed.tabSize,
      whiteSpace: "pre-wrap",
      wordBreak: computed.wordBreak,
    });
    mirror.textContent = textarea.value.slice(0, textarea.selectionStart);
    const marker = document.createElement("span");
    marker.textContent =
      textarea.value.slice(textarea.selectionStart, textarea.selectionStart + 1) ||
      "\u200b";
    mirror.append(marker);
    document.body.append(mirror);
    const markerRect = marker.getBoundingClientRect();
    mirror.remove();
    return {
      top: markerRect.top - textarea.scrollTop,
      bottom: markerRect.bottom - textarea.scrollTop,
      left: markerRect.left - textarea.scrollLeft,
    };
  };
  const positionSuggestions = (active: ActiveWikiQuery) => {
    const anchor =
      active.mode === "source"
        ? sourceCaretRect()
        : (Array.from(active.range.getClientRects()).at(-1) ??
          active.range.getBoundingClientRect());
    const wrapperRect = wrapper.getBoundingClientRect();
    const menuWidth = suggestions.getBoundingClientRect().width;
    const left = Math.min(
      Math.max(0, anchor.left - wrapperRect.left),
      Math.max(0, wrapper.clientWidth - menuWidth),
    );
    suggestions.style.left = `${left}px`;
    suggestions.style.top = `${anchor.bottom - wrapperRect.top + 6}px`;

    const menuRect = suggestions.getBoundingClientRect();
    if (menuRect.top < 8 || menuRect.bottom > window.innerHeight - 8)
      suggestions.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const hideSuggestions = () => {
    suggestions.hidden = true;
    textarea.setAttribute("aria-expanded", "false");
    formatted.setAttribute("aria-expanded", "false");
  };
  const matchingPages = (query: string): WikiPageOption[] => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    const score = (page: WikiPageOption): number => {
      const title = page.title.toLocaleLowerCase("en-US");
      const aliases = page.aliases.map((alias) =>
        alias.toLocaleLowerCase("en-US"),
      );
      if (!needle) return 0;
      if (title.startsWith(needle)) return 0;
      if (aliases.some((alias) => alias.startsWith(needle))) return 1;
      if (title.includes(needle)) return 2;
      if (aliases.some((alias) => alias.includes(needle))) return 3;
      if (page.path.includes(needle)) return 4;
      return Number.POSITIVE_INFINITY;
    };
    return options.wikiPages
      .map((page) => ({ page, score: score(page) }))
      .filter((match) => Number.isFinite(match.score))
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.page.title.localeCompare(right.page.title, "en", {
            sensitivity: "base",
            numeric: true,
          }) ||
          left.page.path.localeCompare(right.page.path, "en", {
            sensitivity: "base",
            numeric: true,
          }),
      )
      .slice(0, 12)
      .map((match) => match.page);
  };
  const syncFromFormatted = () => {
    state.article = serializeFormattedMarkdown(formatted);
    textarea.value = state.article;
  };
  const chooseWikiPage = (page: WikiPageOption) => {
    const active = activeWikiQuery();
    if (!active) return;
    if (active.mode === "source") {
      let replaceEnd = active.end;
      if (textarea.value.slice(replaceEnd, replaceEnd + 2) === "]]")
        replaceEnd += 2;
      const link = `[[${page.path}|${page.title}]]`;
      textarea.setRangeText(link, active.start, replaceEnd, "end");
      state.article = textarea.value;
      textarea.focus();
    } else {
      const suffix = active.range.endContainer.textContent?.slice(
        active.range.endOffset,
        active.range.endOffset + 2,
      );
      if (suffix === "]]")
        active.range.setEnd(
          active.range.endContainer,
          active.range.endOffset + 2,
        );
      active.range.deleteContents();
      const link = document.createElement("a");
      link.className = "internal";
      link.href = wikiPageHref(page);
      link.dataset.wikiTarget = page.path;
      link.textContent = page.title;
      active.range.insertNode(link);
      const selection = window.getSelection();
      active.range.setStartAfter(link);
      active.range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(active.range);
      syncFromFormatted();
      formatted.focus();
    }
    hideSuggestions();
  };
  const updateSuggestions = () => {
    const active = activeWikiQuery();
    if (!active) {
      hideSuggestions();
      return;
    }
    const pages = matchingPages(active.query);
    selectedSuggestion = Math.min(
      selectedSuggestion,
      Math.max(0, pages.length - 1),
    );
    suggestions.replaceChildren();
    if (pages.length === 0) {
      suggestions.append(
        create(
          "p",
          "contribution-link-empty",
          "No wiki pages match that link.",
        ),
      );
    } else {
      pages.forEach((page, index) => {
        const option = makeButton(
          page.title,
          () => chooseWikiPage(page),
          "contribution-link-option",
        );
        option.id = `wiki-link-option-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute(
          "aria-selected",
          String(index === selectedSuggestion),
        );
        option.addEventListener("mousedown", (event) => event.preventDefault());
        appendChildren(
          option,
          create(
            "span",
            "contribution-link-option-meta",
            `${page.type === "location" ? "Location" : "Mod"} · ${page.path}`,
          ),
        );
        suggestions.append(option);
      });
    }
    suggestions.hidden = false;
    positionSuggestions(active);
    const input = sourceMode ? textarea : formatted;
    input.setAttribute("aria-expanded", "true");
    const selected = suggestions.querySelector<HTMLElement>(
      `[aria-selected="true"]`,
    );
    if (selected) input.setAttribute("aria-activedescendant", selected.id);
  };
  const moveSuggestion = (offset: number) => {
    const choices = Array.from(
      suggestions.querySelectorAll<HTMLButtonElement>(
        ".contribution-link-option",
      ),
    );
    if (choices.length === 0) return;
    selectedSuggestion =
      (selectedSuggestion + offset + choices.length) % choices.length;
    choices.forEach((choice, index) =>
      choice.setAttribute(
        "aria-selected",
        String(index === selectedSuggestion),
      ),
    );
    choices[selectedSuggestion]?.scrollIntoView({ block: "nearest" });
  };
  const handleSuggestionKey = (event: KeyboardEvent): boolean => {
    if (suggestions.hidden) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSuggestion(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const choices = suggestions.querySelectorAll<HTMLButtonElement>(
        ".contribution-link-option",
      );
      const choice = choices[selectedSuggestion];
      if (!choice) return false;
      event.preventDefault();
      choice.click();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hideSuggestions();
      return true;
    }
    return false;
  };
  const replaceSourceInline = (
    before: string,
    after: string,
    placeholder: string,
  ) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder;
    const replacement = `${before}${selected}${after}`;
    textarea.setRangeText(replacement, start, end, "select");
    textarea.setSelectionRange(
      start + before.length,
      start + before.length + selected.length,
    );
    state.article = textarea.value;
    textarea.focus();
  };
  const replaceSourceLines = (
    prefix: string,
    existing: RegExp,
    ordered = false,
  ) => {
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const start =
      textarea.value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const nextLine = textarea.value.indexOf("\n", selectionEnd);
    const end = nextLine < 0 ? textarea.value.length : nextLine;
    const lines = textarea.value.slice(start, end).split("\n");
    const remove = lines
      .filter((line) => line.trim())
      .every((line) => existing.test(line));
    const replacement = lines
      .map((line, index) => {
        if (!line.trim()) return line;
        if (remove) return line.replace(existing, "");
        return `${ordered ? `${index + 1}. ` : prefix}${line.replace(existing, "")}`;
      })
      .join("\n");
    textarea.setRangeText(replacement, start, end, "select");
    textarea.setSelectionRange(start, start + replacement.length);
    state.article = textarea.value;
    textarea.focus();
  };
  const wrapFormattedSelection = (tag: string, placeholder: string) => {
    formatted.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!formatted.contains(range.commonAncestorContainer)) return;
    const element = document.createElement(tag);
    if (range.collapsed) element.textContent = placeholder;
    else element.append(range.extractContents());
    range.insertNode(element);
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    syncFromFormatted();
  };
  const applyFormat = (command: string) => {
    if (sourceMode) {
      if (command === "bold") replaceSourceInline("**", "**", "bold text");
      else if (command === "italic")
        replaceSourceInline("*", "*", "italic text");
      else if (command === "strike")
        replaceSourceInline("~~", "~~", "struck text");
      else if (command === "heading") replaceSourceLines("## ", /^#{1,6}\s+/u);
      else if (command === "quote") replaceSourceLines("> ", /^>\s?/u);
      else if (command === "bullet") replaceSourceLines("- ", /^[-*+]\s+/u);
      else if (command === "ordered")
        replaceSourceLines("", /^\d+[.)]\s+/u, true);
      else if (command === "code") replaceSourceInline("`", "`", "code");
      return;
    }
    formatted.focus();
    if (command === "bold") document.execCommand("bold");
    else if (command === "italic") document.execCommand("italic");
    else if (command === "strike") document.execCommand("strikeThrough");
    else if (command === "heading")
      document.execCommand("formatBlock", false, "h2");
    else if (command === "quote")
      document.execCommand("formatBlock", false, "blockquote");
    else if (command === "bullet") document.execCommand("insertUnorderedList");
    else if (command === "ordered") document.execCommand("insertOrderedList");
    else if (command === "code") wrapFormattedSelection("code", "code");
    syncFromFormatted();
  };
  const addExternalLink = () => {
    const sourceStart = textarea.selectionStart;
    const sourceEnd = textarea.selectionEnd;
    let selectedText = sourceMode
      ? textarea.value.slice(sourceStart, sourceEnd)
      : "";
    let formattedRange: Range | null = null;
    if (!sourceMode) {
      formatted.focus();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!formatted.contains(range.commonAncestorContainer)) return;
      formattedRange = range.cloneRange();
      selectedText = selection.toString();
    }
    pendingExternalLink = sourceMode
      ? { mode: "source", start: sourceStart, end: sourceEnd }
      : {
          mode: "formatted",
          range: formattedRange as Range,
          hadSelection: Boolean(selectedText),
        };
    externalLinkText.value = selectedText;
    externalLinkUrl.value = "https://";
    externalLinkError.hidden = true;
    externalLinkPanel.hidden = false;
    externalLinkButton?.setAttribute("aria-expanded", "true");
    hideSuggestions();

    const buttonRect = externalLinkButton?.getBoundingClientRect();
    if (buttonRect) {
      const wrapperRect = wrapper.getBoundingClientRect();
      const panelWidth = externalLinkPanel.getBoundingClientRect().width;
      externalLinkPanel.style.left = `${Math.min(
        Math.max(0, buttonRect.left - wrapperRect.left),
        Math.max(0, wrapper.clientWidth - panelWidth),
      )}px`;
      externalLinkPanel.style.top = `${buttonRect.bottom - wrapperRect.top + 6}px`;
    }
    (selectedText ? externalLinkUrl : externalLinkText).focus();
  };
  const closeExternalLink = (restoreFocus = true) => {
    externalLinkPanel.hidden = true;
    externalLinkError.hidden = true;
    pendingExternalLink = null;
    externalLinkButton?.setAttribute("aria-expanded", "false");
    if (restoreFocus) (sourceMode ? textarea : formatted).focus();
  };
  const insertExternalLink = () => {
    if (!pendingExternalLink) return;
    const rawUrl = externalLinkUrl.value.trim();
    const url = safeUrl(rawUrl);
    if (!url) {
      externalLinkError.textContent =
        "Enter a complete HTTP(S) or mailto link.";
      externalLinkError.hidden = false;
      externalLinkUrl.focus();
      return;
    }
    const label = externalLinkText.value.trim() || rawUrl;
    const pending = pendingExternalLink;
    closeExternalLink(false);
    if (pending.mode === "source") {
      const replacement = `[${label}](${rawUrl})`;
      textarea.setRangeText(replacement, pending.start, pending.end, "end");
      textarea.setSelectionRange(
        pending.start + 1,
        pending.start + 1 + label.length,
      );
      state.article = textarea.value;
      textarea.focus();
      return;
    }
    const selection = window.getSelection();
    if (!selection) return;
    const link = document.createElement("a");
    link.className = "external";
    link.href = url;
    if (pending.range.collapsed) link.textContent = label;
    else link.append(pending.range.extractContents());
    pending.range.insertNode(link);
    const nextSelection = document.createRange();
    if (pending.hadSelection) {
      nextSelection.setStartAfter(link);
      nextSelection.collapse(true);
    } else nextSelection.selectNodeContents(link);
    selection.removeAllRanges();
    selection.addRange(nextSelection);
    syncFromFormatted();
    formatted.focus();
  };
  const beginInternalLink = () => {
    closeExternalLink(false);
    if (sourceMode) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const query = textarea.value.slice(start, end);
      textarea.setRangeText(`[[${query}`, start, end, "end");
      state.article = textarea.value;
      textarea.focus();
    } else {
      formatted.focus();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const query = selection.toString();
      range.deleteContents();
      const text = document.createTextNode(`[[${query}`);
      range.insertNode(text);
      range.setStart(text, text.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      syncFromFormatted();
    }
    selectedSuggestion = 0;
    updateSuggestions();
  };
  const setMode = (showSource: boolean) => {
    closeExternalLink(false);
    if (showSource) syncFromFormatted();
    else {
      state.article = textarea.value;
      renderMarkdown(state.article, formatted, options.wikiPages);
    }
    sourceMode = showSource;
    textarea.hidden = !showSource;
    formatted.hidden = showSource;
    formattedButton.setAttribute("aria-selected", String(!showSource));
    markdownButton.setAttribute("aria-selected", String(showSource));
    hideSuggestions();
  };
  const formatting = [
    ["Bold (Ctrl+B)", "bold", "bold"],
    ["Italic (Ctrl+I)", "italic", "italic"],
    ["Strikethrough", "strike", "strike"],
    ["Heading", "heading", "heading"],
    ["Block quote", "quote", "quote"],
    ["Bulleted list", "bullet", "bullet"],
    ["Numbered list", "ordered", "ordered"],
    ["Inline code", "code", "code"],
  ];
  for (const [label, icon, command] of formatting)
    toolbar.append(editorButton(label, icon, () => applyFormat(command)));
  externalLinkButton = editorButton("External link", "link", addExternalLink);
  externalLinkButton.setAttribute("aria-controls", externalLinkPanel.id);
  externalLinkButton.setAttribute("aria-expanded", "false");
  toolbar.append(
    externalLinkButton,
    editorButton("Internal wiki link", "internal", beginInternalLink),
  );
  const externalLinkActions = create(
    "div",
    "contribution-external-link-actions",
  );
  const insertExternalLinkButton = makeButton(
    "Insert link",
    insertExternalLink,
    "contribution-button contribution-button-primary",
  );
  externalLinkActions.append(
    insertExternalLinkButton,
    makeButton("Cancel", () => closeExternalLink()),
  );
  externalLinkPanel.append(
    create("strong", "", "External link"),
    externalLinkText,
    externalLinkUrl,
    externalLinkError,
    externalLinkActions,
  );
  for (const input of [externalLinkText, externalLinkUrl])
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        insertExternalLink();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeExternalLink();
      }
    });
  const handleEditorKey = (event: KeyboardEvent) => {
    if (handleSuggestionKey(event)) return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLocaleLowerCase("en-US") === "b") {
      event.preventDefault();
      applyFormat("bold");
    } else if (event.key.toLocaleLowerCase("en-US") === "i") {
      event.preventDefault();
      applyFormat("italic");
    }
  };
  textarea.addEventListener("input", () => {
    state.article = textarea.value;
    selectedSuggestion = 0;
    updateSuggestions();
  });
  formatted.addEventListener("input", () => {
    syncFromFormatted();
    selectedSuggestion = 0;
    updateSuggestions();
  });
  textarea.addEventListener("keydown", handleEditorKey);
  formatted.addEventListener("keydown", handleEditorKey);
  textarea.addEventListener("click", updateSuggestions);
  formatted.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("a"))
      event.preventDefault();
    updateSuggestions();
  });
  wrapper.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) hideSuggestions();
    });
  });
  setMode(false);
  appendChildren(tabs, formattedButton, markdownButton);
  appendChildren(
    wrapper,
    toolbar,
    tabs,
    textarea,
    formatted,
    suggestions,
    externalLinkPanel,
  );
  return wrapper;
}

function renderForm(
  root: HTMLElement,
  state: ContributionState,
  options: ContributionOptions,
  showErrors: string[] = [],
) {
  const rerender = () => renderForm(root, state, options);
  const form = create("form", "contribution-form") as HTMLFormElement;
  form.noValidate = true;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const errors = validateState(state, options);
    if (errors.length) {
      renderForm(root, state, options, errors);
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    state.reviewPayload = buildPayload(state);
    renderReview(root, state, options);
  });
  if (showErrors.length) {
    const error = create("div", "contribution-error");
    error.setAttribute("role", "alert");
    error.append(create("strong", "", "Please correct the following:"));
    const list = document.createElement("ul");
    for (const message of showErrors) list.append(create("li", "", message));
    error.append(list);
    form.append(error);
  }
  form.append(contributorEditor(state, options));
  if (state.kind === "edit-mod" || state.kind === "edit-location") {
    const locked = textInput(state.targetPath, () => {});
    locked.readOnly = true;
    form.append(field("Locked repository path", locked));
  }

  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    const details = fieldset("Mod page");
    const title = textInput(
      state.title,
      (value) => {
        state.title = value;
        if (state.kind === "new-mod") {
          state.slug = slugifyWikiFilename(value);
          slugInput.value = state.slug;
        }
      },
      { required: true, maxLength: 200 },
    );
    const slugInput = textInput(state.slug, () => {}, {
      required: true,
      maxLength: 120,
    });
    slugInput.readOnly = true;
    details.append(field("Mod title", title));
    if (state.kind === "new-mod") {
      const filename = create("div", "contribution-filename");
      appendChildren(filename, slugInput, create("span", "", ".md"));
      details.append(
        field(
          "Page filename",
          filename,
          "Generated automatically from the mod title. The final path will be wiki/content/mods/<filename>.md.",
        ),
      );
    }
    details.append(authorEditor(state, rerender));
    details.append(
      field(
        "Download URL",
        textInput(
          state.url,
          (value) => {
            state.url = value;
          },
          { required: true, maxLength: 2_000, type: "url" },
        ),
        "Required. Nexus Mods links are enriched automatically when this flow starts from the plugin parser.",
      ),
    );
    details.append(
      field(
        "Picture URL (optional)",
        textInput(
          state.pictureUrl,
          (value) => {
            state.pictureUrl = value;
          },
          { maxLength: 2_000 },
        ),
      ),
    );
    details.append(
      field(
        "Showcase URL (optional)",
        textInput(
          state.showcaseUrl,
          (value) => {
            state.showcaseUrl = value;
          },
          { maxLength: 2_000 },
        ),
      ),
    );
    const category = document.createElement("select");
    category.required = true;
    category.append(new Option("Choose a category", ""));
    for (const value of options.categories)
      category.append(
        new Option(value, value, false, value === state.category),
      );
    category.value = state.category;
    category.addEventListener("change", () => {
      state.category = category.value;
    });
    details.append(field("Category", category));
    details.append(
      field(
        "Events (optional)",
        eventSelect(state, options),
        "Choose one controlled event, if applicable. Legacy values are available only for this existing page.",
      ),
    );
    const mapToggle = document.createElement("input");
    mapToggle.type = "checkbox";
    mapToggle.checked = state.mapEnabled;
    mapToggle.addEventListener("change", () => {
      state.mapEnabled = mapToggle.checked;
      if (!state.mapEnabled) {
        state.mapLocations = [];
        state.mapExteriorEdits = [];
        state.newLocations = [];
        state.locationVariants = [];
        state.mapLocationChanges = [];
        for (const component of state.components) {
          component.mapLocations = [];
          component.mapExteriorEdits = [];
        }
        state.mapPluginMessage = "";
        state.mapPluginError = false;
      }
      rerender();
    });
    const mapLabel = document.createElement("label");
    mapLabel.className = "contribution-inline";
    appendChildren(
      mapLabel,
      mapToggle,
      document.createTextNode("Include this mod on the TES3 Mod Map"),
    );
    details.append(mapLabel);
    if (state.mapEnabled)
      details.append(
        field(
          "Map coverage",
          mapLocationEditor(root, state, options, rerender),
          "Select wiki locations, add exterior cell coordinates, or prepopulate both from a plugin file.",
        ),
      );
    const componentsToggle = document.createElement("input");
    componentsToggle.type = "checkbox";
    componentsToggle.checked = state.componentsEnabled;
    componentsToggle.addEventListener("change", () => {
      state.componentsEnabled = componentsToggle.checked;
      state.componentsTouched = true;
      if (state.componentsEnabled && state.components.length === 0) {
        state.components.push(blankComponent());
      }
      rerender();
    });
    const componentsLabel = document.createElement("label");
    componentsLabel.className = "contribution-inline";
    appendChildren(
      componentsLabel,
      componentsToggle,
      document.createTextNode(
        "Does this download contain alternate versions, patches, translations, or optional plugins?",
      ),
    );
    details.append(componentsLabel);
    if (state.componentsEnabled)
      details.append(componentEditor(root, state, options, rerender));
    if (state.newLocations.length > 0)
      details.append(newLocationCollectionEditor(state, rerender));
    form.append(details);
  } else {
    const details = fieldset("Map location");
    const cell = textInput(
      state.cell,
      (value) => {
        state.cell = value;
      },
      { required: true, maxLength: 300 },
    );
    details.append(field("Cell name", cell));
    details.append(
      field(
        "Region (optional)",
        textInput(
          state.region,
          (value) => {
            state.region = value;
          },
          { maxLength: 200 },
        ),
      ),
    );
    const coordinates = create("div", "contribution-coordinates");
    coordinates.append(
      field(
        "X coordinate",
        textInput(
          state.x,
          (value) => {
            state.x = value;
          },
          { required: true },
        ),
      ),
      field(
        "Y coordinate",
        textInput(
          state.y,
          (value) => {
            state.y = value;
          },
          { required: true },
        ),
      ),
    );
    details.append(
      coordinates,
      create(
        "p",
        "contribution-help",
        "Enter the TES3 world coordinates for the location entrance.",
      ),
    );
    details.append(
      field(
        "UESP URL (optional)",
        textInput(
          state.uespUrl,
          (value) => {
            state.uespUrl = value;
          },
          { maxLength: 2_000 },
        ),
      ),
    );
    details.append(entranceEditor(state, rerender));
    form.append(details);
  }

  const article = fieldset("Article");
  article.append(markdownEditor(state, options));
  form.append(article);
  const website = textInput(state.website, (value) => {
    state.website = value;
  });
  website.name = "website";
  website.autocomplete = "off";
  website.tabIndex = -1;
  const honeypot = field("Website", website);
  honeypot.classList.add("contribution-honeypot");
  form.append(honeypot, notice());
  const actions = create("div", "contribution-actions");
  if (state.kind === "new-mod") {
    actions.append(
      makeButton("Back to choices", () => renderChoices(root, options)),
    );
  }
  const review = makeButton(
    "Review submission",
    () => {},
    "contribution-button contribution-button-primary",
  );
  review.type = "submit";
  actions.append(review);
  form.append(actions);
  root.replaceChildren(
    intro(root),
    create("h2", "", TYPE_LABELS[state.kind]),
    form,
  );
}

function reviewDefinition(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  appendChildren(
    fragment as unknown as HTMLElement,
    create("dt", "", label),
    create("dd", "", value || "—"),
  );
  return fragment;
}

function loadTurnstile(): Promise<void> {
  if ((window as any).turnstile) return Promise.resolve();
  if (turnstileLoader) return turnstileLoader;
  turnstileLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Human verification could not be loaded.")),
      { once: true },
    );
    document.head.append(script);
  });
  return turnstileLoader;
}

function renderReview(
  root: HTMLElement,
  state: ContributionState,
  options: ContributionOptions,
) {
  const review = create("section", "contribution-review");
  review.append(create("h2", "", "Review your submission"));
  const details = document.createElement("dl");
  details.append(reviewDefinition("Contributor", state.contributorName));
  details.append(reviewDefinition("Submission type", TYPE_LABELS[state.kind]));
  if (state.targetPath)
    details.append(reviewDefinition("Locked target path", state.targetPath));
  if (state.kind === "new-mod")
    details.append(
      reviewDefinition("Generated path", `wiki/content/mods/${state.slug}.md`),
    );
  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    details.append(
      reviewDefinition("Mod title", state.title),
      reviewDefinition("Authors", state.authors.join(", ")),
      reviewDefinition("Download URL", state.url),
      reviewDefinition("Picture URL", state.pictureUrl),
      reviewDefinition("Showcase URL", state.showcaseUrl),
      reviewDefinition("Category", state.category),
      reviewDefinition("Events", state.events.join(", ")),
      reviewDefinition(
        "TES3 Mod Map",
        state.mapEnabled ? "Included" : "Not included",
      ),
      reviewDefinition("Map locations", state.mapLocations.join(", ")),
      reviewDefinition(
        "Exterior cells",
        state.mapExteriorEdits
          .map(
            (edit) =>
              `(${edit.cell}: ${edit.landscape ? "LAND, " : ""}${edit.references} refs)`,
          )
          .join(", "),
      ),
      reviewDefinition(
        "Installable components",
        state.componentsEnabled
          ? state.components
              .map((component) => `${component.name} (${component.type})`)
              .join(", ")
          : "None",
      ),
      reviewDefinition(
        "New locations",
        state.newLocations.length > 0
          ? state.newLocations
              .map((location) => `${location.cell}: ${location.description}`)
              .join("; ")
          : "None",
      ),
      reviewDefinition(
        "Location variants",
        state.locationVariants.length > 0
          ? state.locationVariants
              .map(
                (variant) =>
                  `${variant.cell}: ${variant.mode === "main" ? "make main" : variant.mode === "entrance" ? `add entrances from ${variant.plugin}` : `variant for ${variant.plugin}`}`,
              )
              .join("; ")
          : "None",
      ),
    );
  } else {
    details.append(
      reviewDefinition("Cell name", state.cell),
      reviewDefinition("Region", state.region),
      reviewDefinition("Coordinates", `${state.x}, ${state.y}`),
      reviewDefinition("UESP URL", state.uespUrl),
      reviewDefinition(
        "Additional entrances",
        state.entrances
          .map(
            (entrance) =>
              `${entrance.x}, ${entrance.y}${entrance.region ? ` (${entrance.region})` : ""}`,
          )
          .join("; "),
      ),
    );
  }
  review.append(details, create("h3", "", "Article preview"));
  const preview = create("div", "contribution-preview");
  renderMarkdown(state.article, preview, options.wikiPages);
  const source = create("pre", "contribution-source");
  source.textContent = String(state.reviewPayload?.generatedMarkdown ?? "");
  review.append(
    preview,
    create("h3", "", "Complete generated Markdown source"),
    source,
    notice(),
  );
  const reviewWebsite = textInput(state.website, (value) => {
    state.website = value;
  });
  reviewWebsite.name = "website";
  reviewWebsite.autocomplete = "off";
  reviewWebsite.tabIndex = -1;
  const reviewHoneypot = field("Website", reviewWebsite);
  reviewHoneypot.classList.add("contribution-honeypot");
  const turnstileHost = create("div", "contribution-turnstile");
  const submitError = create("p", "contribution-error");
  submitError.hidden = true;
  submitError.setAttribute("role", "alert");
  const actions = create("div", "contribution-actions");
  const back = makeButton("Back to edit", () => {
    const turnstile = (window as any).turnstile;
    if (turnstile && widgetId !== null) turnstile.remove(widgetId);
    renderForm(root, state, options);
  });
  const submit = makeButton(
    "Submit for review",
    () => submitReview(),
    "contribution-button contribution-button-primary",
  );
  submit.disabled = true;
  const download = makeButton("Download Markdown File", () =>
    downloadMarkdownFile(state),
  );
  actions.append(back, download, submit);
  review.append(reviewHoneypot, turnstileHost, submitError, actions);
  root.replaceChildren(intro(root), review);

  let token = "";
  let widgetId: string | number | null = null;
  const resetTurnstile = () => {
    token = "";
    submit.disabled = true;
    const turnstile = (window as any).turnstile;
    if (turnstile && widgetId !== null) turnstile.reset(widgetId);
  };
  const showSubmitError = (message: string) => {
    submitError.textContent = message;
    submitError.hidden = false;
  };
  const submitReview = async () => {
    if (!token || submit.disabled || !state.reviewPayload) return;
    submit.disabled = true;
    submit.textContent = "Submitting…";
    submitError.hidden = true;
    const websiteInput = root.querySelector<HTMLInputElement>(
      'input[name="website"]',
    );
    try {
      const response = await fetch(WORKER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnstileToken: token,
          startedAt: state.startedAt,
          website: websiteInput?.value ?? "",
          payload: state.reviewPayload,
        }),
      });
      let result: any = null;
      try {
        result = await response.json();
      } catch {
        /* generic error below */
      }
      if (
        !response.ok ||
        result?.ok !== true ||
        typeof result.submissionId !== "string" ||
        !/^[0-9a-f-]{36}$/iu.test(result.submissionId)
      ) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "Submission could not be sent. Please try again.",
        );
      }
      const message = `Submission accepted. Thank you!`;
      persistContributorPreference(state);
      clearTrackedContributionState();
      Object.assign(state, blankState(state.kind));
      root.replaceChildren(
        intro(root),
        create("p", "contribution-success", message),
      );
    } catch (error) {
      showSubmitError(
        error instanceof Error
          ? error.message
          : "Submission could not be sent. Please try again.",
      );
      submit.textContent = "Submit for review";
      resetTurnstile();
    }
  };
  loadTurnstile()
    .then(() => {
      if (!document.documentElement.contains(turnstileHost)) return;
      widgetId = (window as any).turnstile.render(turnstileHost, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "wiki_contribution",
        callback: (value: string) => {
          token = value;
          submit.disabled = false;
        },
        "expired-callback": resetTurnstile,
        "error-callback": () => {
          resetTurnstile();
          showSubmitError(
            "Human verification could not be completed. Please try again.",
          );
        },
      });
    })
    .catch((error) =>
      showSubmitError(
        error instanceof Error
          ? error.message
          : "Human verification could not be loaded.",
      ),
    );
}

function renderChoices(root: HTMLElement, options: ContributionOptions) {
  clearTrackedContributionState();
  const choices = create("div", "contribution-choices");
  const mod = create("button", "contribution-choice") as HTMLButtonElement;
  mod.type = "button";
  appendChildren(
    mod,
    create("strong", "", "Add a new mod page"),
    document.createTextNode(
      "Propose a structured mod article for maintainer review.",
    ),
  );
  mod.addEventListener("click", () => {
    const state = blankState("new-mod");
    trackContributionState(state);
    renderForm(root, state, options);
  });
  choices.append(mod);
  root.replaceChildren(intro(root), choices, notice());
}

async function initializeContributionForm() {
  const root = document.querySelector<HTMLElement>("[data-wiki-contribution]");
  if (!root) return;
  const editPath = new URL(window.location.href).searchParams.get("edit");
  const routeKey = editPath ?? "";
  if (root.dataset.initializedFor === routeKey) return;
  root.dataset.initializedFor = routeKey;
  try {
    const response = await fetch("/wiki/static/contribution-options.json", {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Contribution options could not be loaded.");
    const options = (await response.json()) as ContributionOptions;
    if (
      options.schemaVersion !== 4 ||
      !Array.isArray(options.contributors) ||
      !Array.isArray(options.categories) ||
      !Array.isArray(options.events) ||
      !Array.isArray(options.mapLocations) ||
      !Array.isArray(options.mapLocationDetails) ||
      !Array.isArray(options.modSlugs) ||
      !Array.isArray(options.mods) ||
      !Array.isArray(options.componentTypes) ||
      !Array.isArray(options.relationshipTypes)
    ) {
      throw new Error("Contribution options are invalid.");
    }
    if (!editPath) {
      renderChoices(root, options);
      return;
    }
    root.replaceChildren(
      intro(root),
      create(
        "p",
        "wiki-contribution-loading",
        "Loading the current wiki source…",
      ),
    );
    const state = await loadEditState(editPath, options);
    trackContributionState(state);
    renderForm(root, state, options);
  } catch (error) {
    root.replaceChildren(
      intro(root),
      create(
        "p",
        "contribution-error",
        error instanceof Error
          ? error.message
          : "The contribution form could not be loaded.",
      ),
    );
  }
}

document.addEventListener("nav", initializeContributionForm);
