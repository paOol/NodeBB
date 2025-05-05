'use strict';

require('./app');

// scripts-client.js is generated during build, it contains javascript files
// from plugins that add files to "scripts" block in plugin.json
require('../scripts-client');

// Load custom code
require('./client/custom/hide-users-link');

app.onDomReady();
