import { createRequire } from 'module'; import { CHAPTERS } from '../client/src/storydata.js';
const require = createRequire(import.meta.url); const S = require('../server/story.js'); let bad = 0;
if (CHAPTERS.length !== S.CHAPTERS.length) { console.log('chapter count mismatch'); bad++; }
CHAPTERS.forEach((c, i) => c.steps.forEach((s, j) => { const t = S.CHAPTERS[i].steps[j]; if (!t || t[0] !== s.id || t[1] !== s.need) { console.log('MISMATCH', c.id, s.id, t); bad++; } }));
if (bad) process.exit(1); console.log('story script matches server (' + CHAPTERS.reduce((a, c) => a + c.steps.length, 0) + ' steps)');
