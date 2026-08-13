import modderRegistry from "../../../assets/data/modders.json";
import {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "./types";

type Modder = {
  id: string;
  name: string;
  aliases?: string[];
};

type ModRelation = {
  type: string;
  target: string;
};

type ModComponent = {
  id: string;
  name: string;
  type: string;
  plugins: string[];
  relations: ModRelation[];
  mapLocations: string[];
  notes: string;
};

type ResolvedRelation = ModRelation & {
  sourceMod: string;
  sourceTitle: string;
  sourceComponent: ModComponent | null;
  targetTitle: string;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(isNonEmptyString).map((value) => value.trim())
    : [];

const relationList = (value: unknown): ModRelation[] =>
  Array.isArray(value)
    ? value
        .filter(
          (relation): relation is Record<string, unknown> =>
            relation !== null &&
            typeof relation === "object" &&
            !Array.isArray(relation),
        )
        .filter(
          (relation) =>
            isNonEmptyString(relation.type) &&
            isNonEmptyString(relation.target),
        )
        .map((relation) => ({
          type: String(relation.type).trim(),
          target: String(relation.target).trim(),
        }))
    : [];

const componentList = (value: unknown): ModComponent[] =>
  Array.isArray(value)
    ? value
        .filter(
          (component): component is Record<string, unknown> =>
            component !== null &&
            typeof component === "object" &&
            !Array.isArray(component),
        )
        .filter(
          (component) =>
            isNonEmptyString(component.id) &&
            isNonEmptyString(component.name) &&
            isNonEmptyString(component.type),
        )
        .map((component) => ({
          id: String(component.id).trim(),
          name: String(component.name).trim(),
          type: String(component.type).trim(),
          plugins: stringList(component.plugins),
          relations: relationList(component.relations),
          mapLocations: stringList(component.map_locations),
          notes: isNonEmptyString(component.notes)
            ? component.notes.trim()
            : "",
        }))
    : [];

const identityKey = (value: string): string =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "");

const profilesByName = new Map<string, Modder>();
for (const profile of modderRegistry.modders as Modder[]) {
  for (const name of [profile.name, ...(profile.aliases ?? [])]) {
    profilesByName.set(identityKey(name), profile);
  }
}

const eventProfileUrl = (author: string, events: string[]): string | null => {
  const profile = profilesByName.get(identityKey(author));
  if (!profile) return null;
  for (const event of events) {
    const normalizedEvent = event.toLocaleLowerCase("en-US");
    if (normalizedEvent.includes("modathon"))
      return `/modathon/modder/${encodeURIComponent(profile.id)}`;
    if (normalizedEvent.includes("modjam"))
      return `/modjam/modder/${encodeURIComponent(profile.id)}`;
    if (normalizedEvent.includes("madness")) {
      return `/madness/modder?name=${encodeURIComponent(profile.name)}`;
    }
  }
  return null;
};

const relationLabels: Record<string, { outgoing: string; incoming: string }> = {
  requires: { outgoing: "Requires", incoming: "Required by" },
  patch_for: { outgoing: "Patches", incoming: "Available patch" },
  variant_of: { outgoing: "Variant of", incoming: "Available variant" },
  translation_of: {
    outgoing: "Translation of",
    incoming: "Available translation",
  },
  compatible_with: { outgoing: "Compatible with", incoming: "Compatible with" },
  incompatible_with: {
    outgoing: "Incompatible with",
    incoming: "Incompatible with",
  },
};

const ModDetails: QuartzComponent = ({
  fileData,
  allFiles,
}: QuartzComponentProps) => {
  if (!fileData.slug?.startsWith("mods/")) return null;

  const frontmatter = fileData.frontmatter as
    | Record<string, unknown>
    | undefined;
  const components = componentList(frontmatter?.components);
  const authors = stringList(frontmatter?.authors);
  const categories = stringList(frontmatter?.categories);
  const events = stringList(frontmatter?.events);
  const exteriorCells = stringList(frontmatter?.map_exterior_cells);
  const locationKeys = new Set(
    stringList(frontmatter?.map_locations).map(identityKey),
  );
  const locations = allFiles
    .filter((file) => {
      if (!file.slug?.startsWith("locations/")) return false;
      const data = file.frontmatter as Record<string, unknown> | undefined;
      return [data?.title, data?.cell].some(
        (value) =>
          isNonEmptyString(value) && locationKeys.has(identityKey(value)),
      );
    })
    .sort((left, right) =>
      String(left.frontmatter?.title).localeCompare(
        String(right.frontmatter?.title),
      ),
    );
  const downloadUrl = isNonEmptyString(frontmatter?.url)
    ? frontmatter.url
    : null;
  const pictureUrl = isNonEmptyString(frontmatter?.picture_url)
    ? frontmatter.picture_url
    : null;
  const showcaseUrl = isNonEmptyString(frontmatter?.showcase_url)
    ? frontmatter.showcase_url
    : null;
  const mapEnabled = frontmatter?.map_enabled === true;
  const modId = fileData.slug.slice("mods/".length);
  const hasComponentMapLocations = components.some(
    (component) => component.mapLocations.length > 0,
  );
  const hasLinks =
    mapEnabled ||
    hasComponentMapLocations ||
    downloadUrl !== null ||
    showcaseUrl !== null;

  const modFiles = allFiles.filter((file) => file.slug?.startsWith("mods/"));
  const modById = new Map(
    modFiles.map((file) => [
      file.slug!.slice("mods/".length),
      {
        title: String(file.frontmatter?.title ?? file.slug),
      },
    ]),
  );
  const resolvedRelations: ResolvedRelation[] = [];
  for (const sourceFile of modFiles) {
    const sourceMod = sourceFile.slug!.slice("mods/".length);
    const sourceFrontmatter = sourceFile.frontmatter as
      | Record<string, unknown>
      | undefined;
    const sourceTitle = String(sourceFrontmatter?.title ?? sourceMod);
    for (const relation of relationList(sourceFrontmatter?.relations)) {
      const target = modById.get(relation.target);
      if (target) {
        resolvedRelations.push({
          ...relation,
          sourceMod,
          sourceTitle,
          sourceComponent: null,
          targetTitle: target.title,
        });
      }
    }
    for (const sourceComponent of componentList(
      sourceFrontmatter?.components,
    )) {
      for (const relation of sourceComponent.relations) {
        const target = modById.get(relation.target);
        if (target) {
          resolvedRelations.push({
            ...relation,
            sourceMod,
            sourceTitle,
            sourceComponent,
            targetTitle: target.title,
          });
        }
      }
    }
  }
  const relatedToThisMod = resolvedRelations.filter(
    (relation) => relation.sourceMod === modId || relation.target === modId,
  );

  const componentLocationLinks = (component: ModComponent) =>
    component.mapLocations.map((locationName, index) => {
      const key = identityKey(locationName);
      const location = allFiles.find((file) => {
        if (!file.slug?.startsWith("locations/")) return false;
        const data = file.frontmatter as Record<string, unknown> | undefined;
        return [data?.title, data?.cell].some(
          (value) => isNonEmptyString(value) && identityKey(value) === key,
        );
      });
      return (
        <>
          {index > 0 && ", "}
          {location ? (
            <a href={`/wiki/${location.slug}`}>{locationName}</a>
          ) : (
            locationName
          )}
        </>
      );
    });

  const renderRelationshipSection = (title: string, types: string[]) => {
    const relations = relatedToThisMod.filter((relation) =>
      types.includes(relation.type),
    );
    if (relations.length === 0) return null;
    return (
      <section class="mod-relationship-section">
        <h2>{title}</h2>
        <ul>
          {relations.map((relation) => {
            const outgoing = relation.sourceMod === modId;
            const relatedModId = outgoing
              ? relation.target
              : relation.sourceMod;
            const relatedTitle = outgoing
              ? relation.targetTitle
              : relation.sourceTitle;
            const component = relation.sourceComponent;
            return (
              <li>
                <span class={`mod-relation-type mod-relation-${relation.type}`}>
                  {relationLabels[relation.type]?.[
                    outgoing ? "outgoing" : "incoming"
                  ] ?? relation.type}
                </span>{" "}
                <a href={`/wiki/mods/${relatedModId}`}>{relatedTitle}</a>
                {component && (
                  <span class="mod-relation-component">
                    {" "}
                    — {component.name} ({component.type})
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <>
      <aside class="mod-details" aria-label="Mod details">
        {pictureUrl && (
          <a
            class="mod-details-picture"
            href={downloadUrl ?? pictureUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={pictureUrl}
              alt={`Nexus Mods image for ${String(frontmatter?.title ?? "this mod")}`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </a>
        )}
        <div class="mod-details-copy">
          {(authors.length > 0 ||
            categories.length > 0 ||
            events.length > 0 ||
            locations.length > 0 ||
            exteriorCells.length > 0 ||
            hasLinks) && (
            <dl>
              {authors.length > 0 && (
                <>
                  <dt>{authors.length === 1 ? "Author" : "Authors"}</dt>
                  <dd>
                    {authors.map((author, index) => {
                      const profileUrl = eventProfileUrl(author, events);
                      return (
                        <>
                          {index > 0 && ", "}
                          {profileUrl ? (
                            <a
                              href={profileUrl}
                              class="external"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {author}
                            </a>
                          ) : (
                            author
                          )}
                        </>
                      );
                    })}
                  </dd>
                </>
              )}
              {events.length > 0 && (
                <>
                  <dt>{events.length === 1 ? "Event" : "Events"}</dt>
                  <dd>{events.join(", ")}</dd>
                </>
              )}
              {categories.length > 0 && (
                <>
                  <dt>{categories.length === 1 ? "Category" : "Categories"}</dt>
                  <dd>{categories.join(", ")}</dd>
                </>
              )}
              {locations.length > 0 && (
                <>
                  <dt>{locations.length === 1 ? "Location" : "Locations"}</dt>
                  <dd>
                    {locations.map((location, index) => (
                      <>
                        {index > 0 && ", "}
                        <a href={`/wiki/${location.slug}`}>
                          {location.frontmatter?.title}
                        </a>
                      </>
                    ))}
                  </dd>
                </>
              )}
              {exteriorCells.length > 0 && (
                <>
                  <dt>
                    {exteriorCells.length === 1
                      ? "Exterior cell"
                      : "Exterior cells"}
                  </dt>
                  <dd>
                    {exteriorCells.map((cell, index) => (
                      <>
                        {index > 0 && ", "}
                        <a
                          href={`/map/?mod=${encodeURIComponent(modId)}&cell=${encodeURIComponent(cell)}`}
                        >
                          ({cell})
                        </a>
                      </>
                    ))}
                  </dd>
                </>
              )}
              {hasLinks && (
                <>
                  <dt>Links</dt>
                  <dd class="mod-details-links">
                    {(mapEnabled || hasComponentMapLocations) && (
                      <a
                        href={`/map/?mod=${encodeURIComponent(modId)}`}
                        aria-label="View on TES3 Mod Map"
                        title="TES3 Mod Map"
                      >
                        <span class="mod-details-map-icon" aria-hidden="true" />
                      </a>
                    )}
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View on Nexus Mods"
                        title="Nexus Mods"
                      >
                        <img src="/assets/images/resources/nexus.webp" alt="" />
                      </a>
                    )}
                    {showcaseUrl && (
                      <a
                        href={showcaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Watch the mod showcase on YouTube"
                        title="YouTube showcase"
                      >
                        <img
                          src="/assets/images/resources/youtube.webp"
                          alt=""
                        />
                      </a>
                    )}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      </aside>
      {components.length > 0 && (
        <section class="mod-install-options">
          <h2>Install Options</h2>
          <div class="mod-component-list">
            {components.map((component) => (
              <article class="mod-component" id={`component-${component.id}`}>
                <header>
                  <h3>{component.name}</h3>
                  <span
                    class={`mod-component-type mod-component-${component.type}`}
                  >
                    {component.type}
                  </span>
                </header>
                {component.plugins.length > 0 && (
                  <p>
                    <strong>Plugins:</strong>{" "}
                    {component.plugins.map((plugin, index) => (
                      <>
                        {index > 0 && ", "}
                        <code>{plugin}</code>
                      </>
                    ))}
                  </p>
                )}
                {component.relations.length > 0 && (
                  <p>
                    <strong>Related mods:</strong>{" "}
                    {component.relations.map((relation, index) => {
                      const target = modById.get(relation.target);
                      return (
                        <>
                          {index > 0 && "; "}
                          {relationLabels[relation.type]?.outgoing ??
                            relation.type}{" "}
                          <a href={`/wiki/mods/${relation.target}`}>
                            {target?.title ?? relation.target}
                          </a>
                        </>
                      );
                    })}
                  </p>
                )}
                {component.mapLocations.length > 0 && (
                  <p>
                    <strong>Map locations:</strong>{" "}
                    {componentLocationLinks(component)}
                  </p>
                )}
                {component.notes && (
                  <p class="mod-component-notes">{component.notes}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {renderRelationshipSection("Requirements", ["requires"])}
      {renderRelationshipSection("Patches", ["patch_for"])}
      {renderRelationshipSection("Variants", ["variant_of"])}
      {renderRelationshipSection("Translations", ["translation_of"])}
      {renderRelationshipSection("Compatibility", [
        "compatible_with",
        "incompatible_with",
      ])}
    </>
  );
};

ModDetails.css = `
.mod-details {
  box-sizing: border-box;
  float: right;
  width: min(19rem, 42%);
  margin: .35rem 0 1.35rem 1.4rem;
  padding: .65rem;
  background: var(--highlight);
  border: 1px solid var(--lightgray);
  border-radius: 3px;
}

.mod-details dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: .35rem .7rem;
  margin: 0;
}

.mod-details dt {
  color: var(--gray);
  font-family: var(--bodyFont);
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.mod-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.mod-details-links {
  display: flex;
  align-items: center;
  gap: .55rem;
}

.mod-details-links a {
  display: inline-flex;
  width: 1.7rem;
  height: 1.7rem;
  align-items: center;
  justify-content: center;
  color: var(--secondary);
  transition: opacity .15s ease, transform .15s ease;
}

.mod-details-links a:hover,
.mod-details-links a:focus-visible {
  opacity: .8;
  transform: translateY(-1px);
}

.mod-details-links img {
  display: block;
  width: 1.5rem;
  height: 1.5rem;
  object-fit: contain;
}

.mod-details-map-icon {
  position: relative;
  display: block;
  width: 14px;
  height: 17px;
}

.mod-details-map-icon::before {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 11px;
  height: 11px;
  border-radius: 50% 50% 50% 0;
  background: currentColor;
  content: "";
  transform: rotate(-45deg);
}

.mod-details-map-icon::after {
  position: absolute;
  top: 5px;
  left: 5px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #1e1b19;
  content: "";
}

.mod-details-picture {
  display: block;
  overflow: hidden;
  margin-bottom: .75rem;
  border: 1px solid var(--lightgray);
  border-radius: 2px;
  background: var(--light);
}

.mod-details-picture img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 280px;
  object-fit: cover;
}

.mod-install-options,
.mod-relationship-section {
  margin: 1.4rem 0;
}

.mod-component-list {
  display: grid;
  gap: .8rem;
}

.mod-component {
  padding: .8rem 1rem;
  border: 1px solid var(--lightgray);
  border-radius: 3px;
  background: color-mix(in srgb, var(--highlight) 55%, transparent);
}

.mod-component header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.mod-component h3,
.mod-component p {
  margin: 0;
}

.mod-component p + p {
  margin-top: .45rem;
}

.mod-component-type,
.mod-relation-type {
  display: inline-block;
  padding: .08rem .4rem;
  border: 1px solid var(--lightgray);
  border-radius: 999px;
  color: var(--darkgray);
  font-family: var(--bodyFont);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.mod-component-notes {
  color: var(--darkgray);
}

.mod-relationship-section ul {
  margin-top: .45rem;
}

.mod-relation-incompatible_with {
  border-color: #a54b43;
  color: #a54b43;
}

.mod-relation-component {
  color: var(--darkgray);
}

.center > article::after {
  display: block;
  clear: both;
  content: "";
}

@media (max-width: 800px) {
  .mod-details {
    float: none;
    width: 100%;
    margin: 1rem 0 1.5rem;
  }
}

@media (max-width: 520px) {
  .mod-details dl { grid-template-columns: 1fr; gap: .1rem; }
  .mod-details dd + dt { margin-top: .5rem; }
}
`;

export default (() => ModDetails) satisfies QuartzComponentConstructor;
