"use strict";

// Lightweight per-scan timing logs.
//
//   [SCAN a1b2c3] OCR completed: 4210 ms
//
// Logs are on by default (one short line per stage, about 12 lines per
// scan). Set SCAN_PERF_LOGS=false to silence them.

const ENABLED = process.env.SCAN_PERF_LOGS !== "false";

let counter = 0;

const createScanTimer = () => {
    counter += 1;

    const id = `${Date.now().toString(36).slice(-4)}${counter}`;
    const startedAt = Date.now();
    const marks = {};

    const log = (message) => {
        if (ENABLED) {
            console.log(`[SCAN ${id}] ${message}`);
        }
    };

    return {
        id,
        log,
        elapsed: () => Date.now() - startedAt,

        // const done = timer.stage("nutrition"); ...; done();
        stage(name, extra = "") {
            const t0 = Date.now();

            log(`${name} started`);

            return (detail = "") => {
                const ms = Date.now() - t0;

                marks[name] = ms;

                const suffix = [extra, detail].filter(Boolean).join(", ");

                log(`${name} completed: ${ms} ms${suffix ? ` (${suffix})` : ""}`);

                return ms;
            };
        },

        // Time an async function.
        async time(name, fn) {
            const done = this.stage(name);

            try {
                return await fn();
            } finally {
                done();
            }
        },

        total(detail = "") {
            const summary = Object.entries(marks)
                .map(([name, ms]) => `${name}=${ms}`)
                .join(" ");

            log(`TOTAL: ${Date.now() - startedAt} ms${detail ? ` (${detail})` : ""}${summary ? ` [${summary}]` : ""}`);
        },
    };
};

// Thrown between pipeline stages when the HTTP client has gone away
// (timeout / closed tab), so a dead request stops using CPU and Groq quota.
const throwIfAborted = (signal) => {
    if (signal && signal.aborted) {
        const error = new Error("Scan cancelled: client disconnected");

        error.code = "SCAN_ABORTED";

        throw error;
    }
};

module.exports = {
    createScanTimer,
    throwIfAborted,
};