const DEFAULT_CONTEXT_LINES = 3;
export const MAX_HUMAN_DIFF_CHARACTERS = 24_000;
const MAX_MYERS_EDIT_DISTANCE = 500;

function sourceLines(source) {
  const lines = String(source).split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
}

function mapValue(map, key) {
  return map.get(key) ?? Number.NEGATIVE_INFINITY;
}

function backtrack(trace, oldLines, newLines) {
  let oldIndex = oldLines.length;
  let newIndex = newLines.length;
  const operations = [];

  for (let distance = trace.length - 1; distance >= 0; distance -= 1) {
    const frontier = trace[distance];
    const diagonal = oldIndex - newIndex;
    const previousDiagonal = diagonal === -distance
      || (diagonal !== distance
        && mapValue(frontier, diagonal - 1) < mapValue(frontier, diagonal + 1))
      ? diagonal + 1
      : diagonal - 1;
    const previousOldIndex = distance === 0 ? 0 : mapValue(frontier, previousDiagonal);
    const previousNewIndex = distance === 0 ? 0 : previousOldIndex - previousDiagonal;

    while (oldIndex > previousOldIndex && newIndex > previousNewIndex) {
      operations.push({ type: 'equal', line: oldLines[oldIndex - 1] });
      oldIndex -= 1;
      newIndex -= 1;
    }
    if (distance === 0) break;
    if (oldIndex === previousOldIndex) {
      operations.push({ type: 'insert', line: newLines[newIndex - 1] });
      newIndex -= 1;
    } else {
      operations.push({ type: 'delete', line: oldLines[oldIndex - 1] });
      oldIndex -= 1;
    }
  }
  return operations.reverse();
}

function coarseOperations(oldLines, newLines) {
  let prefixLength = 0;
  while (prefixLength < oldLines.length
      && prefixLength < newLines.length
      && oldLines[prefixLength] === newLines[prefixLength]) {
    prefixLength += 1;
  }
  let suffixLength = 0;
  while (suffixLength < oldLines.length - prefixLength
      && suffixLength < newLines.length - prefixLength
      && oldLines[oldLines.length - suffixLength - 1] === newLines[newLines.length - suffixLength - 1]) {
    suffixLength += 1;
  }
  return [
    ...oldLines.slice(0, prefixLength).map(line => ({ type: 'equal', line })),
    ...oldLines.slice(prefixLength, oldLines.length - suffixLength).map(line => ({ type: 'delete', line })),
    ...newLines.slice(prefixLength, newLines.length - suffixLength).map(line => ({ type: 'insert', line })),
    ...oldLines.slice(oldLines.length - suffixLength).map(line => ({ type: 'equal', line })),
  ];
}

function lineOperations(oldSource, newSource) {
  const oldLines = sourceLines(oldSource);
  const newLines = sourceLines(newSource);
  const maximumDistance = oldLines.length + newLines.length;
  let frontier = new Map([[1, 0]]);
  const trace = [];

  for (let distance = 0; distance <= maximumDistance; distance += 1) {
    if (distance > MAX_MYERS_EDIT_DISTANCE) return coarseOperations(oldLines, newLines);
    trace.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let oldIndex;
      if (diagonal === -distance
          || (diagonal !== distance
            && mapValue(frontier, diagonal - 1) < mapValue(frontier, diagonal + 1))) {
        oldIndex = mapValue(frontier, diagonal + 1);
      } else {
        oldIndex = mapValue(frontier, diagonal - 1) + 1;
      }
      let newIndex = oldIndex - diagonal;
      while (oldIndex < oldLines.length
          && newIndex < newLines.length
          && oldLines[oldIndex] === newLines[newIndex]) {
        oldIndex += 1;
        newIndex += 1;
      }
      frontier.set(diagonal, oldIndex);
      if (oldIndex >= oldLines.length && newIndex >= newLines.length) {
        return backtrack(trace, oldLines, newLines);
      }
    }
  }
  return coarseOperations(oldLines, newLines);
}

function numberedRecords(operations) {
  let oldLine = 1;
  let newLine = 1;
  return operations.map(operation => {
    const record = { ...operation, oldLine, newLine };
    if (operation.type !== 'insert') oldLine += 1;
    if (operation.type !== 'delete') newLine += 1;
    return record;
  });
}

function hunkRanges(records, contextLines) {
  const ranges = [];
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].type === 'equal') continue;
    const start = Math.max(0, index - contextLines);
    const end = Math.min(records.length, index + contextLines + 1);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
    else ranges.push({ start, end });
  }
  return ranges;
}

function coordinate(start, count) {
  return `${start},${count}`;
}

function formatUnifiedDiff(oldSource, newSource, path, contextLines) {
  const records = numberedRecords(lineOperations(oldSource, newSource));
  const output = [`--- a/${path}`, `+++ b/${path}`];
  for (const range of hunkRanges(records, contextLines)) {
    const before = records.slice(0, range.start);
    const hunk = records.slice(range.start, range.end);
    const oldBefore = before.filter(record => record.type !== 'insert').length;
    const newBefore = before.filter(record => record.type !== 'delete').length;
    const oldCount = hunk.filter(record => record.type !== 'insert').length;
    const newCount = hunk.filter(record => record.type !== 'delete').length;
    const oldStart = oldCount === 0 ? oldBefore : oldBefore + 1;
    const newStart = newCount === 0 ? newBefore : newBefore + 1;
    output.push(`@@ -${coordinate(oldStart, oldCount)} +${coordinate(newStart, newCount)} @@`);
    for (const record of hunk) {
      const prefix = record.type === 'equal' ? ' ' : record.type === 'delete' ? '-' : '+';
      output.push(`${prefix}${record.line}`);
    }
  }
  return output.join('\n');
}

function truncateDiff(diff, limit) {
  if (diff.length <= limit) return { text: diff, truncated: false };
  const marker = '\n... [human-readable diff truncated] ...\n';
  const available = Math.max(0, limit - marker.length);
  const desiredHeadLength = Math.ceil(available * 0.6);
  const desiredTailStart = diff.length - (available - desiredHeadLength);
  const headBreak = diff.lastIndexOf('\n', desiredHeadLength);
  const tailBreak = diff.indexOf('\n', desiredTailStart);
  const headEnd = headBreak > 0 ? headBreak : desiredHeadLength;
  const tailStart = tailBreak >= 0 ? tailBreak + 1 : desiredTailStart;
  return {
    text: `${diff.slice(0, headEnd)}${marker}${diff.slice(tailStart)}`,
    truncated: true,
  };
}

export function createUnifiedDiff(oldSource, newSource, path, {
  contextLines = DEFAULT_CONTEXT_LINES,
  maxCharacters = MAX_HUMAN_DIFF_CHARACTERS,
} = {}) {
  if (!Number.isInteger(contextLines) || contextLines < 0) throw new Error('Diff context must be a non-negative integer.');
  if (!Number.isInteger(maxCharacters) || maxCharacters < 200) throw new Error('Diff size limit is too small.');
  return truncateDiff(formatUnifiedDiff(oldSource, newSource, path, contextLines), maxCharacters);
}
