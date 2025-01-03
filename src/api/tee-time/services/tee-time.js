'use strict';

/**
 * tee-time service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::tee-time.tee-time');
