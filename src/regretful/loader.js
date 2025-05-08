'use strict';

const winston = require('winston');
const nconf = require('nconf');
const regretful = require('./index');

exports.init = async function (params) {
    // Only initialize on primary process in cluster mode
    if (!nconf.get('isPrimary')) {
        return;
    }
    
    if (nconf.get('runJobs')) {
        winston.verbose('[regretful/loader] Initializing regretful parents module');
        regretful.init();
    }
    
    return {
        regretful: regretful
    };
};