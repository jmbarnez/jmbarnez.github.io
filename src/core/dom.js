// DOM and utility helpers

export const $ = (id) => document.getElementById(id);
export const $$ = (selector) => document.querySelectorAll(selector);
export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));


