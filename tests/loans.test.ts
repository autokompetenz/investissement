/**
 * Domain tests, phase 6.
 *
 * They cover the arithmetic and the rules that must not drift: the schedule of
 * a loan, the replay of the balance, the transitions of the operations and the
 * rate limiter. None of them needs a browser.
 *
 * Run with:  npm run test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildSchedule, summariseSchedule } from "../src/services/loans.ts";
import type { Loan } from "../src/types/index.ts";

const round2 = (value: number) => Math.round(value * 100) / 100;

const totalPrincipal = (items: { principal: number }[]) =>
  round2(items.reduce((sum, item) => sum + item.principal, 0));

test("the schedule always adds up to the amount granted", () => {
  const cases: [number, number, number][] = [
    [80_000, 6.5, 24],
    [100_000, 0, 12],
    [50_000, 12, 36],
    [1_000, 6.5, 7],
    [750, 4.2, 5],
  ];

  for (const [principal, rate, months] of cases) {
    const schedule = buildSchedule({ principal, annualRate: rate, months });
    assert.equal(schedule.length, months);
    assert.equal(
      totalPrincipal(schedule),
      principal,
      `${principal} @ ${rate}% over ${months} months must add up`,
    );
  }
});

test("every instalment is principal plus interest, to the cent", () => {
  const schedule = buildSchedule({ principal: 80_000, annualRate: 6.5, months: 24 });

  for (const item of schedule) {
    assert.equal(item.installment, round2(item.principal + item.interest));
  }
});

test("a zero rate produces no interest at all", () => {
  const schedule = buildSchedule({ principal: 12_000, annualRate: 0, months: 12 });

  for (const item of schedule) {
    assert.equal(item.interest, 0);
  }
  assert.equal(
    round2(schedule.reduce((sum, item) => sum + item.installment, 0)),
    12_000,
  );
});

test("the due dates advance one month at a time", () => {
  const start = new Date("2026-04-22T00:00:00.000Z");
  const schedule = buildSchedule({
    principal: 10_000,
    annualRate: 5,
    months: 3,
    startDate: start,
  });

  assert.equal(schedule[0].dueDate, "2026-05-22T00:00:00.000Z");
  assert.equal(schedule[1].dueDate, "2026-06-22T00:00:00.000Z");
  assert.equal(schedule[2].dueDate, "2026-07-22T00:00:00.000Z");
});

test("the schedule refuses impossible terms instead of producing NaN", () => {
  assert.throws(() => buildSchedule({ principal: 0, annualRate: 5, months: 12 }));
  assert.throws(() => buildSchedule({ principal: -100, annualRate: 5, months: 12 }));
  assert.throws(() => buildSchedule({ principal: 1000, annualRate: 5, months: 0 }));
  assert.throws(() => buildSchedule({ principal: 1000, annualRate: -5, months: 12 }));
});

test("summariseSchedule counts what is paid and what is left", () => {
  const schedule = buildSchedule({ principal: 10_000, annualRate: 0, months: 4 });
  const loan = {
    schedule: [
      { ...schedule[0], status: "PAID" },
      { ...schedule[1], status: "PAID" },
      schedule[2],
      schedule[3],
    ],
  } as Loan;

  const summary = summariseSchedule(loan);

  assert.equal(summary.paid, 5_000);
  assert.equal(summary.outstandingPrincipal, 5_000);
  assert.equal(summary.remaining, 5_000);
  assert.equal(summary.nextDue?.index, 3);
});

test("a fully paid loan has nothing left and no next due date", () => {
  const schedule = buildSchedule({ principal: 4_000, annualRate: 0, months: 4 });
  const loan = {
    schedule: schedule.map((item) => ({ ...item, status: "PAID" as const })),
  } as Loan;

  const summary = summariseSchedule(loan);

  assert.equal(summary.outstandingPrincipal, 0);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.nextDue, undefined);
});
