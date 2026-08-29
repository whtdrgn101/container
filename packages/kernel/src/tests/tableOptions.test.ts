import { describe, expect, it } from 'vitest';
import type { TableOptionSpec } from '../contracts/tableOptions';
import { defaultTableOptions, resolveTableOptions } from '../contracts/tableOptions';

// Table options (kernel 1.5.0) are the contract's own validation rule — a host, a second host, and a
// game's tests all call these two functions, so every branch is gated here at the kernel's 100% bar:
// the undeclared-id reject, both type rejects, the `in`-vs-undefined distinction, and the defaults path.

/** A two-option game, one of each type — the shape Euchre and Spades both declare. */
const SPECS: readonly TableOptionSpec[] = [
  { id: 'stickTheDealer', label: 'Stick the dealer', type: 'boolean', default: false },
  {
    id: 'target',
    label: 'Play to',
    type: 'choice',
    default: '10',
    choices: [
      { value: '10', label: '10 points' },
      { value: '11', label: '11 points' },
    ],
  },
];

describe('defaultTableOptions', () => {
  it('returns every declared option at its declared default', () => {
    expect(defaultTableOptions(SPECS)).toEqual({ stickTheDealer: false, target: '10' });
  });

  it('is empty for a game that declares none — the six hosted games predating this feature', () => {
    expect(defaultTableOptions(undefined)).toEqual({});
    expect(defaultTableOptions([])).toEqual({});
  });
});

describe('resolveTableOptions', () => {
  it('fills every unpicked option with its default, so the record reaching createGame is complete', () => {
    const result = resolveTableOptions(SPECS, { stickTheDealer: true });
    expect(result).toEqual({ ok: true, options: { stickTheDealer: true, target: '10' } });
  });

  it('honours a full set of picks', () => {
    const result = resolveTableOptions(SPECS, { stickTheDealer: true, target: '11' });
    expect(result).toEqual({ ok: true, options: { stickTheDealer: true, target: '11' } });
  });

  it('treats absent picks as all-defaults', () => {
    expect(resolveTableOptions(SPECS, undefined)).toEqual({
      ok: true,
      options: { stickTheDealer: false, target: '10' },
    });
  });

  it('rejects an id the game never declared — the check that guards a game with no options at all', () => {
    expect(resolveTableOptions(SPECS, { nope: true })).toEqual({
      ok: false,
      message: 'Unknown table option "nope"',
    });
    expect(resolveTableOptions(undefined, { anything: 'x' })).toEqual({
      ok: false,
      message: 'Unknown table option "anything"',
    });
  });

  it('accepts an empty pick set for a game with no options', () => {
    expect(resolveTableOptions(undefined, {})).toEqual({ ok: true, options: {} });
  });

  it('rejects a non-boolean for a boolean option', () => {
    expect(resolveTableOptions(SPECS, { stickTheDealer: 'true' })).toEqual({
      ok: false,
      message: 'Table option "stickTheDealer" must be true or false',
    });
  });

  it('rejects a value outside a choice option, naming what was allowed', () => {
    expect(resolveTableOptions(SPECS, { target: '12' })).toEqual({
      ok: false,
      message: 'Table option "target" must be one of: 10, 11',
    });
  });

  it('rejects a non-string for a choice option', () => {
    expect(resolveTableOptions(SPECS, { target: 10 })).toEqual({
      ok: false,
      message: 'Table option "target" must be one of: 10, 11',
    });
  });

  it('treats an explicit undefined as a malformed pick, not an omission', () => {
    // `in` rather than `!== undefined`: `{ stickTheDealer: undefined }` reached the host as a key, so
    // it is a bad value rather than a seat that declined to choose — it must fail, not silently default.
    expect(resolveTableOptions(SPECS, { stickTheDealer: undefined })).toEqual({
      ok: false,
      message: 'Table option "stickTheDealer" must be true or false',
    });
  });
});
