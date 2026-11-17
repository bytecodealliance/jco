/**
 * Remove statements from every `.js` file under a directory, in place.
 *
 * usage: node strip.mjs <dir> [--labels=DEBUG,SAFETY] [--calls=debugLog,_debugLog]
 *
 * `--labels` removes statements carrying one of the labels (`DEBUG: stmt;`).
 * `--calls` removes expression statements that only call one of the named
 * functions, which stands in for labels in code that does not carry them yet.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(new URL('../../../../node_modules/.pnpm/node_modules/', import.meta.url));
const acorn = require('acorn');
const walk = require('acorn-walk');

const [directory, ...flags] = process.argv.slice(2);

/**
 * Read a comma-separated flag.
 *
 * @param {string} name - flag name, without dashes
 * @returns {Set<string>} its values, empty when the flag is absent
 */
const flag = (name) =>
    new Set(
        flags
            .find((value) => value.startsWith(`--${name}=`))
            ?.slice(name.length + 3)
            .split(',') ?? [],
    );
const labels = flag('labels');
const calls = flag('calls');

let removed = 0;
for (const file of readdirSync(directory, { recursive: true })) {
    if (!file.endsWith('.js')) {
        continue;
    }
    const path = join(directory, file);
    const source = readFileSync(path, 'utf8');
    const program = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });

    // Collect the ranges to drop; an outer range covers any it contains.
    const ranges = [];
    walk.simple(program, {
        LabeledStatement(node) {
            if (labels.has(node.label.name)) {
                ranges.push([node.start, node.end]);
            }
        },
        ExpressionStatement(node) {
            const { expression } = node;
            if (
                expression.type === 'CallExpression' &&
                expression.callee.type === 'Identifier' &&
                calls.has(expression.callee.name)
            ) {
                ranges.push([node.start, node.end]);
            }
        },
    });
    ranges.sort((left, right) => left[0] - right[0]);

    let output = '';
    let position = 0;
    for (const [start, end] of ranges) {
        if (start < position) {
            continue;
        }

        // An empty statement keeps `if (x) DEBUG: log();` valid.
        output += `${source.slice(position, start)};`;
        position = end;
        removed++;
    }
    writeFileSync(path, output + source.slice(position));
}
console.error(`removed ${removed} statements under ${directory}`);
