'use strict';

const meta = require('../meta');

const defaults = {
    enableAIUsers: true,
    createUsersInterval: 86400000, // 24 hours in ms
    createThreadsInterval: 21600000, // 6 hours in ms
    createRepliesInterval: 7200000  // 2 hours in ms
};

const Settings = module.exports;

Settings.get = async function () {
    const settings = await meta.settings.get('regretful');
    return Object.assign({}, defaults, settings);
};