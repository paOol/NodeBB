'use strict';

const api = require('../regretful/api');

module.exports = function (app, middleware) {
    // Mount the regretful API under /api/regretful
    // Don't use buildHeader for API endpoints - only JSON responses needed
    app.use('/api/regretful', api);
};