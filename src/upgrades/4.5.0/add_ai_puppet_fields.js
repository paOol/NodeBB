'use strict';

const db = require('../../database');
const batch = require('../../batch');

module.exports = {
    name: 'Add ai_puppet and ai_identity_prompt fields to user schema',
    timestamp: Date.UTC(2025, 4, 6), // May 6, 2025
    method: async function () {
        const { progress } = this;

        await batch.processSortedSet('users:joindate', async (uids) => {
            progress.incr(uids.length);

            // Add the AI puppet fields to all users with default values
            const bulkSet = [];
            uids.forEach((uid) => {
                bulkSet.push([`user:${uid}`, {
                    ai_puppet: 0, // false by default (using 0 for boolean false)
                    ai_identity_prompt: '', // empty string by default
                }]);
            });

            await db.setObjectBulk(bulkSet);
        }, {
            batch: 500,
            progress: progress,
        });
    },
};