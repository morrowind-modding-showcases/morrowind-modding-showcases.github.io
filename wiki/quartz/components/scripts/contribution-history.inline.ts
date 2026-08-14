type ContributionKind = "new-mod" | "edit-mod" | "edit-location";

type ContributionRecord = {
  schemaVersion: 1;
  submissionId: string;
  contributor: string;
  submittedAt: string;
  kind: ContributionKind;
  pagePath: string;
  pageTitle: string;
};

type ContributionHistory = {
  schemaVersion: 1;
  contributors: string[];
  contributions: ContributionRecord[];
};

const WINDOWS = [1, 3, 7, 14, 30, 90] as const;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}

function normalizedName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function pageHref(pagePath: string): string {
  return `/${pagePath.replace(/^wiki\/content\//u, "wiki/").replace(/\.md$/u, "")}`;
}

function actionLabel(kind: ContributionKind): string {
  if (kind === "new-mod") return "Added";
  return "Updated";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function renderLeaderboard(root: HTMLElement, history: ContributionHistory) {
  const intro = element(
    "p",
    "contribution-history-intro",
    "Accepted wiki submissions are counted by their public contributor name and submission date.",
  );
  const controls = element("div", "contribution-history-controls");
  controls.setAttribute("aria-label", "Leaderboard period");
  const results = element("div", "contribution-history-results");
  let mode: "month" | "year" | "all" = "all";

  const buttons = (
    [
      ["month", "Month (30 days)"],
      ["year", "Year (365 days)"],
      ["all", "All time"],
    ] as const
  ).map(([value, label]) => {
    const button = element("button", "contribution-history-button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      mode = value;
      update();
    });
    controls.append(button);
    return { value, button };
  });

  const update = () => {
    for (const item of buttons) {
      item.button.setAttribute("aria-pressed", String(item.value === mode));
    }
    const windowDays = mode === "month" ? 30 : mode === "year" ? 365 : null;
    const cutoff =
      windowDays === null
        ? null
        : Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const records = history.contributions.filter((record) => {
      return cutoff === null || Date.parse(record.submittedAt) >= cutoff;
    });
    const grouped = new Map<string, { contributor: string; count: number }>();
    for (const record of records) {
      const key = normalizedName(record.contributor);
      const current = grouped.get(key) ?? {
        contributor: record.contributor,
        count: 0,
      };
      current.count += 1;
      grouped.set(key, current);
    }
    const leaders = [...grouped.values()].sort(
      (left, right) =>
        right.count - left.count ||
        left.contributor.localeCompare(right.contributor, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
    );
    results.replaceChildren();
    const summary = element(
      "p",
      "contribution-history-summary",
      `${records.length} accepted ${records.length === 1 ? "change" : "changes"} from ${leaders.length} ${leaders.length === 1 ? "contributor" : "contributors"}.`,
    );
    results.append(summary);
    if (leaders.length === 0) {
      results.append(
        element(
          "p",
          "contribution-history-empty",
          "No accepted contributions in this period.",
        ),
      );
      return;
    }
    const tableWrap = element("div", "contribution-leaderboard-wrap");
    const table = element("table", "contribution-leaderboard");
    const head = element("thead");
    const headRow = element("tr");
    for (const label of ["Rank", "Contributor", "Changes"]) {
      const cell = element("th", "", label);
      cell.scope = "col";
      headRow.append(cell);
    }
    head.append(headRow);
    const body = element("tbody");
    let rank = 0;
    let previousCount = -1;
    for (const [index, leader] of leaders.entries()) {
      if (leader.count !== previousCount) rank = index + 1;
      previousCount = leader.count;
      const row = element("tr");
      row.append(
        element("td", "contribution-rank", String(rank)),
        element("td", "", leader.contributor),
        element("td", "contribution-count", String(leader.count)),
      );
      body.append(row);
    }
    table.append(head, body);
    tableWrap.append(table);
    results.append(tableWrap);
  };
  root.replaceChildren(intro, controls, results);
  update();
}

function renderRecentChanges(root: HTMLElement, history: ContributionHistory) {
  const intro = element(
    "p",
    "contribution-history-intro",
    "A running list of accepted wiki submissions, shown by submission date.",
  );
  const controls = element("div", "contribution-history-controls");
  controls.setAttribute("aria-label", "Recent changes time window");
  const results = element("div", "contribution-history-results");
  let selectedDays = 7;
  const buttons = WINDOWS.map((days) => {
    const label = `${days} ${days === 1 ? "day" : "days"}`;
    const button = element("button", "contribution-history-button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      selectedDays = days;
      update();
    });
    controls.append(button);
    return { days, button };
  });

  const update = () => {
    for (const item of buttons) {
      item.button.setAttribute(
        "aria-pressed",
        String(item.days === selectedDays),
      );
    }
    const cutoff = Date.now() - selectedDays * 24 * 60 * 60 * 1000;
    const records = history.contributions.filter(
      (record) => Date.parse(record.submittedAt) >= cutoff,
    );
    results.replaceChildren();
    results.append(
      element(
        "p",
        "contribution-history-summary",
        `${records.length} accepted ${records.length === 1 ? "change" : "changes"} in the last ${selectedDays} ${selectedDays === 1 ? "day" : "days"}.`,
      ),
    );
    if (records.length === 0) {
      results.append(
        element(
          "p",
          "contribution-history-empty",
          "No accepted contributions in this window.",
        ),
      );
      return;
    }
    const list = element("ol", "contribution-change-list");
    for (const record of records) {
      const item = element("li", "contribution-change");
      const heading = element("div", "contribution-change-heading");
      const action = element(
        "span",
        "contribution-change-action",
        actionLabel(record.kind),
      );
      const link = element("a", "internal", record.pageTitle);
      link.href = pageHref(record.pagePath);
      heading.append(action, link);
      const meta = element(
        "p",
        "contribution-change-meta",
        `${formatDate(record.submittedAt)} - ${record.contributor}`,
      );
      item.append(heading, meta);
      list.append(item);
    }
    results.append(list);
  };
  root.replaceChildren(intro, controls, results);
  update();
}

async function initializeContributionHistory() {
  const root = document.querySelector<HTMLElement>("[data-contribution-view]");
  if (!root) return;
  const view = root.dataset.contributionView ?? "";
  if (root.dataset.initializedFor === view) return;
  root.dataset.initializedFor = view;
  try {
    const response = await fetch("/wiki/static/contribution-history.json", {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Contribution history could not be loaded.");
    const history = (await response.json()) as ContributionHistory;
    if (
      history.schemaVersion !== 1 ||
      !Array.isArray(history.contributors) ||
      !Array.isArray(history.contributions)
    ) {
      throw new Error("Contribution history is invalid.");
    }
    if (view === "leaderboard") renderLeaderboard(root, history);
    else renderRecentChanges(root, history);
  } catch (error) {
    root.replaceChildren(
      element(
        "p",
        "contribution-history-error",
        error instanceof Error
          ? error.message
          : "Contribution history could not be loaded.",
      ),
    );
  }
}

document.addEventListener("nav", initializeContributionHistory);
